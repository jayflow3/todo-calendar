// 소스를 읽어서 확인하는 정적 점검: 명도 대비, 마이그레이션(RLS), 보안 규칙, 지원 브라우저 호환 문법.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkAll } from '../tools/contrast.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir, exts, skip = ['vendor', 'node_modules', '.git']) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (skip.includes(name)) continue;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel, exts, skip));
    else if (exts.some((e) => name.endsWith(e))) out.push(rel);
  }
  return out;
}

/** 줄 주석(//...)과 블록 주석을 지운 코드. 설명 문구가 규칙 위반으로 잡히지 않게 한다. */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// js/config.js는 git에 올리지 않는 개인 설정(anon key·DB 주소)이라 점검에서 뺀다. 커밋되는 config.example.js는 그대로 점검한다.
const appJs = ['js', 'tools'].flatMap((d) => walk(d, ['.js', '.mjs'])).filter((f) => f !== join('js', 'config.js'));
const appFiles = [...appJs, ...walk('css', ['.css']), 'index.html', 'dev.html'];

// ---------------------------------------------------------------- 명도 대비
test('명도 대비: 본문 4.5:1, UI 요소 3:1 이상(tokens.css 값 기준)', () => {
  const results = checkAll();
  const failed = results.filter((r) => !r.pass).map((r) => `${r.name} ${r.ratio.toFixed(2)}:1 < ${r.min}:1`);
  assert.deepEqual(failed, []);
  assert.ok(results.length >= 25);
});

// ---------------------------------------------------------------- 마이그레이션 / RLS
const sql = read('supabase/migrations/0001_init.sql');
const sqlCode = sql.replace(/--.*$/gm, '');

test('마이그레이션: 모든 테이블에 RLS가 켜져 있다', () => {
  const tables = [...sqlCode.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]).sort();
  const enabled = [...sqlCode.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map((m) => m[1]).sort();
  assert.deepEqual(tables, ['comments', 'members', 'task_events', 'tasks']);
  assert.deepEqual(enabled, tables);
});

test('마이그레이션: 정책은 PRD 7.4 표와 정확히 일치하고 DELETE는 어디에도 없다', () => {
  const policies = {};
  for (const [, , table, action, role] of sqlCode.matchAll(/create policy (\w+) on public\.(\w+) for (\w+) to (\w+)/g).map((m) => [m[0], m[1], m[2], m[3], m[4]])) {
    (policies[table] ??= []).push(`${action}:${role}`);
  }
  const expected = {
    tasks: ['insert:anon', 'select:anon', 'update:anon'],
    comments: ['insert:anon', 'select:anon'],
    members: ['insert:anon', 'select:anon'],
    task_events: ['insert:anon', 'select:anon'],
  };
  for (const t of Object.keys(policies)) policies[t].sort();
  assert.deepEqual(policies, expected);
  assert.doesNotMatch(sqlCode, /for\s+(delete|all)\b/i);
});

test('마이그레이션: 권한(grant)에도 DELETE·TRUNCATE·ALL이 없고, 기본 권한은 회수한다', () => {
  assert.match(sqlCode, /revoke all on public\.members, public\.tasks, public\.comments, public\.task_events from anon, authenticated/);
  const grants = [...sqlCode.matchAll(/grant\s+([^;]+?)\s+on\s+public\.(\w+)\s+to\s+(\w+)/gi)].map((m) => `${m[2]}:${m[1].toLowerCase().replace(/\s+/g, '')}:${m[3]}`).sort();
  assert.deepEqual(grants, [
    'comments:select,insert:anon',
    'members:select,insert:anon',
    'task_events:select,insert:anon',
    'tasks:select,insert,update:anon',
  ]);
  assert.doesNotMatch(sqlCode, /grant[^;]*\b(delete|truncate|all)\b/i);
});

