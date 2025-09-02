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

Response times for each request are recorded as `rate_<rate>.txt` inside either `output_without_autoscale` or `output_with_autoscale` based on the chosen mode. After the run completes, a `# SUMMARY` block with min/max/avg and percentiles is appended to the same file and, if enabled in `source_code/config.json`, printed to the console.

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
