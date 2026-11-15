// Serves the production build (`www/`) for the system tests (TS §14.1). Hash routing and
// `<base href="./">` need no SPA fallback; module workers need the JavaScript MIME type.
// Like the deployment (`https://algoristic.de/portfoligo/`), the app lives in a subfolder and the
// root serves another site, so a path that escapes the subfolder fails (the service worker once
// fetched `/index.html` of the root and stopped with a hash mismatch).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'www');
const port = Number(process.env.PORT ?? 4173);
const basePath = '/portfoligo/';
const ROOT_PAGE = '<!doctype html><title>Another site</title><p>Not PortfoliGo</p>';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(join(root, 'index.html'))) {
  console.error(`No build in ${root}; run "npm run build" first.`);
  process.exit(1);
}

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  if (path === '/' || path === '/index.html') {
    response.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-store' });
    response.end(ROOT_PAGE);
    return;
  }
  if (!path.startsWith(basePath)) {
    response.writeHead(404).end();
    return;
  }
  const relative = path.slice(basePath.length);
  const file = normalize(join(root, relative === '' ? 'index.html' : relative));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () =>
  console.log(`Serving ${root} on http://127.0.0.1:${port}${basePath}`),
);
