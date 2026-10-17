// A static host for a production build (tools/lab `pwa`), as GitHub Pages serves the game: its files under a path,
// kept by the browser for 10 minutes and revalidated by their ETag, and what it serves swapped at once, as a deploy
// swaps it. Pages answers from 127.0.0.1 here, a secure context, so the game's offline worker registers.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';

/** what each kind of file is served as */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};
/** how long the browser keeps a file before it revalidates it (s), as Pages has it */
const MAX_AGE = 600;

/** A file's ETag: its content's hash. */
const etagOf = (body) => `"${createHash('sha1').update(body).digest('hex')}"`;

export class StaticHost {
  /** `base`: the path the build is served under (`/last-stand/`, as Pages has it) */
  constructor(base) {
    this.base = base;
    this.root = null;
    this.rewrite = null;
    this.server = null;
  }

  /** Serves the build in `root` from now on; `rewrite(text)`, when given, changes its page as it's served. */
  serve(root, rewrite = null) {
    this.root = root;
    this.rewrite = rewrite;
  }

  /** Starts answering on a free port of 127.0.0.1; resolves to the build's address. */
  start() {
    this.server = http.createServer((request, response) => this.answer(request, response));
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${this.server.address().port}${this.base}`));
    });
  }

  close() {
    this.server?.closeAllConnections();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  /** The file a request's path names in the build served, or null (outside it, or none). */
  fileOf(url) {
    const path = decodeURIComponent(new URL(url, 'http://host').pathname);
    if (!path.startsWith(this.base)) return null;
    const relative = path.slice(this.base.length) || 'index.html';
    const file = normalize(join(this.root, relative.endsWith('/') ? `${relative}index.html` : relative));
    if (!file.startsWith(this.root + sep) || !existsSync(file) || !statSync(file).isFile()) return null;
    return file;
  }

  /** Its body as served: the page rewritten when asked. */
  bodyOf(file) {
    const body = readFileSync(file);
    if (!this.rewrite || extname(file) !== '.html') return body;
    return Buffer.from(this.rewrite(body.toString()));
  }

  answer(request, response) {
    const file = this.root ? this.fileOf(request.url) : null;
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
      return;
    }
    const body = this.bodyOf(file);
    const etag = etagOf(body);
    const headers = { 'Cache-Control': `max-age=${MAX_AGE}`, ETag: etag };
    if (request.headers['if-none-match'] === etag) {
      response.writeHead(304, headers);
      response.end();
      return;
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    response.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': body.length });
    response.end(body);
  }
}
