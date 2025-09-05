#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROLL_NUMBER = 'DA24C021';
const SUMMARY_FILE = path.join(__dirname, 'viz', 'summary.tsv');

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

function computeSummary(latencies, errors, startedAt, url, mode) {
  const success = latencies.length;
  const completed = success + errors;
  const totalPlanned = completed;
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
    mode,
    plannedRate: NaN,
    plannedDurationSec: wallSec,
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
  const [baseUrl, mode, countStr] = process.argv.slice(2);
  const count = Number(countStr);
  if (!baseUrl || !['dockerswarm', 'kubernetes'].includes(mode) || ![10, 10000].includes(count)) {
    console.error('Usage: node client.js <url> <dockerswarm|kubernetes> <10|10000>');
    process.exit(1);
  }

  const payloads = count === 10
    ? INPUT_STRINGS
    : Array.from({ length: count }, (_, i) => INPUT_STRINGS[i % INPUT_STRINGS.length]);

  let total = 0;
  const results = [];
  const latencies = [];
  let errors = 0;
  const startedAt = Date.now();
  for (const text of payloads) {
    try {
      const { reversed, durationMs } = await sendAndMeasure(baseUrl, text);
      total += durationMs;
      latencies.push(durationMs);
      results.push({ original: text, reversed });
    } catch (_) {
      errors++;
    }
  }
  const avg = latencies.length ? total / latencies.length : NaN;
  const filename = `${ROLL_NUMBER}${mode}${count}.txt`;
  const output = [];
  if (count === 10) {
    for (const r of results) {
      output.push(`Original: ${r.original}`);
      output.push(`Reversed: ${r.reversed}`);
      output.push('--------------------------------');
    }
  }
  output.push(`average_response_time=${avg}`);
  fs.writeFileSync(path.join(__dirname, filename), output.join('\n') + '\n', 'utf8');
  const summary = computeSummary(latencies, errors, startedAt, baseUrl, mode);
  writeSummary(SUMMARY_FILE, summary);
  console.log(`Wrote ${filename} with average ${avg.toFixed(2)} ms`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

