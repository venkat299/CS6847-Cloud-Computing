# CS6847-Cloud-Computing

This repository provides a sample setup for evaluating Kubernetes horizontal pod autoscaling using Node.js.

## Contents

- `source_code/` – Node.js server.
- `k8s/` – Example Kubernetes manifests for deployment, service, and HPA.
- `docker-compose.yml` – Docker Swarm stack file running three replicas of the server.
- `output_dockerswarm/` – Sample response time logs from Docker Swarm (no autoscale).
- `output_kubernetes/` – Sample response time logs from Kubernetes with an HPA.
- `client.js` – Rate-based load client that targets the `/reverse` endpoint and sustains a fixed RPS for 60 seconds.
- `Output.txt` – Aggregated averages for each test rate.
- `Report.pdf` – Placeholder report for the assignment.

## Getting Started

### Install dependencies
```bash
cd source_code
npm install
```

### Run the server
```bash
npm start
```
The server exposes three endpoints on port `3000`:
- `/fib?n=35` – CPU-intensive Fibonacci computation (default `n=35`).
- `/io?count=100&parallel=1` – I/O-bound simulation that repeatedly reads a bundled small file.
- `/reverse?input=...` – String reversal API. Returns JSON `{ original, reversed }`.

Console logging for the server is disabled by default. Enable it in `source_code/config.json` to see timestamped start/finish/duration logs for requests.

### String reversal endpoint examples
Quick tests with `curl`:
```bash
curl 'http://localhost:3000/reverse?input=hello'
# {"original":"hello","reversed":"olleh"}

curl 'http://localhost:3000/reverse' # empty input
# {"original":"","reversed":""}
```

### Console logging configuration
`source_code/config.json` controls console logging for the server (disabled by default):
```
{
  "server": { "consoleLogging": false }
}
```
- Set `server.consoleLogging` to `true` to enable server logs.
- For high-throughput tests, keep it `false` to avoid I/O overhead.

### Build the Docker image
```bash
docker build -t server source_code
```

Note: The image includes `sample-data.txt` used by the `/io` endpoint.

### Run with Docker Swarm (3 replicas)
The included `docker-compose.yml` is a Swarm stack file that runs three replicas of the server.

1) Ensure Swarm is active (initialize if needed):
```bash
docker info --format '{{.Swarm.LocalNodeState}}'   # expect: active
# If not active, initialize this node as a manager
docker swarm init
```

2) Build the image locally (stacks ignore `build:`):
```bash
docker build -t server:latest source_code
```

3) Deploy the stack (use `--detach=false` to watch tasks converge):
```bash
docker stack deploy --detach=false -c docker-compose.yml fib-stack
```

4) Verify and test:
```bash
docker service ls                     # should show fib-stack_server with 3/3 replicas
curl 'http://localhost:3000/reverse?input=hello'
```

5) Cleanup (optional):
```bash
docker stack rm fib-stack
docker swarm leave --force            # only if you want to leave Swarm
```

Troubleshooting:
- Error: "this node is not a swarm manager" → run `docker swarm init` (or join an existing swarm).
- Info: "Since --detach=false was not specified…" → not an error; add `--detach=false` to wait.

Use the Node.js client to target the Swarm service, e.g.:
```bash
node client.js http://localhost:3000 dockerswarm 10
```
Note: The stack file sets a high `nofile` ulimit and enables `CLUSTER_WORKERS=2` per container to increase per‑instance throughput. Scale replicas and/or workers to push higher.

### Run without Swarm (single container)
If you only need one replica locally:
```bash
docker build -t server:latest source_code
docker run --rm -p 3000:3000 server:latest
```
Note: Scaling multiple replicas on one host port requires Swarm or a load balancer.

### Kubernetes deployment with autoscaling
The manifests in `k8s/` now set the initial replica count to 3 and the
HorizontalPodAutoscaler scales between 3 and 10 pods based on CPU
utilization:
```bash
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/hpa.yaml
```
Generate timing files against the cluster with:
```bash
node client.js <service-url> kubernetes 10
```

### Visualize results
An HTML/JS dashboard at `viz/index.html` plots three line charts using the unified `viz/summary.tsv`:
- Throughput: achieved RPS vs planned RPS
- Reliability: success rate (%) vs planned RPS
- Latency: p95 latency (ms) vs planned RPS

Open it via a local HTTP server so the browser can fetch the TSV file, e.g. from the repo root:
```bash
# Option A: Python
python3 -m http.server 8000
# Option B: Node (if installed globally)
npx http-server -p 8000 .
```
Then visit `http://localhost:8000/viz/`. You can adjust the TSV path in the input and click Reload. The dashboard splits the data by `mode` (dockerswarm/kubernetes) and plots both lines on each chart.

