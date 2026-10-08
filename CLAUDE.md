# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트: 부서 공용 업무 캘린더

기준 문서는 [PRD.md](PRD.md)(v0.1, 한국어)다. 구현이 PRD와 충돌하면 임의로 바꾸지 말고 먼저 질문한다. PRD에 없는 기능은 추가하지 않는다(Out of Scope 준수). 필드 제약, 토큰 값, 지표 정의 같은 상세는 PRD의 해당 절을 직접 확인한다.

## 현재 상태

5단계로 진행 중이다: 1 기반·스키마(완료) → 2 작성자 식별·CRUD·댓글·리스트 뷰(완료) → 3 필터·칸반·캘린더(완료) → 4 대시보드·실시간·충돌(완료) → 5 비기능 점검·문서(완료). 점검 결과와 미검증 항목은 `docs/TEST_REPORT.md`.

## 명령어

- **`npm run build`** — `js/`(ES 모듈)를 esbuild로 `dist/app.js`(일반 스크립트)로 묶는다. `index.html`은 이 번들만 읽으므로(그래야 `file://`로 직접 열어도 동작) **`js/`를 고치면 반드시 다시 빌드하고 `dist/app.js`도 함께 커밋한다.** `npm start`·`test:e2e`·`test:perf`·`test:db`는 먼저 자동 빌드하고, `npm test`는 번들이 최신인지 검사한다. 고치면서 보려면 `npm run build:watch`.
- `npm start` — 개발용 정적 서버(`http://localhost:8080`, 포트는 인자로 변경). 설정 `js/config.js`(일반 스크립트, `window.TODO_CONFIG`)가 없으면 `js/defaultConfig.js`(local 어댑터)로 동작한다. `index.html`을 더블클릭해서 `file://`로 열어도 된다.
- `npm test` — 단위 테스트(`node --test`, `tests/*.test.js`).
- `npm run test:perf` — 1,000건 성능 측정(`tests/perf/`). CPU 부하에 민감해 다른 작업 없이 따로 실행한다(일반 e2e와 섞지 않는다). 목표(필터 100ms·INP 200ms)에 근접해 실행마다 흔들린다.
- `npm run test:db` — `tests/db/`: DB 제약·트리거·RLS와 실제 supabase 어댑터(브라우저)를 PostgREST/Supabase에 대해 검증. `SUPABASE_URL`·`SUPABASE_REST_URL`·`SUPABASE_ANON_KEY`가 없으면 건너뛴다. 로컬 검증 방법은 `docs/TEST_REPORT.md`의 「실제 DB 검증」.
- `npm run test:e2e` — Playwright 시나리오(`tests/e2e/*.e2e.js`, 단계별 파일). `playwright-core`만 설치하고 **시스템에 설치된 Edge**(`channel: 'msedge'`)를 쓴다. 브라우저를 따로 내려받지 않는다. 스크린샷은 `SHOT_DIR=<폴더>`를 주면 저장한다. 테스트 서버 포트(8791~8796)가 막혀 `EACCES`가 나면(Windows가 8779~8978을 예약하는 PC) `E2E_PORT_OFFSET=10000`을 줘서 옮긴다.
- 단일 테스트: `node --test --test-name-pattern="<이름>" tests/<파일>`
- DB 스키마는 `supabase/migrations/0001_init.sql`. Supabase를 쓸 때만 적용하며 local 어댑터는 필요 없다.

## 코드 구조