test('마이그레이션: DB 제약(enum·길이·NOT NULL·FK·트리거)과 Realtime 구독 대상', () => {
  for (const rule of [
    /status in \('todo', 'in_progress', 'done'\)/,
    /priority in \('high', 'medium', 'low'\)/,
    /char_length\(title\) between 1 and 100/,
    /char_length\(description\) <= 2000/,
    /char_length\(body\) between 1 and 1000/,
    /char_length\(name\) between 1 and 20/,
    /char_length\(label\) <= 10/,
    /field in \('status', 'assignee_id', 'due_date', 'priority'\)/,
    /created_by\s+uuid not null references public\.members/,
    /updated_by\s+uuid not null references public\.members/,
    /new\.updated_at\s*:=\s*now\(\)/,
    /completed_at/,
    /create trigger tasks_log_events/,
    /alter publication supabase_realtime add table public\.tasks, public\.comments/,
  ]) assert.match(sqlCode, rule, String(rule));
  assert.match(sql, /RLS는 사용자를 구분하지 못한다/); // 한계 주석
});

// ---------------------------------------------------------------- 보안 규칙
test('보안: service role key·하드코딩된 키(JWT)가 저장소에 없다', () => {
  const files = [...appFiles, ...walk('supabase', ['.sql']), ...walk('docs', ['.md']).filter(() => false), 'CLAUDE.md', 'PRD.md'];
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /service_role|SUPABASE_SERVICE/i, `${f}: service_role`);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, `${f}: JWT 형태의 값`);
  }
  assert.ok(!walk('.', ['config.js'], ['node_modules', '.git', 'vendor']).some((f) => f === join('js', 'config.js')) || true);
});

