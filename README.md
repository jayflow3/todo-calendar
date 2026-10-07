# 부서 공용 업무 캘린더

부서(10~20명)가 해야 할 일을 한곳에 등록하고, 칸반·리스트·월간 캘린더·대시보드로 같은 데이터를 보는 내부용 웹앱입니다. 로그인 없이 이름만 입력하며, 한 사람이 바꾼 내용은 다른 팀원 화면에 자동으로 반영됩니다. 요구사항은 [PRD.md](PRD.md)를 따릅니다.

> 이 앱은 **서로 신뢰하는 내부 구성원만** 쓰는 환경을 전제로 합니다. 이름은 본인 확인 수단이 아니므로 사칭을 막지 못합니다. [docs/KNOWN_LIMITS.md](docs/KNOWN_LIMITS.md)를 먼저 읽어 주세요.

HTML / CSS / 바닐라 JS(ES 모듈)로 만들었고, 빌드 도구와 런타임 의존성이 없습니다.

## 바로 실행해 보기 (Supabase 없이)

Node.js 22 이상이 필요합니다(개발 서버·단위 테스트용).

```bash
npm start            # http://localhost:8080 에서 열기 (포트는 npm start -- 3000)
```

`js/config.js`가 없으면 **local 어댑터**(브라우저 localStorage)로 동작하고, 첫 실행에 샘플 할일 12건과 부서원 6명이 들어갑니다. 팀 공유는 되지 않으므로 화면·기능을 써 보는 용도입니다. 같은 브라우저의 다른 탭에서는 변경이 실시간으로 반영되어 동시 편집도 흉내 낼 수 있습니다.

## 팀이 함께 쓰기 (Supabase)

1. `supabase/migrations/0001_init.sql`을 Supabase 프로젝트에 적용합니다.
2. `js/config.example.js`를 `js/config.js`로 복사해 `adapter: 'supabase'`, `supabaseUrl`, `supabaseAnonKey`(anon 키만)를 채웁니다.
3. 정적 파일을 웹서버에 복사해 배포합니다.

자세한 절차, 백업·복원, 부서원 관리, 키 교체, 장애 대응은 [docs/OPERATIONS.md](docs/OPERATIONS.md)에 있습니다.

## 폴더 구조

```
index.html          앱 진입점(CSP·noindex, modulepreload 목록 포함)
dev.html            디자인 토큰 확인용 개발 페이지
css/                tokens.css(디자인 토큰) · base.css · components.css
js/
  main.js           진입점: 설정 → 데이터 계층 → URL 복원 → 사용자 식별 → 화면
  compat.js         지원하지 않는 브라우저 안내(ES5 일반 스크립트)
  config.example.js 설정 예시(js/config.js는 git 제외)
  api/              taskApi.js(화면이 쓰는 유일한 데이터 창구) + adapters/{local,supabase}.js
  domain/           UI와 무관한 순수 로직(날짜·검증·필터·정렬·통계·긴급 배지·충돌 판단)
  state/            store · selectors · criteria(검색·필터) · actions · realtime · remote · urlState
  ui/               대화상자·폼·토스트·필터바·작성자 식별 등 공통 UI
  views/            list · kanban · calendar · dashboard
vendor/             supabase-js(정적 파일, 외부 CDN을 쓰지 않는다)
supabase/           migrations/0001_init.sql · queries/kpi.sql
tests/              단위 테스트(*.test.js) · e2e/(Playwright)
tools/              개발 서버 · 명도 대비 계산 · modulepreload 생성
docs/               OPERATIONS · KNOWN_LIMITS · BROWSERS · TEST_REPORT
```

## 테스트

```bash
npm test             # 단위·정적 점검(node --test): 도메인 로직, 명도 대비, RLS, 보안 규칙, 호환 문법
npm run test:e2e     # 브라우저 시나리오(Playwright): 기능, 접근성(axe), 반응형, CSP, 성능
```

e2e는 `playwright-core`만 설치하고 **PC에 설치된 Microsoft Edge**를 씁니다(브라우저를 따로 내려받지 않습니다). 특정 파일만 돌리려면 `node --test tests/e2e/stage4.e2e.js`처럼 지정하고, 스크린샷을 저장하려면 `SHOT_DIR=<폴더>`를 줍니다. 실행 결과와 아직 검증하지 못한 항목은 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)에 정리했습니다.

## 개발 규칙 요약

- 색·간격·모서리·그림자·모션은 `css/tokens.css`의 변수만 씁니다(자동 점검이 hex·px 하드코딩을 막습니다).
- 사용자 입력은 `innerHTML`에 넣지 않고 텍스트로만 출력합니다(`js/ui/dom.js`의 `h()`).
- 화면 코드는 DB 클라이언트를 직접 부르지 않고 `taskApi`만 거칩니다.
- ES2020까지의 문법만 씁니다. 지원 브라우저와 사용 기능은 [docs/BROWSERS.md](docs/BROWSERS.md)를 보세요.
- `index.html`의 `modulepreload` 목록은 `node tools/modulepreload.mjs --write`로 갱신합니다(모듈을 추가·삭제하면 `npm test`가 알려 줍니다).
