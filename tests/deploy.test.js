// 배포 폴더 생성(tools/deploy.mjs): 환경변수 검증과 결과물.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { makeConfigText, stage } from '../tools/deploy.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const jwt = (role) => ['e30', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'sig'].join('.');
const URL_OK = 'https://abcdefghij.supabase.co';

/** window.TODO_CONFIG 값을 읽어 온다. */
function evalConfig(text) {
  const window = {};
  new Function('window', text)(window);
  return window.TODO_CONFIG;
}

test('deploy: anon key로 supabase 어댑터 설정을 만든다(끝의 / 제거, 따옴표 안전)', () => {
  const cfg = evalConfig(makeConfigText({ SUPABASE_URL: `${URL_OK}/`, SUPABASE_ANON_KEY: jwt('anon') }));
  assert.equal(cfg.adapter, 'supabase');
  assert.equal(cfg.supabaseUrl, URL_OK);
  assert.equal(cfg.supabaseAnonKey, jwt('anon'));
});

test('deploy: 새 형식 publishable key도 받는다', () => {
  assert.equal(evalConfig(makeConfigText({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: 'sb_publishable_abc123' })).supabaseAnonKey, 'sb_publishable_abc123');
});

test('deploy: DEFAULT_USER_NAME이 있을 때만 기본 사용자를 설정에 넣는다', () => {
  const base = { SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: jwt('anon') };
  assert.equal(evalConfig(makeConfigText({ ...base, DEFAULT_USER_NAME: ' TEST ' })).defaultUserName, 'TEST');
  assert.equal('defaultUserName' in evalConfig(makeConfigText(base)), false);
  assert.equal('defaultUserName' in evalConfig(makeConfigText({ ...base, DEFAULT_USER_NAME: '  ' })), false);
});

test('deploy: 환경변수가 없으면 local 모드로 조용히 배포하지 않고 실패한다', () => {
  assert.throws(() => makeConfigText({}), /SUPABASE_URL, SUPABASE_ANON_KEY가 필요/);
  assert.throws(() => makeConfigText({ SUPABASE_URL: URL_OK }), /필요/);
  assert.throws(() => makeConfigText({ SUPABASE_ANON_KEY: jwt('anon') }), /필요/);
});

test('deploy: 관리자 키가 들어오면 배포를 막는다', () => {
  assert.throws(() => makeConfigText({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: jwt(['service', 'role'].join('_')) }), /관리자/);
  assert.throws(() => makeConfigText({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: 'sb_secret_abc' }), /관리자/);
  assert.throws(() => makeConfigText({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: jwt('authenticated') }), /anon이 아닙니다/);
});

test('deploy: 주소 형식이 틀리면 실패한다', () => {
  for (const bad of ['http://abc.supabase.co', 'https://evil.example.com', 'abc.supabase.co', 'https://abc.supabase.co/rest/v1']) {
    assert.throws(() => makeConfigText({ SUPABASE_URL: bad, SUPABASE_ANON_KEY: jwt('anon') }), /형식/, bad);
  }
});

test('deploy: public/에 필요한 파일만 복사하고 config.js를 넣는다', () => {
  const out = stage({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: jwt('anon') });
  try {
    for (const f of ['index.html', 'css/tokens.css', 'dist/app.js', 'js/compat.js', 'js/theme.js', 'js/config.js', 'vendor/supabase-js.umd.js', 'vendor/fonts/pretendard.css', 'vendor/fonts/PretendardVariable.subset.0.woff2', 'vendor/fonts/LICENSE.txt'])
      assert.ok(existsSync(join(out, f)), f);
    for (const f of ['PRD.md', 'tests', 'tools', 'supabase', 'docs', 'node_modules', 'package.json'])
      assert.ok(!existsSync(join(out, f)), `${f}는 올리지 않는다`);
    assert.equal(readFileSync(join(out, 'dist/app.js'), 'utf8'), readFileSync(join(root, 'dist/app.js'), 'utf8'));
    assert.ok(readFileSync(join(out, 'index.html'), 'utf8').includes('js/config.js'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('deploy: 검증에 실패하면 기존 public/을 건드리지 않는다', () => {
  const out = stage({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: jwt('anon') });
  try {
    const before = readFileSync(join(out, 'js/config.js'), 'utf8');
    assert.throws(() => stage({ SUPABASE_URL: URL_OK }), /필요/);
    assert.equal(readFileSync(join(out, 'js/config.js'), 'utf8'), before);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
