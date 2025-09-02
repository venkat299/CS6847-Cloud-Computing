const axios = require('axios');
const fs = require('fs');

const rate = Number(process.argv[2]) || 10; // requests per second
const duration = Number(process.argv[3]) || 60; // seconds
const url = process.argv[4] || 'http://localhost:3000/fib';

const outfile = `rate_${rate}.txt`;
const stream = fs.createWriteStream(outfile, { flags: 'w' });

let elapsedSeconds = 0;
const interval = setInterval(() => {
  if (elapsedSeconds >= duration) {
    clearInterval(interval);
    // Allow pending requests to finish before closing the file
    setTimeout(() => stream.end(), 2000);
    return;
  }
  for (let i = 0; i < rate; i++) {
    const start = Date.now();
    axios.get(url)
      .then(() => {
        const latency = Date.now() - start;
        stream.write(latency + '\n');
      })
      .catch(() => {
        stream.write('error\n');
      });
  }
  elapsedSeconds++;
}, 1000);
