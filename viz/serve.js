const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static file server that serves the viz/ folder.
// Usage:
//   node viz/serve.js               # serves viz on http://localhost:8000
//   PORT=9000 node viz/serve.js     # change port via env
//   node viz/serve.js -p 8080       # change port via arg
//   node viz/serve.js --host 0.0.0.0

const args = process.argv.slice(2);
function getArg(flag, def) {
  const i = args.findIndex(a => a === flag || a === flag.replace('--', '-'));
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const pref = flag + '=';
  const found = args.find(a => a.startsWith(pref));
  if (found) return found.slice(pref.length);
  return def;
}

const host = getArg('--host', process.env.HOST || '127.0.0.1');
const port = Number(getArg('--port', process.env.PORT || '8000')) || 8000;

// Root directory to serve: the directory containing this script (viz/)
const root = path.resolve(__dirname);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function safeResolve(urlPath) {
  // Prevent path traversal; always stay under root.
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const joined = path.join(root, decoded);
  const resolved = path.resolve(joined);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url || '/';

  // Default to index.html for directory or root.
  let filePath = safeResolve(urlPath);
  if (!filePath) {
    return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, '403 Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    // If not found, try appending index.html when URL ends with '/'
    const serveIndex = () => {
      const idx = safeResolve(path.join(urlPath, 'index.html'));
      if (!idx) return send(res, 403, { 'Content-Type': 'text/plain; charset=utf-8' }, '403 Forbidden');
      fs.stat(idx, (e2, st2) => {
        if (e2 || !st2.isFile()) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 Not Found');
        streamFile(idx, res);
      });
    };

    if (err) {
      // If path has no extension and isn’t found, try adding '.html'
      const ext = path.extname(filePath);
      if (!ext) {
        const htmlPath = filePath + '.html';
        return fs.stat(htmlPath, (e2, st2) => {
          if (!e2 && st2.isFile()) return streamFile(htmlPath, res);
          // If original looked like a directory, try index.html
          if (urlPath.endsWith('/')) return serveIndex();
          return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 Not Found');
        });
      }
      if (urlPath.endsWith('/')) return serveIndex();
      return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 Not Found');
    }

    if (stat.isDirectory()) return serveIndex();
    if (!stat.isFile()) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '404 Not Found');
    return streamFile(filePath, res);
  });
});

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mime[ext] || 'application/octet-stream';
  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  });
  stream.on('error', (err) => {
    send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, '500 Internal Server Error');
  });
  stream.pipe(res);
}

server.listen(port, host, () => {
  const url = `http://${host}:${port}/`;
  console.log(`[viz] Serving ${root} at ${url}`);
  console.log('[viz] Open the dashboard at', url);
});