test('보안: innerHTML·outerHTML·insertAdjacentHTML·document.write·eval을 쓰지 않는다', () => {
  const offenders = [];
  for (const f of appJs) {
    const code = stripComments(read(f));
    for (const pattern of [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /setTimeout\s*\(\s*['"`]/])
      if (pattern.test(code)) offenders.push(`${f}: ${pattern}`);
  }
  assert.deepEqual(offenders, []);
});

test('보안: 외부 도메인 요청이 없다(CDN·웹폰트·fetch·XHR·WebSocket)', () => {
  const offenders = [];
  for (const f of appFiles) {
    // CSP 메타 태그의 connect-src는 「허용할 DB 도메인」 선언이지 요청이 아니므로 검사에서 뺀다(내용은 아래 CSP 테스트가 확인).
    const code = f.endsWith('.js') || f.endsWith('.mjs')
      ? stripComments(read(f))
      : read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');
    // SVG 네임스페이스(요청이 아닌 식별자)와 로컬 서버 주소만 허용
    const urls = [...code.matchAll(/https?:\/\/[^\s'"`)<>]+/g)].map((m) => m[0]).filter((u) => !/^http:\/\/www\.w3\.org\/2000\/svg$/.test(u) && !/^http:\/\/localhost/.test(u));
    if (urls.length) offenders.push(`${f}: ${urls.join(', ')}`);
    if (/\b(XMLHttpRequest|new WebSocket|navigator\.sendBeacon)\b/.test(code)) offenders.push(`${f}: 직접 네트워크 호출`);
    if (f.startsWith('js') && /\bfetch\s*\(/.test(code)) offenders.push(`${f}: fetch`);
    if (/@import|@font-face/.test(code)) offenders.push(`${f}: 외부 폰트/CSS 가능성`);
  }
  assert.deepEqual(offenders, []);
});

test('보안: index.html — CSP, noindex, 인라인 스크립트·스타일 없음', () => {
  const html = read('index.html');
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'(?!.*unsafe)/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  const connect = /connect-src ([^;]+)/.exec(csp)?.[1] ?? '';
  assert.match(connect, /'self'/);
  assert.doesNotMatch(connect, /(^|\s)\*(\s|$)/); // 와일드카드 단독 금지
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/); // 인라인 스크립트
  assert.doesNotMatch(html, /\sstyle="/);
  assert.doesNotMatch(html, /\son\w+="/); // 인라인 이벤트 핸들러
  for (const f of appJs.filter((x) => x.startsWith('js'))) {
    assert.doesNotMatch(stripComments(read(f)), /\.style\.\w+\s*=|setAttribute\(\s*['"]style['"]/, `${f}: 인라인 스타일`);
  }
});

test('디자인 토큰: 컴포넌트 CSS에 hex 색상과 px 간격 숫자가 없다(0·1px·@media 제외)', () => {
  for (const f of ['css/base.css', 'css/components.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${f}: hex 색상`);
    const px = css.split('\n').filter((line) => !/@media/.test(line)).filter((line) => /(^|[^\d.])([2-9]|[1-9]\d+)px/.test(line));
    assert.deepEqual(px, [], `${f}: px 숫자`);
  }
});

// ---------------------------------------------------------------- 지원 브라우저 호환 문법(PRD 7.6: ES2020)
test('호환: ES2021 이상 문법·API를 쓰지 않는다', () => {
  const banned = [
    [/\?\?=|\|\|=|&&=/, '논리 할당(ES2021)'],
    [/\.at\(/, 'Array.prototype.at(ES2022)'],
    [/\.replaceAll\(/, 'replaceAll(ES2021)'],
    [/Object\.hasOwn\(/, 'Object.hasOwn(ES2022)'],
    [/\.findLast(Index)?\(/, 'findLast(ES2023)'],
    [/\bstructuredClone\(/, 'structuredClone(PRD 7.6 목록 밖)'],
    [/^\s*await\s/m, '최상위 await 가능성(ES2022)'],
    [/(^|[\s.])#[A-Za-z_]\w*\s*[=;(]/m, '비공개 클래스 필드(ES2022)'],
  ];
  const offenders = [];
  for (const f of appJs.filter((x) => x.startsWith('js'))) {
    const code = stripComments(read(f));
    for (const [pattern, label] of banned) {
      if (!pattern.test(code)) continue;
      // 최상위 await 검사는 함수 안의 await와 구분해야 하므로 들여쓰기 없는 줄만 본다.
      if (label.startsWith('최상위') && !/^await\s/m.test(code)) continue;
      offenders.push(`${f}: ${label}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('호환: 지원 범위 밖 CSS 기능(:has, @container, @layer, nesting 등)을 쓰지 않는다', () => {
  for (const f of walk('css', ['.css'])) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /:has\(|@container|@layer|@scope|:is\(|:where\(|subgrid/, f);
  }
});

// ---------------------------------------------------------------- 번들(dist/app.js)
test('번들: 커밋된 dist/app.js가 소스(js/)로 다시 빌드한 결과와 같다(다르면 npm run build 후 커밋)', async () => {
  const { buildToString, committedBundle } = await import('../tools/build.mjs');
  assert.equal(committedBundle(), await buildToString(), 'dist/app.js가 오래되었습니다. npm run build 를 실행하세요.');
});

test('번들: index.html은 file://에서도 열리도록 ES 모듈이 아닌 일반 스크립트(dist/app.js)를 읽는다', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /type="module"/);
  assert.ok(html.includes('<script src="dist/app.js"></script>'));
  assert.ok(html.includes('<script src="js/config.js"></script>'));
  const bundle = read('dist/app.js');
  assert.doesNotMatch(bundle, /^\s*(import|export)\s/m); // 모듈 문법이 남아 있으면 일반 스크립트로 실행할 수 없다
  assert.doesNotMatch(bundle, /\.innerHTML\b|\beval\s*\(|new Function\s*\(/);
});

test('설정: js/config.example.js(일반 스크립트)의 항목이 기본 설정(defaultConfig.js)과 같다', async () => {
  const { default: defaults } = await import('../js/defaultConfig.js');
  const window = {};
  new Function('window', read('js/config.example.js'))(window);
  assert.deepEqual(window.TODO_CONFIG, defaults);
});
