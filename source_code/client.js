const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load config (optional)
const clientConfigPath = path.join(__dirname, 'config.json');
let clientConfig = { client: { consoleLogging: false } };
try {
  const raw = fs.readFileSync(clientConfigPath, 'utf8');
  const parsed = JSON.parse(raw);
  clientConfig = {
    ...clientConfig,
    ...parsed,
    client: { ...(clientConfig.client || {}), ...((parsed && parsed.client) || {}) },
  };
} catch (_) {
  // default config is fine
}

function clog(...args) {
  if (!clientConfig.client || clientConfig.client.consoleLogging !== true) return;
  console.log(...args);
}

const rate = Number(process.argv[2]) || 10; // requests per second
const duration = Number(process.argv[3]) || 60; // seconds
const url = process.argv[4] || 'http://localhost:3000/fib';
const modeArg = (process.argv[5] || '').toLowerCase(); // 'with' | 'without'

// Resolve output directory based on mode argument.
let outputDirName;
if (modeArg === 'with') {
  outputDirName = 'output_with_autoscale';
} else if (modeArg === 'without' || modeArg === '') {
  // Default to 'without' if not specified, to avoid ambiguity.
  outputDirName = 'output_without_autoscale';
} else {
  clog(`Unknown mode '${modeArg}'. Use 'with' or 'without'. Defaulting to 'without'.`);
  outputDirName = 'output_without_autoscale';
}

const outputDir = path.join(__dirname, '..', outputDirName);
try { fs.mkdirSync(outputDir, { recursive: true }); } catch {}

const outfile = path.join(outputDir, `rate_${rate}.txt`);
const summaryFile = path.join(outputDir, 'summary.tsv');
clog(`[client] Writing latencies to ${outfile}`);
const stream = fs.createWriteStream(outfile, { flags: 'w' });

// Tracking stats
const latencies = [];
let errors = 0;
let sent = 0;
let completed = 0;
let inflight = 0;
const totalPlanned = rate * duration;
const startedAt = Date.now();

function nearestRank(sorted, p) {
  if (!sorted.length) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

function computeSummary() {
  const success = latencies.length;
  const wallMs = Date.now() - startedAt;
  const wallSec = wallMs / 1000;
  const achievedRps = wallSec > 0 ? completed / wallSec : 0;
  let avg = NaN, min = NaN, max = NaN, p50 = NaN, p90 = NaN, p95 = NaN, p99 = NaN;
  if (success > 0) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    avg = sum / success;
    min = sorted[0];
    max = sorted[sorted.length - 1];
    p50 = nearestRank(sorted, 50);
    p90 = nearestRank(sorted, 90);
    p95 = nearestRank(sorted, 95);
    p99 = nearestRank(sorted, 99);
  }
  return {
    url,
    mode: modeArg || 'without',
    plannedRate: rate,
    plannedDurationSec: duration,
    totalPlanned,
    completed,
    success,
    errors,
    wallMs,
    achievedRps,
    avg,
    min,
    p50,
    p90,
    p95,
    p99,
    max,
  };
}

function formatNum(n) { return Number.isFinite(n) ? n.toFixed(2) : 'NA'; }

function writeSummaryAndClose() {
  const s = computeSummary();
  // Prepare TSV header and row
  const header = [
    'timestamp', 'mode', 'url',
    'planned_rate_rps', 'planned_duration_sec', 'total_planned',
    'completed', 'success', 'errors', 'wall_ms', 'achieved_rps',
    'avg_ms', 'min_ms', 'p50_ms', 'p90_ms', 'p95_ms', 'p99_ms', 'max_ms'
  ];
  const nowIso = new Date().toISOString();
  const row = [
    nowIso,
    s.mode,
    s.url,
    s.plannedRate,
    s.plannedDurationSec,
    s.totalPlanned,
    s.completed,
    s.success,
    s.errors,
    s.wallMs,
    Number(formatNum(s.achievedRps)),
    Number(formatNum(s.avg)),
    Number(formatNum(s.min)),
    Number(formatNum(s.p50)),
    Number(formatNum(s.p90)),
    Number(formatNum(s.p95)),
    Number(formatNum(s.p99)),
    Number(formatNum(s.max)),
  ];

  // Append header if file doesn't exist, then append the row
  const exists = fs.existsSync(summaryFile);
  if (!exists) {
    fs.writeFileSync(summaryFile, header.join('\t') + '\n');
  }
  fs.appendFileSync(summaryFile, row.join('\t') + '\n');

  // Optional console summary
  clog('[client] Summary:', {
    url: s.url,
    mode: s.mode,
    plannedRate: s.plannedRate,
    plannedDurationSec: s.plannedDurationSec,
    completed: s.completed,
    success: s.success,
    errors: s.errors,
    achievedRps: Number(formatNum(s.achievedRps)),
    avgMs: Number(formatNum(s.avg)),
    p50Ms: Number(formatNum(s.p50)),
    p90Ms: Number(formatNum(s.p90)),
    p95Ms: Number(formatNum(s.p95)),
    p99Ms: Number(formatNum(s.p99)),
    minMs: Number(formatNum(s.min)),
    maxMs: Number(formatNum(s.max)),
  });

  // Close the latency stream
  stream.end();
}

function maybeFinish() {
  if (completed >= totalPlanned && inflight === 0) {
    writeSummaryAndClose();
  }
}

let elapsedSeconds = 0;
const interval = setInterval(() => {
  if (elapsedSeconds >= duration) {
    clearInterval(interval);
    // Wait for pending requests to finish, then write summary.
    maybeFinish();
    return;
  }
  for (let i = 0; i < rate; i++) {
    const start = Date.now();
    sent++;
    inflight++;
    axios.get(url)
      .then(() => {
        const latency = Date.now() - start;
        latencies.push(latency);
        stream.write(latency + '\n');
      })
      .catch(() => {
        errors++;
        stream.write('error\n');
      })
      .finally(() => {
        completed++;
        inflight--;
        maybeFinish();
      });
  }
  elapsedSeconds++;
}, 1000);
