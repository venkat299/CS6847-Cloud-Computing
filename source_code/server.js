const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Load config (optional)
const configPath = path.join(__dirname, 'config.json');
let config = { server: { consoleLogging: false } };
try {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  config = {
    ...config,
    ...parsed,
    server: { ...(config.server || {}), ...((parsed && parsed.server) || {}) },
  };
} catch (_) {
  // Use defaults if config file missing or invalid
}

function log(...args) {
  if (!config.server || config.server.consoleLogging !== true) return;
  const ts = new Date().toISOString();
  console.log(ts, '-', ...args);
}

function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

app.get('/fib', (req, res) => {
  const n = parseInt(req.query.n, 10) || 10;
  log('FIB start', `n=${n}`, `pid=${process.pid}`);
  const start = process.hrtime.bigint();
  const result = fib(n);
  const duration = Number(process.hrtime.bigint() - start) / 1e6; // milliseconds
  log('FIB done', `n=${n}`, `durationMs=${duration.toFixed(2)}`, `pid=${process.pid}`);
  res.json({ input: n, result, durationMs: duration, pid: process.pid });
});

// Simulated I/O-bound endpoint: repeatedly read a small file.
// Query params:
// - count: how many reads to perform (default 100)
// - parallel: how many concurrent reads per batch (default 1)
app.get('/io', async (req, res) => {
  const count = Math.max(1, parseInt(req.query.count, 10) || 100);
  const parallel = Math.max(1, parseInt(req.query.parallel, 10) || 1);
  const filePath = path.join(__dirname, 'sample-data.txt');
  log('IO start', `count=${count}`, `parallel=${parallel}`, `file=${path.basename(filePath)}`, `pid=${process.pid}`);

  const start = process.hrtime.bigint();
  let completed = 0;
  let totalBytes = 0;

  try {
    while (completed < count) {
      const batch = Math.min(parallel, count - completed);
      const tasks = Array.from({ length: batch }, () => fs.promises.readFile(filePath));
      const results = await Promise.all(tasks);
      totalBytes += results.reduce((sum, buf) => sum + buf.length, 0);
      completed += batch;
    }
    const duration = Number(process.hrtime.bigint() - start) / 1e6; // ms
    log('IO done', `count=${count}`, `parallel=${parallel}`, `bytes=${totalBytes}`, `durationMs=${duration.toFixed(2)}`, `pid=${process.pid}`);
    res.json({ count, parallel, bytesRead: totalBytes, durationMs: duration, pid: process.pid });
  } catch (err) {
    log('IO error', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  log('HEALTHCHECK', req.method, req.url);
  res.send('Fibonacci + IO server is running');
});

app.listen(port, () => {
  log(`Server listening on port ${port}`);
});