- `js/api/taskApi.js` — 화면이 쓰는 유일한 데이터 창구. `setActor(memberId)`로 현재 사용자를 지정하면 `created_by`/`updated_by`/`author_id`를 자동으로 채운다. 어댑터는 `js/api/adapters/{local,supabase}.js`이며 DB 트리거 동작(`updated_at`, `completed_at`, `task_events`)을 local에서도 코드로 재현한다. 충돌은 `ApiError.code`(`CONFLICT`/`DELETED`/`NOT_FOUND`)로 구분한다.
- `js/domain/` — UI와 무관한 순수 로직(날짜, 검증, 긴급 배지, 정렬). 검증 규칙은 DB 제약과 같은 값을 쓴다.
- `js/state/store.js` + `actions.js` — 전역 상태와 데이터 동작. 화면은 store 구독으로 다시 그린다. 검색어·필터·뷰·월은 `criteria.js`로 바꾸고, **모든 뷰는 `selectors.js`의 `getVisibleTasks()` 하나만 통해 목록을 받는다**(뷰별로 따로 필터링하지 않는다). `urlState.js`가 이 상태를 URL 쿼리와 오가며 `main.js`가 `history.replaceState`로 동기화한다.
- **「진행 중 업무」 보기(`view=active`, `views/activeView.js`)**: PRD 4개 뷰 외에 요청으로 추가한 5번째 보기. 월과 무관하게 `status === 'in_progress'` 전체를 마감 지연·임박(오늘~D-3)·그 외·마감일 없음으로 묶어 보여 준다(그룹·마감 문구는 `domain/inProgress.js`, 긴급 판정은 `getUrgency` 재사용). 상태 조건은 **저장된 `filters.status`를 바꾸지 않고** `scopeFilters(view, filters)`가 이 보기에서만 `in_progress`로 덮어쓴다(그래서 `getVisibleTasks()`는 `state.view`를 본다). 이 보기의 「조건 초기화」(`clearAll`)는 검색·필터만 지우고 저장된 상태 필터는 남긴다. 탭·캘린더 바로가기의 건수는 `countInProgress()`(검색·필터와 무관한 전체 진행 중), 툴바는 「진행 중 N건 중 M건」(`getScopeTasks()`가 분모). 탭의 접근 가능한 이름은 `aria-label`로 덮어쓰지 않고 눈에 보이는 글자에서 나오게 한다(axe `label-content-name-mismatch`).
- 실시간: `state/realtime.js`가 변경 구독·포커스 복귀 재조회·연결 끊김 시 폴링(배너 표시)을 맡고, `reloadTasks()`가 이전 목록과 비교해(`domain/diff.js`) 다른 사람의 변경만 카드 표시(`remoteMarks`)와 토스트로 알린다. local 어댑터에서만 `window.__todoTest`(연결 끊김·폴링 간격) 훅이 있다.
- 충돌: 수정 폼은 `expectedUpdatedAt`으로 저장하되, 내가 바꾼 필드를 다른 사람이 건드리지 **않았으면** 충돌로 보지 않고 그대로 병합한다(필드 단위 LWW). 같은 필드일 때만 덮어쓰기/서버 값 사용을 묻는다(`taskForm.js`). `changeStatus`는 상태만 보내므로 `expectedUpdatedAt`을 쓰지 않는다.
- 대시보드 카드는 현재 필터 **위에** 조건(`urgency`, 상태, 담당자)을 덧붙여 리스트로 이동한다. 그래서 카드 숫자와 리스트 건수가 같다. `urgency`(임박/지연)는 PRD의 4개 필터 외에 이 목적으로 추가한 필터 키다.
- CSP는 인라인 스크립트·스타일을 막으므로 스타일은 CSS 파일로만, `el.style`·`style=` 속성을 쓰지 않는다. 번들 안의 모듈은 테스트에서 직접 import할 수 없으므로, local 어댑터일 때만 `window.__todoTest`(연결 끊김 흉내, `criteria`, `taskApi`)로 접근한다.
- 설정 파일(`js/config.js`)은 ES 모듈이 아니라 일반 스크립트다. 모듈로 만들면 `file://`에서 읽히지 않는다. 기본값은 `js/defaultConfig.js`, 예시는 `js/config.example.js`(둘이 같은 항목인지 테스트가 검사).
- 리스트·칸반은 `renderProgressive`(ui/dom.js)로 앞부분(40행·열마다 15장)을 먼저 그리고 나머지를 다음 프레임들에 붙인다. 그 이상 행을 세는 테스트는 렌더가 끝났는지 확인해야 한다. `realtime.js`의 동기화는 할일뿐 아니라 부서원 목록도 함께 갱신한다(새로 등록된 사람의 이름이 보이도록).
- 개발용 샘플은 `js/api/adapters/seed.js`(local, 저장소 키 `todo.local.db.v2`, 바꾸면 키 버전을 올린다)와 `supabase/seed.sql`. 일부 테스트가 제목·「오늘 마감 1건」에 의존하므로 기존 항목은 바꾸지 말고 추가만 한다.
- 칸반은 열마다 100장까지만 그리고 「더 보기」로 나머지를 펼친다(1,000건에서 필터 갱신 100ms 목표).
- `changeStatus`(actions.js)는 낙관적 업데이트이며 드래그·카드 메뉴·리스트 어디서든 같은 경로를 쓴다. 실패하면 되돌리고 토스트를 띄운다.
- `js/ui/dom.js`의 `h()`로만 DOM을 만든다(문자열은 항상 텍스트 노드). 다시 그릴 때 포커스를 유지하려면 요소에 `data-focus-key`를 붙이고 `preserveFocus()`를 쓴다. 대화상자는 `ui/dialog.js`(네이티브 `<dialog>`)를 통한다.
- e2e에서 칸반 드래그는 `page.mouse`로 단계적으로 움직여야 한다(Playwright `dragTo`는 한 번에 점프해 엉뚱한 카드를 집는다). 스크롤 영역 안의 `.visually-hidden`(절대 위치)은 컨테이너에 `position: relative`가 없으면 문서 폭을 넓힌다(`.kanban` 참고).

