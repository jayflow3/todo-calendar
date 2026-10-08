// 글꼴(Pretendard) 포함 점검: 외부 요청 없이 vendor/fonts의 파일만 쓰고, 참조한 파일이 모두 있으며 라이선스가 함께 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dir = join(root, 'vendor/fonts');
const css = readFileSync(join(dir, 'pretendard.css'), 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

test('글꼴 CSS: 외부 주소·@import 없이 같은 폴더의 woff2만 가리킨다', () => {
  assert.doesNotMatch(code, /https?:|\/\/|@import/);
  const urls = [...code.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  assert.ok(urls.length >= 90, `조각 ${urls.length}개`);
  for (const u of urls) assert.match(u, /^\.\/PretendardVariable\.subset\.\d+\.woff2$/, u);
});

test('글꼴 CSS: 모든 조각이 화면에 쓰는 글자만 내려받도록 unicode-range와 swap을 쓴다', () => {
  const blocks = code.split('@font-face').slice(1);
  assert.equal(blocks.length, new Set([...code.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1])).size); // 조각마다 블록 하나
  for (const b of blocks) {
    assert.match(b, /font-family:\s*'Pretendard Variable'/);
    assert.match(b, /font-display:\s*swap/); // 글꼴이 늦어도 글자는 먼저 보인다
    assert.match(b, /unicode-range:/);
    assert.match(b, /font-weight:\s*45 920/); // 가변 굵기
  }
});

test('글꼴 파일: 참조된 조각이 모두 있고 진짜 woff2이며, 쓰지 않는 파일은 없다', () => {
  const referenced = new Set([...code.matchAll(/url\(\.\/([^)]+)\)/g)].map((m) => m[1]));
  for (const name of referenced) {
    const file = join(dir, name);
    assert.ok(existsSync(file), `${name} 없음`);
    assert.equal(readFileSync(file).subarray(0, 4).toString('latin1'), 'wOF2', `${name}: woff2가 아님`);
  }
  const onDisk = readdirSync(dir).filter((f) => f.endsWith('.woff2'));
  assert.deepEqual(onDisk.sort(), [...referenced].sort());
});

test('글꼴 라이선스: SIL OFL 전문이 함께 있다', () => {
  const license = readFileSync(join(dir, 'LICENSE.txt'), 'utf8');
  assert.match(license, /SIL Open Font License, Version 1\.1/);
  assert.match(license, /Pretendard/);
});

test('글꼴 적용: index.html이 글꼴 CSS를 읽고, 폰트 스택 맨 앞이 Pretendard Variable이며, CSP는 같은 출처 글꼴만 허용한다', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="vendor\/fonts\/pretendard\.css">/);
  assert.match(readFileSync(join(root, 'css/tokens.css'), 'utf8'), /--font-sans:\s*"Pretendard Variable",/);
  assert.match(html, /font-src 'self'/);
});
