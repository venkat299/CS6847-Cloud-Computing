# CS6847-Cloud-Computing

This repository provides a sample setup for evaluating Kubernetes horizontal pod autoscaling using Node.js.

## Contents

- `source_code/` – Node.js server and load-generating client.
- `k8s/` – Example Kubernetes manifests for deployment, service, and HPA.
- `output_without_autoscale/` – Sample response time logs when scaling is disabled.
- `output_with_autoscale/` – Sample response time logs when using an HPA.
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
The server exposes two endpoints on port `3000`:
- `/fib?n=35` – CPU-intensive Fibonacci computation (default `n=35`).
- `/io?count=100&parallel=1` – I/O-bound simulation that repeatedly reads a bundled small file.

Console logging for server and client is disabled by default. Enable it in `source_code/config.json` to see timestamped start/finish/duration logs for requests.

### Run the client
```bash
npm run client -- <rate> [duration] [url] [mode]
```
- `rate`: requests per second (default 10)
- `duration`: number of seconds to run (default 60)
- `url`: target URL (default `http://localhost:3000/fib`).
- `mode`: choose output folder: `with` (writes to `output_with_autoscale`) or `without` (writes to `output_without_autoscale`). Defaults to `without`.

Examples:
- CPU-bound (without autoscale): `npm run client -- 20 60 http://localhost:3000/fib?n=35 without`
- I/O-bound (with autoscale): `npm run client -- 50 60 http://localhost:3000/io?count=200&parallel=4 with`

Response times for each request are recorded as `rate_<rate>.txt` inside either `output_without_autoscale` or `output_with_autoscale` based on the chosen mode. After the run completes, summary statistics (avg/min/max and p50/p90/p95/p99, plus counters and achieved RPS) are written to a unified file: `viz/summary.tsv`. The client upserts by `(mode, url, planned_rate_rps)`, keeping only the latest run per key. If enabled in `source_code/config.json`, the summary is also printed to the console.

TSV columns in `summary.tsv`:
`timestamp, mode, url, planned_rate_rps, planned_duration_sec, total_planned, completed, success, errors, wall_ms, achieved_rps, avg_ms, min_ms, p50_ms, p90_ms, p95_ms, p99_ms, max_ms`.

### Console logging configuration
`source_code/config.json` controls console logging for both server and client (disabled by default):
```
{
  "server": { "consoleLogging": false },
  "client": { "consoleLogging": false }
}
```
- Set `server.consoleLogging` to `true` to enable server logs.
- Set `client.consoleLogging` to `true` to enable client startup and summary logs.

### Build the Docker image
```bash
docker build -t fibonacci-server source_code
```

Note: The image includes `sample-data.txt` used by the `/io` endpoint.

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
Then visit `http://localhost:8000/viz/`. You can adjust the TSV path in the input and click Reload. The dashboard splits the data by `mode` (with/without autoscale) and plots both lines on each chart.

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

2) Build the image locally (already done above) and ensure the deployment uses it. This repo's `k8s/deployment.yaml` is configured to use `image: fibonacci-server:latest` with `imagePullPolicy: IfNotPresent`.

3) Deploy (without autoscaling first):
```bash
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
kubectl get pods -w
```

4) Access the service locally via port‑forward:
```bash
kubectl port-forward svc/fibonacci-service 3000:80
# In another terminal, test:
curl 'http://localhost:3000/fib?n=35'
```

5) Run the client for baseline (no autoscale):
```bash
cd source_code && npm install
npm run client -- 20 60 'http://localhost:3000/fib?n=35' without
# Repeat for other planned rates; results go to ../output_without_autoscale and viz/summary.tsv
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

8) Run the client with autoscale enabled using the same rates:
```bash
npm run client -- 20 60 'http://localhost:3000/fib?n=35' with
# Results go to ../output_with_autoscale and update viz/summary.tsv
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
docker build -t fibonacci-server:latest source_code
minikube image load fibonacci-server:latest
```

3) Apply manifests and access the service:
```bash
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
# Get a URL reachable from your Mac
minikube service fibonacci-service --url
```

4) Run client against the printed URL for both modes (without/with), then visualize as above.
