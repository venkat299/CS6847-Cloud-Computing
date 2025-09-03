/* global Chart */

async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return await res.text();
}

function parseTSV(tsv) {
  const lines = tsv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines[0].split('\t');
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length !== header.length) continue;
    const get = (k) => parts[idx[k]];
    const toNum = (k) => Number(get(k));
    rows.push({
      timestamp: get('timestamp'),
      mode: get('mode'),
      url: get('url'),
      planned_rate_rps: toNum('planned_rate_rps'),
      planned_duration_sec: toNum('planned_duration_sec'),
      total_planned: toNum('total_planned'),
      completed: toNum('completed'),
      success: toNum('success'),
      errors: toNum('errors'),
      wall_ms: toNum('wall_ms'),
      achieved_rps: toNum('achieved_rps'),
      avg_ms: toNum('avg_ms'),
      min_ms: toNum('min_ms'),
      p50_ms: toNum('p50_ms'),
      p90_ms: toNum('p90_ms'),
      p95_ms: toNum('p95_ms'),
      p99_ms: toNum('p99_ms'),
      max_ms: toNum('max_ms'),
    });
  }
  return rows;
}

function aggregateByRate(rows, options) {
  const latencyField = options?.latencyField || 'p95_ms';
  const byRate = new Map();
  for (const r of rows) {
    const key = r.planned_rate_rps;
    if (!byRate.has(key)) {
      byRate.set(key, {
        rate: key,
        sumAchievedRps: 0,
        countAchievedRps: 0,
        sumLatency: 0,
        countLatency: 0,
        sumSuccess: 0,
        sumCompleted: 0,
      });
    }
    const a = byRate.get(key);
    if (Number.isFinite(r.achieved_rps)) {
      a.sumAchievedRps += r.achieved_rps;
      a.countAchievedRps += 1;
    }
    const latVal = r[latencyField];
    if (Number.isFinite(latVal)) {
      a.sumLatency += latVal;
      a.countLatency += 1;
    }
    if (Number.isFinite(r.success)) a.sumSuccess += r.success;
    if (Number.isFinite(r.completed)) a.sumCompleted += r.completed;
  }
  const points = Array.from(byRate.values()).map((a) => ({
    x: a.rate,
    throughput: a.countAchievedRps ? a.sumAchievedRps / a.countAchievedRps : NaN,
    reliability: a.sumCompleted ? (a.sumSuccess / a.sumCompleted) * 100 : NaN,
    latency: a.countLatency ? a.sumLatency / a.countLatency : NaN,
  }));
  points.sort((p, q) => p.x - q.x);
  return points;
}

function lineDataset(label, color, xs, ys) {
  return {
    label,
    data: xs.map((x, i) => ({ x, y: ys[i] })),
    borderColor: color,
    backgroundColor: color + '66',
    tension: 0.2,
    pointRadius: 3,
  };
}

let charts = { t: null, r: null, l: null };