## 제품 개요

부서(10~20명) 내부용 공용 할일 관리 웹앱. 같은 데이터를 칸반·리스트·월간 캘린더·대시보드 4개 뷰로 본다. 반응형 단일 코드베이스. **로그인이 없고** 이름 입력으로만 작성자를 식별한다.

PRD는 이전 초안(localStorage 기반 일정 캘린더)을 대체한다. localStorage는 사용자 이름·UI 설정 같은 개인 정보에만 쓰고, 팀 데이터는 공용 DB(Supabase/Postgres)에 둔다. 휴가·부재자 패널은 범위 밖이다(PRD §9).

## 기술 제약

- HTML / CSS / Vanilla JS(소스는 ES 모듈, 배포는 esbuild로 묶은 `dist/app.js`). 프레임워크·npm **런타임** 의존성 없음(esbuild·Playwright·axe는 개발 도구). 필요한 라이브러리(`@supabase/supabase-js`)와 글꼴(Pretendard Variable 동적 서브셋 92조각 + `pretendard.css` + OFL 라이선스, `vendor/fonts/`)은 `vendor/`에 정적 파일로 포함한다(글꼴은 `font-display: swap`, 화면에 쓰는 글자가 든 조각만 내려받는다. 조각을 지우거나 배포 목록에서 빼면 `tests/fonts.test.js`가 잡는다).
- 외부 CDN·웹폰트 요청 금지(사내망 차단 대비).
- 모든 색·간격·모서리·그림자·모션 값은 `css/tokens.css`의 CSS 변수만 사용한다. 컴포넌트 CSS에 hex 색상, px 간격 숫자를 직접 쓰지 않는다(0, 1px 테두리 등 구조적 값 제외). 토큰 값을 바꿔도 WCAG 2.1 AA 명도 대비(본문 4.5:1, UI 요소 3:1)를 유지한다.
- 사용자 입력(제목·설명·댓글·이름·라벨)을 `innerHTML`에 넣지 않는다. 텍스트는 `textContent`로 출력하고, HTML을 조립해야 하면 공통 `escapeHtml()`을 거친다.
- 클라이언트 번들·저장소에는 Supabase anon key만 둔다. service role key는 어디에도 쓰지 않는다. 키와 URL은 `js/config.js`(git 제외, `config.example.js`만 커밋)에서 읽는다(일반 스크립트).
- 날짜는 한국 시간(Asia/Seoul) 달력일 기준 `YYYY-MM-DD` 문자열로 다룬다. `new Date('YYYY-MM-DD')`로 파싱하지 않는다.
- 데이터 접근은 `js/api/taskApi.js` 하나만 거친다. 화면 코드가 Supabase 클라이언트를 직접 부르지 않는다. 어댑터는 `supabase`와 `local`(localStorage, 키 없이 개발·검증용) 두 종류이며 같은 인터페이스·같은 트리거 동작을 따른다.
- 순수 로직(긴급 배지, 통계, 필터, 충돌 처리)은 UI와 분리해 `js/domain/`에 두고 `node --test`로 테스트한다.
- 코드·주석·UI 문구는 한국어(식별자는 영어). 화면 문구는 존댓말이 아닌 간결한 명사형/짧은 문장.

