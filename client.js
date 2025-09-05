#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROLL_NUMBER = 'DA24C021';
const SUMMARY_FILE = path.join(__dirname, 'viz', 'summary.tsv');
const TEST_DURATION_SEC = 60; // sustain load for at least 60 seconds
const MAX_LOGGED_SAMPLES = 10; // cap human-readable samples in output file

function loadDefaultStrings() {
  const dataPath = path.join(__dirname, 'data', 'input-strings.txt');
  let content;
  try {
    content = fs.readFileSync(dataPath, 'utf8');
  } catch (err) {
    return [];
  }
  const strings = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('Original:')) {
      strings.push(line.split(':')[1].trim());
    }
  }
  return strings;
}

const INPUT_STRINGS = loadDefaultStrings();

async function sendAndMeasure(baseUrl, text) {
  const start = process.hrtime.bigint();
  const url = new URL('/reverse', baseUrl);
  url.searchParams.set('input', text);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Request failed with status ${resp.status}`);
  }
  const data = await resp.json();
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
  return { reversed: data.reversed || '', durationMs };
}

function nearestRank(sorted, p) {
  if (!sorted.length) return NaN;
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx];
}

function computeSummary(latencies, errors, startedAt, endedAt, url, mode, plannedRate, plannedDurationSec) {
  const success = latencies.length;
  const completed = success + errors;
  const totalPlanned = Math.round((plannedRate || 0) * (plannedDurationSec || 0));
  const wallMs = (endedAt || Date.now()) - startedAt;
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
    mode,
    plannedRate,
    plannedDurationSec,
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

function formatNum(n) {
  return Number.isFinite(n) ? n.toFixed(2) : 'NA';
}

function writeSummary(summaryFile, s) {
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

  try { fs.mkdirSync(path.dirname(summaryFile), { recursive: true }); } catch {}
  const exists = fs.existsSync(summaryFile);
  if (!exists) {
    fs.writeFileSync(summaryFile, header.join('\t') + '\n');
    fs.appendFileSync(summaryFile, row.join('\t') + '\n');
  } else {
    try {
      const text = fs.readFileSync(summaryFile, 'utf8');
      const lines = text.split(/\r?\n/).filter(Boolean);
      let out = [];
      let hdr = header;
      if (lines.length > 0) {
        const existingHeader = lines[0].split('\t');
        hdr = existingHeader.length === header.length ? existingHeader : header;
      }
      const colIdx = Object.fromEntries(hdr.map((h, i) => [h, i]));
      const keyOf = (parts) => [
        (parts[colIdx.mode] || '').toLowerCase(),
        parts[colIdx.url] || '',
        String(parts[colIdx.planned_rate_rps] || ''),
      ].join('|');
      const targetKey = [s.mode.toLowerCase(), s.url, String(s.plannedRate)].join('|');

      out.push(hdr.join('\t'));
      const seen = new Set();
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split('\t');
        if (parts.length !== hdr.length) continue;
        const k = keyOf(parts);
        if (k === targetKey) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(parts.join('\t'));
      }
      out.push(row.join('\t'));
      fs.writeFileSync(summaryFile, out.join('\n') + '\n');
    } catch (e) {
      fs.appendFileSync(summaryFile, row.join('\t') + '\n');
    }
  }
}

async function main() {
  const [baseUrl, mode, rpsStr] = process.argv.slice(2);
  const rps = Number(rpsStr);
  const allowed = new Set([10, 100, 1000, 10000, 100000]);
  if (!baseUrl || !['dockerswarm', 'kubernetes'].includes((mode || '').toLowerCase()) || !allowed.has(rps)) {
    console.error('Usage: node client.js <url> <dockerswarm|kubernetes> <10|100|1000|10000|100000>');
    process.exit(1);
  }

  const plannedDurationSec = TEST_DURATION_SEC;
  const plannedRate = rps;

  // Attempt to increase HTTP connection concurrency for high rates (no-op if undici not available)
  try {
    const { setGlobalDispatcher, Agent } = require('undici');
    // Cap connections to a reasonable upper bound; pipelining kept at 1 for safety.
    const maxConns = Math.max(128, Math.min(4096, rps));
    setGlobalDispatcher(new Agent({ connections: maxConns, pipelining: 1 }));
  } catch {}

  // Rate-based scheduler: issue ~rps requests/sec for plannedDurationSec.
  const latencies = [];
  let errors = 0;
  const startedAt = Date.now();

  let idx = 0;
  let doneScheduling = false;
  let pending = 0;
  const samples = [];

  let resolveAll; // resolved when scheduling done and all in-flight complete
  const allDone = new Promise((res) => { resolveAll = res; });

  const maybeFinish = () => {
    if (doneScheduling && pending === 0) resolveAll();
  };

  const issueOne = () => {
    const text = INPUT_STRINGS[(idx++) % (INPUT_STRINGS.length || 1)] || '';
    pending++;
    sendAndMeasure(baseUrl, text)
      .then(({ reversed, durationMs }) => {
        latencies.push(durationMs);
        if (samples.length < MAX_LOGGED_SAMPLES) {
          samples.push({ original: text, reversed });
        }
      })
      .catch(() => { errors++; })
      .finally(() => { pending--; maybeFinish(); });
  };

  // Choose tick granularity based on target rate
  const tickMs = rps >= 100000 ? 1 : rps >= 10000 ? 5 : rps >= 1000 ? 10 : 100;
  let carry = 0; // fractional carry to reduce drift

  const tick = () => {
    const plannedThisTick = (rps * tickMs) / 1000 + carry;
    let toSend = Math.floor(plannedThisTick);
    carry = plannedThisTick - toSend;
    for (let i = 0; i < toSend; i++) issueOne();
  };

  const timer = setInterval(tick, tickMs);
  // Start immediately to avoid first-interval delay
  tick();

  // Stop scheduling after planned duration
  setTimeout(() => {
    clearInterval(timer);
    doneScheduling = true;
    maybeFinish();
  }, plannedDurationSec * 1000);

  await allDone; // wait for in-flight to complete
  const endedAt = Date.now();

  const avg = latencies.length ? latencies.reduce((s, v) => s + v, 0) / latencies.length : NaN;
  const filename = `${ROLL_NUMBER}${mode}${rps}.txt`;
  const output = [];
  // Log a small sample of original/reversed pairs to keep files readable
  for (const r of samples) {
    output.push(`Original: ${r.original}`);
    output.push(`Reversed: ${r.reversed}`);
    output.push('--------------------------------');
  }
  output.push(`average_response_time=${avg}`);
  fs.writeFileSync(path.join(__dirname, filename), output.join('\n') + '\n', 'utf8');

  const summary = computeSummary(latencies, errors, startedAt, endedAt, baseUrl, mode, plannedRate, plannedDurationSec);
  writeSummary(SUMMARY_FILE, summary);
  console.log(`Sustained ~${rps} rps for ${plannedDurationSec}s: ${latencies.length} successes, ${errors} errors.`);
  if (Number.isFinite(avg)) console.log(`Average latency: ${avg.toFixed(2)} ms`);
  console.log(`Wrote ${filename} and updated ${SUMMARY_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