### Node.js client for string reversal outputs
Use the Node.js script to generate the required files. It sustains the requested rate for 60 seconds and appends a summary row to `viz/summary.tsv`:
```bash
# Format: node client.js <base-url> <dockerswarm|kubernetes> <10|100|1000|10000|100000>

# Docker Swarm, sustain ~10/100/1000/10000/100000 rps for 60s
node client.js http://localhost:3000 dockerswarm 10
node client.js http://localhost:3000 dockerswarm 100
node client.js http://localhost:3000 dockerswarm 1000
node client.js http://localhost:3000 dockerswarm 10000
node client.js http://localhost:3000 dockerswarm 100000   # extremely heavy

# Kubernetes, sustain ~10/100/... rps for 60s (replace <SERVICE_URL>)
node client.js <SERVICE_URL> kubernetes 10
node client.js <SERVICE_URL> kubernetes 100
node client.js <SERVICE_URL> kubernetes 1000
node client.js <SERVICE_URL> kubernetes 10000
node client.js <SERVICE_URL> kubernetes 100000          # extremely heavy
```
Notes:
- Each run aims for 60 seconds; summary includes planned vs achieved RPS and latency percentiles.
- Output files include up to 10 sample `Original/Reversed` pairs plus the average response time to keep files manageable.
- Very high rates (>= 10k rps, especially 100k rps) demand significant client/server capacity, high `ulimit -n`, and low server logging. Actual achieved RPS depends on your environment and network.

## High-Throughput Setup (ulimit, logging, capacity)

- Low server logging: leave `source_code/config.json` as `consoleLogging: false` during load — per-request logs can dominate I/O.
- Raise file descriptor limit (current shell): `ulimit -n 1048576`. Wrapper scripts do this for the child process:
  - Server: `./scripts/run-server-highcap.sh`
  - Client: `./scripts/run-client-highcap.sh <base-url> <dockerswarm|kubernetes> <rate>`
  - macOS may also require increasing system-wide limits via `launchctl limit maxfiles` (consult OS docs).
- Server capacity options:
  - Multi-process Node: set `CLUSTER_WORKERS` to use multiple CPU cores (supported by the server). Example: `CLUSTER_WORKERS=4 ./scripts/run-server-highcap.sh`.
  - Docker Swarm: `docker service scale fib-stack_server=6` and keep the included `ulimits.nofile` settings.
  - Kubernetes: bump pod CPU resources (defaults now 500m request, 1000m limit), adjust `CLUSTER_WORKERS`, and widen HPA range if needed.
  - Keep `NODE_ENV=production` (set in Docker/K8s manifests).

### Kubernetes manifests
The `k8s` directory contains:
- `deployment.yaml`
- `service.yaml`
- `hpa.yaml`

Update the image reference in `deployment.yaml` before applying:
```bash
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
```

These files demonstrate how to deploy the server, expose it via a LoadBalancer, and enable horizontal pod autoscaling targeting 50% CPU utilization.

## Run on Local Kubernetes (Mac)

You can complete the full evaluation locally using Docker Desktop's built‑in Kubernetes or Minikube.

### Option A: Docker Desktop Kubernetes
1) Enable Kubernetes in Docker Desktop Settings, then verify:
```bash
kubectl get nodes
```

2) Build the image locally (already done above) and ensure the deployment uses it. This repo's `k8s/deployment.yaml` is configured to use `image: server:latest` with `imagePullPolicy: IfNotPresent`.

3) Deploy (without autoscaling first):
```bash
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl get pods -w
```

4) Access the service locally via port‑forward:
```bash
kubectl port-forward svc/server-service 3000:80
# In another terminal, test:
curl 'http://localhost:3000/fib?n=35'
```

5) Run the string reversal client for baseline (no autoscale):
```bash
node client.js http://localhost:3000 dockerswarm 10
```

6) Install metrics for HPA if not present:
```bash
# Check if metrics are available
kubectl top pods || true
# If it fails, install metrics-server (accept defaults)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

7) Enable autoscaling and observe:
```bash
kubectl apply -f k8s/hpa.yaml
kubectl get hpa -w &
kubectl get pods -w &
```

8) After enabling autoscale, run the client again:
```bash
node client.js http://localhost:3000 kubernetes 10
```

9) Visualize results:
```bash
cd ..
python3 -m http.server 8000
# Open http://localhost:8000/viz/ in your browser
```

10) Cleanup:
```bash
kubectl delete -f k8s/hpa.yaml -f k8s/service.yaml -f k8s/deployment.yaml
```

Notes:
- Keep `resources.requests.cpu` in the deployment to allow CPU‑based HPA.
- The CPU‑bound endpoint is `/fib?n=35`; keep `n` constant across runs for fair comparison.

### Option B: Minikube
1) Start and enable metrics:
```bash
minikube start
minikube addons enable metrics-server
```

2) Build and load the image into Minikube:
```bash
docker build -t server:latest source_code
minikube image load server:latest
```

3) Apply manifests and access the service:
```bash
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/deployment.yaml
# Get a URL reachable from your Mac
minikube service server-service --url
```

4) Run `node client.js` against the printed URL for both modes (dockerswarm/kubernetes), then visualize as above.
