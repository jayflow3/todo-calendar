# 지원 브라우저와 사용 기능

## 지원 범위 (PRD 7.6)

| 구분 | 범위 |
| --- | --- |
| 데스크탑 | Chrome, Edge, Firefox 최신 2개 메이저 버전 / Safari 16.4 이상 |
| 모바일 | iOS Safari 16.4 이상, Android Chrome 최신 2개 메이저 버전 |
| 미지원 | Internet Explorer 및 위 범위 이전 버전 — 접속하면 안내 문구가 표시되고 앱은 시작하지 않습니다 |

## 사용한 기능과 최소 버전

값은 MDN 브라우저 호환성 데이터(`@mdn/browser-compat-data`)에서 직접 조회한 것입니다. 「PRD 목록」은 PRD 7.6이 허용한 표준 기능 목록(CSS Grid/Custom Properties, `<dialog>`, ES2020, Fetch, WebSocket)에 있는지를 뜻합니다.

| 기능 | Chrome/Edge | Firefox | Safari | PRD 목록 | 쓰는 곳 |
| --- | --- | --- | --- | --- | --- |
| `<dialog>.showModal()`, `::backdrop` | 37 / 79 | 98 | 15.4 | 예 | 모든 대화상자 |
| CSS Grid, 사용자 정의 속성(`var()`) | 57 / 16 | 52 | 10.1 | 예 | 레이아웃, 디자인 토큰 |
| ES2020 문법(번들 `dist/app.js`는 일반 스크립트) | 80 | 74 | 13.1 | ES2020 | 앱 전체 |
| 옵셔널 체이닝 `?.`, `??` | 80 | 74 / 72 | 13.1 | ES2020 | 코드 전반 |
| `fetch`, `WebSocket` | 42 / 5 | 39 / 11 | 10.1 / 5 | 예 | Supabase 어댑터(vendor 안) |
| `inert` 속성 | 102 | 112 | 15.5 | 아니오 | 모바일 필터 시트가 열렸을 때 배경 차단 |
| `:focus-visible` | 86 | 85 | 15.4 | 아니오 | 포커스 표시 |
| `dvh` 단위 | 108 | 101 | 15.4 | 아니오 | 대화상자 최대 높이(바로 앞에 `vh` 대체값 선언) |
| `accent-color` | 93 | 92 | 15.4 | 아니오 | 체크박스 색(미지원이어도 기본 색으로 정상 동작) |
| `inset` 속기 | 87 | 66 | 14.1 | 아니오 | 모바일 필터 시트 |
| `scroll-snap-type` | 69 | 39 | 11 | 아니오 | 모바일 칸반 스와이프 |
| `Element.replaceChildren()` | 86 | 78 | 14 | 아니오 | 화면 다시 그리기 |
| `Array.prototype.flat()` | 69 | 62 | 12 | ES2019 | DOM 헬퍼 |
| `MediaQueryList` `change` 이벤트 | 39 | 55 | 14 | 아니오 | 반응형 상태 전환 |
| `CSS.escape()`, `CSS.supports()` | 46 / 28 | 31 / 22 | 10.1 / 9 | 아니오 | 포커스 복원, 지원 여부 점검 |
| `<input type="date">` | 20 | 57 | 14.1 | 아니오 | 마감일 입력 |

가장 높은 최소 버전은 `inert`의 **Safari 15.5**이며 모두 Safari 16.4 이하입니다. Firefox는 `inert`(112)가 가장 최근이라 「최신 2개 메이저」 범위에서는 문제가 없습니다.

### 알아둘 점

- 앱은 ES 모듈이 아니라 **일반 스크립트 하나**(`dist/app.js`)로 배포됩니다. 그래서 `index.html`을 파일로 직접 열어도(`file://`) 동작하고, 요청 수가 적어 모듈 연쇄 로딩 문제가 없습니다. 이 경로는 Edge에서 직접 확인했습니다.
- ES2021 이상 문법(`??=`, `.at()`, `replaceAll` 등)과 `structuredClone`은 쓰지 않습니다. 자동 점검(`tests/static.test.js`)이 이를 막습니다.
- 지원 여부 점검(`js/compat.js`)은 ES5로만 작성된 일반 스크립트라 오래된 브라우저에서도 안내 문구를 띄웁니다. 점검 항목: `dialog`, `inert`, `:focus-visible`, CSS Grid, `fetch`/`WebSocket`.

## 실제로 확인한 범위

- **확인함:** Microsoft Edge(Chromium) 최신판 — 자동 테스트 전체(`npm run test:e2e`)를 이 브라우저로 실행했습니다.
- **확인하지 못함(미검증):** Firefox, Safari(macOS·iOS), Android Chrome 실기기. 위 표는 호환성 데이터에 근거한 판단이며 실제 동작은 확인하지 않았습니다. 출시 전에 Safari와 Firefox에서 [TEST_REPORT.md](TEST_REPORT.md)의 수동 점검 항목을 직접 확인하세요.
