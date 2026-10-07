# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트: 부서 공용 업무 캘린더

기준 문서는 [PRD.md](PRD.md)(v0.1, 한국어)다. 구현이 PRD와 충돌하면 임의로 바꾸지 말고 먼저 질문한다. PRD에 없는 기능은 추가하지 않는다(Out of Scope 준수). 필드 제약, 토큰 값, 지표 정의 같은 상세는 PRD의 해당 절을 직접 확인한다.

## 현재 상태

5단계로 진행 중이다: 1 기반·스키마(완료) → 2 작성자 식별·CRUD·댓글·리스트 뷰(완료) → 3 필터·칸반·캘린더 → 4 대시보드·실시간·충돌 → 5 비기능 점검·문서. 칸반·캘린더·대시보드 탭은 아직 비활성이다.

## 명령어

- `npm start` — 개발용 정적 서버(`http://localhost:8080`, 포트는 인자로 변경). `js/config.js`가 없으면 `config.example.js`(local 어댑터)로 동작한다.
- `npm test` — 단위 테스트(`node --test`, `tests/*.test.js`).
- `npm run test:e2e` — Playwright 스모크(`tests/e2e/*.e2e.js`). `playwright-core`만 설치하고 **시스템에 설치된 Edge**(`channel: 'msedge'`)를 쓴다. 브라우저를 따로 내려받지 않는다. 스크린샷은 `SHOT_DIR=<폴더>`를 주면 저장한다.
- 단일 테스트: `node --test --test-name-pattern="<이름>" tests/<파일>`
- DB 스키마는 `supabase/migrations/0001_init.sql`. Supabase를 쓸 때만 적용하며 local 어댑터는 필요 없다.

## 코드 구조

- `js/api/taskApi.js` — 화면이 쓰는 유일한 데이터 창구. `setActor(memberId)`로 현재 사용자를 지정하면 `created_by`/`updated_by`/`author_id`를 자동으로 채운다. 어댑터는 `js/api/adapters/{local,supabase}.js`이며 DB 트리거 동작(`updated_at`, `completed_at`, `task_events`)을 local에서도 코드로 재현한다. 충돌은 `ApiError.code`(`CONFLICT`/`DELETED`/`NOT_FOUND`)로 구분한다.
- `js/domain/` — UI와 무관한 순수 로직(날짜, 검증, 긴급 배지, 정렬). 검증 규칙은 DB 제약과 같은 값을 쓴다.
- `js/state/store.js` + `actions.js` — 전역 상태와 데이터 동작. 화면은 store 구독으로 다시 그린다.
- `js/ui/dom.js`의 `h()`로만 DOM을 만든다(문자열은 항상 텍스트 노드). 다시 그릴 때 포커스를 유지하려면 요소에 `data-focus-key`를 붙이고 `preserveFocus()`를 쓴다. 대화상자는 `ui/dialog.js`(네이티브 `<dialog>`)를 통한다.

## 제품 개요

부서(10~20명) 내부용 공용 할일 관리 웹앱. 같은 데이터를 칸반·리스트·월간 캘린더·대시보드 4개 뷰로 본다. 반응형 단일 코드베이스. **로그인이 없고** 이름 입력으로만 작성자를 식별한다.

PRD는 이전 초안(localStorage 기반 일정 캘린더)을 대체한다. localStorage는 사용자 이름·UI 설정 같은 개인 정보에만 쓰고, 팀 데이터는 공용 DB(Supabase/Postgres)에 둔다. 휴가·부재자 패널은 범위 밖이다(PRD §9).

## 기술 제약

- HTML / CSS / Vanilla JS(ES 모듈). 프레임워크·번들러·npm 런타임 의존성 없음. 필요한 라이브러리(`@supabase/supabase-js`)는 `vendor/`에 정적 파일로 포함한다.
- 외부 CDN·웹폰트 요청 금지(사내망 차단 대비).
- 모든 색·간격·모서리·그림자·모션 값은 `css/tokens.css`의 CSS 변수만 사용한다. 컴포넌트 CSS에 hex 색상, px 간격 숫자를 직접 쓰지 않는다(0, 1px 테두리 등 구조적 값 제외). 토큰 값을 바꿔도 WCAG 2.1 AA 명도 대비(본문 4.5:1, UI 요소 3:1)를 유지한다.
- 사용자 입력(제목·설명·댓글·이름·라벨)을 `innerHTML`에 넣지 않는다. 텍스트는 `textContent`로 출력하고, HTML을 조립해야 하면 공통 `escapeHtml()`을 거친다.
- 클라이언트 번들·저장소에는 Supabase anon key만 둔다. service role key는 어디에도 쓰지 않는다. 키와 URL은 `js/config.js`(git 제외, `config.example.js`만 커밋)에서 읽는다.
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
