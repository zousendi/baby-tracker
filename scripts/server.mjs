import http from 'node:http';
import { readFile } from 'node:fs/promises';
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']], ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/model.js', ['src/model.js', 'text/javascript']], ['/src/style.css', ['src/style.css', 'text/css']],
]);
http.createServer(async (req, res) => {
  const file = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(`../${file[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
}).listen(port, host, () => console.log(`Baby tracker: http://localhost:${port}`));
