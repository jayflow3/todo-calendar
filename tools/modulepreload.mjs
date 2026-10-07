// js/main.js에서 시작하는 ES 모듈 의존성 그래프를 따라가 index.html의 <link rel="modulepreload"> 블록을 만든다.
// 빌드 도구가 없어 모듈이 import를 따라 한 단계씩 순차로 내려받아지는데, 미리 알려 주면 한꺼번에 받는다(첫 화면 지연 감소).
// 사용: node tools/modulepreload.mjs --write   (index.html 갱신) / 인자 없이 실행하면 목록만 출력
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ENTRY = 'js/main.js';
// 설정에 따라 있을 수도 없을 수도 있거나(config.js), 특정 어댑터를 쓸 때만 필요한 모듈은 미리 받지 않는다.
const SKIP = new Set(['js/config.js', 'js/config.example.js', 'js/api/adapters/supabase.js']);
export const START = '<!-- modulepreload:start (tools/modulepreload.mjs --write로 갱신) -->';
export const END = '<!-- modulepreload:end -->';

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

function importsOf(file) {
  const code = stripComments(readFileSync(join(root, file), 'utf8'));
  const specs = new Set();
  for (const m of code.matchAll(/\bimport\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g)) specs.add(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
  for (const m of code.matchAll(/\bexport\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g)) specs.add(m[1]);
  return [...specs].filter((s) => s.startsWith('.')).map((s) => relative(root, resolve(dirname(join(root, file)), s)).replace(/\\/g, '/'));
}

export function computePreloads() {
  const seen = new Set([ENTRY]);
  const queue = [ENTRY];
  while (queue.length) {
    for (const dep of importsOf(queue.shift())) {
      if (seen.has(dep) || SKIP.has(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }
  seen.delete(ENTRY);
  return [...seen].sort();
}

export function renderBlock(files) {
  return [START, ...files.map((f) => `  <link rel="modulepreload" href="${f}">`), `  ${END}`].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const files = computePreloads();
  if (!process.argv.includes('--write')) {
    console.log(files.join('\n'));
  } else {
    const path = join(root, 'index.html');
    const html = readFileSync(path, 'utf8');
    const block = renderBlock(files);
    const pattern = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END}`);
    const next = pattern.test(html) ? html.replace(pattern, block) : html.replace('  <script src="js/compat.js">', `  ${block}\n  <script src="js/compat.js">`);
    writeFileSync(path, next);
    console.log(`modulepreload ${files.length}개를 index.html에 기록했습니다.`);
  }
}
