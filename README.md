# CS6847-Cloud-Computing

This repository provides a sample setup for evaluating Kubernetes horizontal pod autoscaling using Node.js.

## Contents

- `source_code/` – Node.js server.
- `k8s/` – Example Kubernetes manifests for deployment, service, and HPA.
- `docker-compose.yml` – Docker Swarm stack file running three replicas of the server.
- `output_dockerswarm/` – Sample response time logs from Docker Swarm (no autoscale).
- `output_kubernetes/` – Sample response time logs from Kubernetes with an HPA.
- `client.js` – Node.js client that sends strings to the `/reverse` endpoint and records response times.
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

### Build the Docker image
```bash
docker build -t server source_code
```

Note: The image includes `sample-data.txt` used by the `/io` endpoint.

### Run with Docker Swarm (3 replicas)
The included `docker-compose.yml` configures a Swarm stack with three
replicas of the server:
```bash
docker build -t server source_code
docker stack deploy -c docker-compose.yml fib-stack
# check replicas
docker service ls
```
Use the Node.js client to target the Swarm service, e.g.:
```bash
node client.js http://localhost:3000 dockerswarm 10
```

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
Use the Node.js script to generate the required files:
```bash
# Format: node client.js <base-url> <dockerswarm|kubernetes> <10|10000>

# Docker Swarm, 10 strings
node client.js http://localhost:3000 dockerswarm 10   # writes DA24C021dockerswarm10.txt
# Docker Swarm, 10000 strings
node client.js http://localhost:3000 dockerswarm 10000 # writes DA24C021dockerswarm10000.txt

# Kubernetes, 10 strings (replace <SERVICE_URL> appropriately)
node client.js <SERVICE_URL> kubernetes 10            # writes DA24C021kubernetes10.txt
# Kubernetes, 10000 strings
node client.js <SERVICE_URL> kubernetes 10000         # writes DA24C021kubernetes10000.txt
```
Latency statistics for each run are appended to `viz/summary.tsv` for visualization.

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
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
# Get a URL reachable from your Mac
minikube service server-service --url
```

4) Run `node client.js` against the printed URL for both modes (dockerswarm/kubernetes), then visualize as above.