## 작업 방식

- 단계마다 (1) 계획을 먼저 보여 주고 (2) 구현하고 (3) 완료 기준을 직접 실행해 확인한 결과를 보고한 뒤 (4) 커밋한다. 확인하지 않은 것을 "됐다"고 하지 않는다.
- 막히면 추측하지 말고 무엇이 막혔는지와 선택지를 보고한다.

## 아키텍처상 지켜야 할 결정

- **전역 필터 상태 하나:** 검색어·필터(상태·우선순위·담당자·카테고리, 조건 간 AND, 한 조건 안에서는 OR)는 뷰와 무관한 하나의 상태이며 뷰를 바꿔도 유지된다. 대시보드 지표(M1~M6)도 같은 필터를 적용해 계산한다. 뷰와 필터는 URL 쿼리에 보존한다. (§5.5, F-11)
- **소프트 삭제:** 실제 DELETE는 어떤 테이블에서도 쓰지 않는다. `deleted_at`을 채우고 모든 조회·통계에서 제외한다. 삭제 직후 5초간 되돌리기를 제공한다.
- **서버가 시각을 정한다:** `updated_at`은 DB 트리거가, `completed_at`은 상태가 `done`이 될 때 서버가 기록한다. 클라이언트 시계 값은 쓰지 않는다.
- **동시 편집 = 필드 단위 last-write-wins:** 수정 시 *바꾼 필드만* 전송한다(객체 전체 덮어쓰기 금지). 같은 필드 충돌은 나중에 도착한 값이 이기고, 편집창을 연 뒤 서버의 `updated_at`이 달라졌으면 저장 전에 덮어쓰기/서버 값 사용을 묻는다. 수정과 삭제가 겹치면 삭제 우선. (§6.3)
- **실시간 동기화 3단 구조:** Realtime 구독이 기본, 탭 포커스 복귀 시 전체 재조회, 연결이 끊기면 30초 폴링으로 전환하고 "연결 끊김" 표시. 편집 중인 폼의 입력은 외부 변경이 와도 지우지 않는다.
- **낙관적 업데이트:** 저장 응답 전에 화면에 반영하고, 실패하면 되돌리고 오류를 안내한다.
- **긴급 배지:** 미완료 + 마감일 있는 항목만. 한국 시간 달력일 기준 D-3~D-day는 임박, D+n은 지연. 항상 텍스트(`D-1`)를 함께 표시한다. (§5.4)
- **`task_events`:** 상태·담당자·마감일·우선순위 변경 이력. 충돌 시 되돌리는 근거로 쓴다.

## 보안·접근성 (PRD §7)

- 모든 테이블 RLS 활성화, DELETE 정책 없음. 입력 검증은 클라이언트와 별개로 DB(enum, CHECK, NOT NULL, FK, 트리거)에서도 강제한다. 로그인이 없어 RLS가 사용자를 구분하지 못하는 한계는 의도된 것이다(§6.2, §7.4).
- CSP는 `default-src 'self'`, 인라인 스크립트 금지, 연결은 DB 도메인만 허용. `noindex` 적용.
- 상태·우선순위·긴급 여부는 색만으로 구분하지 않는다. 칸반 드래그에는 키보드·모바일 대체 수단(카드 메뉴 "상태 변경")이 필요하다. 대화상자는 포커스 트랩·Esc 닫기·포커스 복귀를 지킨다.
- 지원 브라우저는 최신 Chrome/Edge/Firefox, Safari 16.4+. ES2020, CSS Grid/Custom Properties, `<dialog>`, Fetch, WebSocket 범위 내 기능만 쓴다.
