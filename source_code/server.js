const express = require('express');
const fs = require('fs');
const path = require('path');
const cluster = require('cluster');
const os = require('os');
const app = express();
const port = process.env.PORT || 3000;

// Load default strings for the /reverse endpoint
const defaultStringsPath = path.join(__dirname, '..', 'data', 'input-strings.txt');
let defaultStrings = [];
try {
  const content = fs.readFileSync(defaultStringsPath, 'utf8');
  const matches = content.match(/^Original:\s*(.*)$/gm) || [];
  defaultStrings = matches.map((line) => line.replace(/^Original:\s*/, ''));
} catch (err) {
  // If the file is missing, defaultStrings remains empty
}

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

// Reverse a provided string via query param `input`
// If no input is provided, return reversals for default strings
app.get('/reverse', (req, res) => {
  const { input } = req.query;
  if (typeof input === 'string' && input.length > 0) {
    const reversed = input.split('').reverse().join('');
    res.json({ original: input, reversed });
  } else {
    const results = defaultStrings.map((s) => ({
      original: s,
      reversed: s.split('').reverse().join(''),
    }));
    res.json({ results });
  }
});

app.get('/', (req, res) => {
  log('HEALTHCHECK', req.method, req.url);
  res.send('Fibonacci + IO server is running');
});

// Optional multi-process cluster for higher concurrency.
// Enable by setting env CLUSTER_WORKERS (or WEB_CONCURRENCY) to >1.
const workers = Math.max(1, Number(process.env.CLUSTER_WORKERS || process.env.WEB_CONCURRENCY || '1') || 1);

if (cluster.isPrimary && workers > 1) {
  // Minimal logging from primary to avoid noise at high RPS
  const cpuCount = os.cpus()?.length || 1;
  console.log(`[cluster] primary pid=${process.pid} starting ${workers} workers (cpus=${cpuCount})`);
  for (let i = 0; i < workers; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    console.log(`[cluster] worker ${worker.process.pid} exited; starting a replacement`);
    cluster.fork();
  });
} else {
  app.listen(port, () => {
    log(`Server listening on port ${port}`);
  });
}
