// Local frontend + Worker preview. No API key is loaded; uses the same fallback
// and receptionist routes as production without spending the live AI budget.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { handleRequest } from '../worker/src/index.js';

const root = resolve(import.meta.dirname, '..');
const origin = 'http://127.0.0.1:4175';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/api/chat') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await handleRequest(new Request(url, {
        method: req.method, headers: req.headers,
        ...(req.method === 'POST' ? {body: Buffer.concat(chunks)} : {}),
      }), {ALLOWED_ORIGINS: origin});
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    const path = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + sep) || !['.html', '.js', '.css', '.webp', '.png', '.svg', '.woff2', '.ico'].includes(extname(path))) {
      res.writeHead(404); res.end(); return;
    }
    let body = await readFile(path);
    if (path === resolve(root, 'index.html')) body = body.toString().replace(/(<meta name="buma-chat-api" content=")[^"]+/, `$1${origin}/api/chat`);
    res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4175, '127.0.0.1', () => console.log(`BUMA local preview: ${origin} (local chat; no AI key)`));
