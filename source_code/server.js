const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

app.get('/fib', (req, res) => {
  const n = parseInt(req.query.n, 10) || 35;
  const start = process.hrtime.bigint();
  const result = fib(n);
  const duration = Number(process.hrtime.bigint() - start) / 1e6; // milliseconds
  res.json({ input: n, result, durationMs: duration, pid: process.pid });
});

app.get('/', (_req, res) => {
  res.send('Fibonacci server is running');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
