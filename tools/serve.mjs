// 개발용 정적 서버(의존성 없음). 사용: node tools/serve.mjs [포트]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
    const file = resolve(join(root, path));
    if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { status: 403 });
    if (!(await stat(file)).isFile()) throw Object.assign(new Error('not found'), { status: 404 });
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (err) {
    res.writeHead(err.status ?? 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err.status === 403 ? 'forbidden' : 'not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
