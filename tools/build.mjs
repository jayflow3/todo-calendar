// js/main.js에서 시작하는 모듈들을 하나의 일반 스크립트(dist/app.js)로 묶는다.
// 이유: 브라우저는 file:// 주소에서 ES 모듈을 막는다. 일반 스크립트 하나로 묶어 두면 index.html을 더블클릭해서 열 수 있고,
//       요청 수도 40여 개에서 1개로 줄어 첫 화면이 빨라진다. 결과물(dist/app.js)은 저장소에 커밋한다(Node가 없는 PC에서도 열리도록).
// 사용: npm run build  /  npm run build:watch  (소스를 고치면 다시 빌드해야 index.html에 반영된다)
import { build, context } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const BUILD_OPTIONS = {
  entryPoints: ['js/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020', // PRD 7.6: ES2020까지만
  outfile: 'dist/app.js',
  charset: 'utf8', // 한글 문자열을 \uXXXX로 바꾸지 않는다
  legalComments: 'none',
  banner: { js: '/* 자동 생성 파일 — 직접 고치지 말고 소스(js/)를 고친 뒤 npm run build 를 실행하세요. */' },
  logLevel: 'info',
};

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** 메모리에서 빌드한 결과(파일에 쓰지 않음). 커밋된 번들이 최신인지 테스트가 비교할 때 쓴다. */
export async function buildToString() {
  const result = await build({ ...BUILD_OPTIONS, absWorkingDir: root, write: false, outfile: 'dist/app.js', logLevel: 'silent' });
  return result.outputFiles[0].text;
}

export const committedBundle = () => readFileSync(resolve(root, 'dist/app.js'), 'utf8');

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.chdir(root);
  if (process.argv.includes('--watch')) {
    const ctx = await context(BUILD_OPTIONS);
    await ctx.watch();
    console.log('소스 변경을 감시하며 dist/app.js를 다시 만듭니다. (종료: Ctrl+C)');
  } else {
    await build(BUILD_OPTIONS);
  }
}
