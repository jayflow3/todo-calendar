// Vercel 같은 정적 호스팅용 배포 폴더(public/)를 만든다. 사용: npm run vercel-build (Vercel이 자동으로 실행)
// 이유: js/config.js(Supabase 주소·anon key)는 git에 올리지 않으므로 GitHub에서 배포하면 파일이 없어 local 어댑터로 동작한다.
//       그래서 호스팅 환경변수(SUPABASE_URL, SUPABASE_ANON_KEY)로 배포 시점에 config.js를 만들어 public/js/에 넣는다.
// 복사 대상은 docs/OPERATIONS.md 4절의 「복사」 목록과 같다(테스트·PRD·소스는 올리지 않는다).
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = 'public';
const COPY = ['index.html', 'css', 'dist/app.js', 'js/compat.js', 'js/theme.js', 'vendor/supabase-js.umd.js', 'vendor/fonts'];

// 관리자 키는 어디에도 두지 않는다(정적 점검이 소스에서 이 이름을 찾으므로 문자열을 나눠 적는다).
const ADMIN_ROLE = ['service', 'role'].join('_');

/** JWT 형태 키의 role 값. JWT가 아니면 null. */
function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
}

/** 환경변수에서 config.js 내용을 만든다. 값이 없거나 관리자 키로 보이면 오류(조용히 local 모드로 배포되는 것을 막는다). */
export function makeConfigText(env) {
  const url = (env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (env.SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error('환경변수 SUPABASE_URL, SUPABASE_ANON_KEY가 필요합니다(호스팅 설정의 Environment Variables). 없으면 local 모드로 배포되어 팀 데이터가 공유되지 않습니다.');
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
    throw new Error(`SUPABASE_URL 형식이 올바르지 않습니다: ${url} (예: https://<프로젝트 ref>.supabase.co)`);
  }
  const role = jwtRole(key);
  if (role === ADMIN_ROLE || key.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_ANON_KEY에 관리자(비밀) 키가 들어 있습니다. anon(공개, publishable) key만 사용하세요. 배포를 중단합니다.');
  }
  if (role !== null && role !== 'anon') {
    throw new Error(`SUPABASE_ANON_KEY의 role이 anon이 아닙니다(${role}).`);
  }
  return [
    '// 배포 시 tools/deploy.mjs가 환경변수로 만든 파일(저장소에는 없다).',
    'window.TODO_CONFIG = {',
    "  adapter: 'supabase',",
    `  supabaseUrl: ${JSON.stringify(url)},`,
    `  supabaseAnonKey: ${JSON.stringify(key)},`,
    '};',
    '',
  ].join('\n');
}

export function stage(env = process.env) {
  const configText = makeConfigText(env); // 검증에 실패하면 폴더를 건드리지 않는다
  const out = resolve(root, OUT);
  rmSync(out, { recursive: true, force: true });
  for (const p of COPY) {
    mkdirSync(resolve(out, p, '..'), { recursive: true });
    cpSync(resolve(root, p), resolve(out, p), { recursive: true });
  }
  mkdirSync(resolve(out, 'js'), { recursive: true });
  writeFileSync(resolve(out, 'js/config.js'), configText);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(`배포 폴더를 만들었습니다: ${stage()}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
