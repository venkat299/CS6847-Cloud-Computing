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
The server exposes `/fib?n=35` on port `3000` and performs a CPU-intensive Fibonacci computation.

### Run the client
```bash
npm run client -- <rate> [duration] [url]
```
- `rate`: requests per second (default 10)
- `duration`: number of seconds to run (default 60)
- `url`: target URL (default `http://localhost:3000/fib`)

Response times for each request are recorded in `rate_<rate>.txt`.

### Build the Docker image
```bash
docker build -t fibonacci-server source_code
```

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