function renderCharts(aggWithout, aggWith) {
  const xsWout = aggWithout.map(p => p.x);
  const xsWith = aggWith.map(p => p.x);
  const xs = Array.from(new Set([...xsWout, ...xsWith])).sort((a,b)=>a-b);
  const xsBar = xs.filter(x => x >= 10);

  const colors = {
    without: '#e74c3c', // red
    with: '#2ecc71',    // green
  };

  const ctxT = document.getElementById('chartThroughput');
  const ctxR = document.getElementById('chartReliability');
  const ctxL = document.getElementById('chartLatency');

  const makeChart = (ctx, title, yTitle, datasets) => new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Planned rate (RPS)' },
          min: 10,
          ticks: { precision: 0 },
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: yTitle },
          beginAtZero: false,
          min: 1,
        },
      },
      plugins: {
        title: { display: false, text: title },
        legend: { position: 'top' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` } }
      },
    },
  });

  const yTwithout = xs.map(x => (aggWithout.find(p => p.x === x)?.throughput ?? null));
  const yTwith = xs.map(x => (aggWith.find(p => p.x === x)?.throughput ?? null));
  const yRwithout = xs.map(x => (aggWithout.find(p => p.x === x)?.reliability ?? null));
  const yRwith = xs.map(x => (aggWith.find(p => p.x === x)?.reliability ?? null));
  const yLwithout = xs.map(x => (aggWithout.find(p => p.x === x)?.latency ?? null));
  const yLwith = xs.map(x => (aggWith.find(p => p.x === x)?.latency ?? null));

  charts.t?.destroy();
  charts.r?.destroy();
  charts.l?.destroy();

  // Build stacked bars per mode: Achieved + Shortfall = Planned
  const haveWout = (x) => aggWithout.some(p => p.x === x);
  const haveWith = (x) => aggWith.some(p => p.x === x);
  const achievedWout = xsBar.map(x => (aggWithout.find(p => p.x === x)?.throughput ?? null));
  const achievedWith = xsBar.map(x => (aggWith.find(p => p.x === x)?.throughput ?? null));
  const shortfallWout = xsBar.map((x, i) => {
    const planned = haveWout(x) ? x : null;
    const ach = achievedWout[i];
    if (planned == null || ach == null) return null;
    return Math.max(0, planned - ach);
  });
  const shortfallWith = xsBar.map((x, i) => {
    const planned = haveWith(x) ? x : null;
    const ach = achievedWith[i];
    if (planned == null || ach == null) return null;
    return Math.max(0, planned - ach);
  });

  charts.t = new Chart(ctxT, {
    type: 'bar',
    data: {
      labels: xsBar,
      datasets: [
        {
          label: 'Achieved (Without AS)',
          data: achievedWout,
          backgroundColor: colors.without,
          borderColor: colors.without,
          borderWidth: 1,
          maxBarThickness: 24,
          stack: 'without',
        },
        {
          label: 'Shortfall (Without AS)',
          data: shortfallWout,
          backgroundColor: colors.without + '40',
          borderColor: colors.without,
          borderWidth: 1,
          maxBarThickness: 24,
          stack: 'without',
        },
        {
          label: 'Achieved (With AS)',
          data: achievedWith,
          backgroundColor: colors.with,
          borderColor: colors.with,
          borderWidth: 1,
          maxBarThickness: 24,
          stack: 'with',
        },
        {
          label: 'Shortfall (With AS)',
          data: shortfallWith,
          backgroundColor: colors.with + '40',
          borderColor: colors.with,
          borderWidth: 1,
          maxBarThickness: 24,
          stack: 'with',
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'category',
          title: { display: true, text: 'Planned rate (RPS)' },
          stacked: true,
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'RPS' },
          beginAtZero: false,
          min: 1,
          stacked: true,
        },
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            title: (items) => `Planned: ${items[0]?.label}`,
          },
        },
      },
    },
  });

  charts.r = makeChart(ctxR, 'Reliability', 'Success rate (%)', [
    lineDataset('Without AS', colors.without, xs, yRwithout),
    lineDataset('With AS', colors.with, xs, yRwith),
  ]);

  charts.l = makeChart(ctxL, 'Latency', 'p95 latency (ms)', [
    lineDataset('Without AS', colors.without, xs, yLwithout),
    lineDataset('With AS', colors.with, xs, yLwith),
  ]);
}

async function loadAndPlot() {
  const summaryPath = document.getElementById('summaryPath').value.trim();

  let rows = [];
  try { rows = parseTSV(await fetchText(summaryPath)); }
  catch (e) {
    alert('Failed to load summary TSV: ' + e.message + '\nMake sure to serve the repo via HTTP and the path is correct.');
    return;
  }

  const rowsWithout = rows.filter(r => (r.mode || '').toLowerCase() === 'without');
  const rowsWith = rows.filter(r => (r.mode || '').toLowerCase() === 'with');

  const aggWout = aggregateByRate(rowsWithout, { latencyField: 'p95_ms' });
  const aggWith = aggregateByRate(rowsWith, { latencyField: 'p95_ms' });

  renderCharts(aggWout, aggWith);
}

document.getElementById('loadBtn').addEventListener('click', () => loadAndPlot());
window.addEventListener('DOMContentLoaded', () => loadAndPlot());
