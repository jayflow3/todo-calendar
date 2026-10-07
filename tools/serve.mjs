// 개발용 정적 서버(의존성 없음). 사용: node tools/serve.mjs [포트]
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
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
    const body = await readFile(file);
    const type = types[extname(file)] ?? 'application/octet-stream';
    // 실제 배포(nginx 등)처럼 텍스트 자원은 gzip으로 보낸다. 전송 용량 측정이 현실과 같아진다.
    const compressible = /^(text\/|application\/json|image\/svg)/.test(type) && String(req.headers['accept-encoding'] ?? '').includes('gzip');
    res.writeHead(200, { 'Content-Type': type, ...(compressible && { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }) });
    res.end(compressible ? gzipSync(body) : body);
  } catch (err) {
    res.writeHead(err.status ?? 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(err.status === 403 ? 'forbidden' : 'not found');
  }
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error(`포트 ${port}이(가) 이미 사용 중입니다. 서버가 이미 실행 중일 수 있으니 http://localhost:${port} 로 접속해 보세요. 다른 포트: node tools/serve.mjs 3000`);
  else console.error(err.message);
  process.exit(1);
}).listen(port, () => console.log(`http://localhost:${port}`));
