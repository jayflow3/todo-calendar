# 운영 가이드

운영 담당자(PRD 7.5, 열린 이슈 Q6)가 따라 하는 문서입니다. **백업을 설정하기 전에는 운영을 시작하지 않습니다.** 먼저 [KNOWN_LIMITS.md](KNOWN_LIMITS.md)를 읽어 이 앱이 신원을 보장하지 않는다는 점을 확인하세요.

## 1. Supabase 프로젝트 만들기와 스키마 적용

1. 회사 보안·개인정보 정책상 외부 SaaS DB를 써도 되는지, 데이터 저장 리전이 맞는지 먼저 확인합니다(PRD Q1). 불가하면 사내 서버 DB + 작은 API로 대체해야 하며 `js/api/taskApi.js` 뒤의 어댑터만 바꾸면 화면은 그대로입니다.
2. supabase.com에서 새 프로젝트를 만듭니다(리전: 서울 `ap-northeast-2` 권장). 무료 플랜은 활동이 없으면 일시정지될 수 있으므로(PRD Q2) 상시 운영이면 유료 플랜을 권장합니다.
3. 대시보드 **SQL Editor**에 [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql) 전체를 붙여 넣고 실행합니다. (Supabase CLI를 쓴다면 `supabase db push`.)
4. 적용 확인(SQL Editor):

   ```sql
   -- 4개 테이블 모두 rowsecurity = true 여야 한다
   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
   -- 정책: tasks(select/insert/update), comments·members·task_events(select/insert) 외에는 없어야 하고 delete는 없어야 한다
   select tablename, cmd, roles from pg_policies where schemaname = 'public' order by 1, 2;
   -- Realtime 대상에 tasks, comments가 있어야 한다
   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
   ```

5. (선택, **테스트용 프로젝트에서만**) 화면을 시험해 보려면 [supabase/seed.sql](../supabase/seed.sql)을 SQL Editor에서 실행합니다. 부서원 6명·할일 20건·댓글 4건이 들어가며, 이미 할일이 있으면 아무것도 넣지 않습니다.

## 2. 설정 파일 `js/config.js`

1. `js/config.example.js`를 `js/config.js`로 복사합니다(`js/config.js`는 git에 올리지 않습니다). ES 모듈이 아니라 `window.TODO_CONFIG = {…}`를 설정하는 **일반 스크립트**입니다(파일로 직접 열어도 읽히도록). 적지 않은 항목은 기본값(`js/defaultConfig.js`)을 씁니다.
2. 값을 채웁니다.

   ```js
   window.TODO_CONFIG = {
     adapter: 'supabase',
     supabaseUrl: 'https://<프로젝트 ref>.supabase.co',
     supabaseAnonKey: '<anon(public) key>',   // Project Settings → API → anon public
     categories: ['기획', '개발', '디자인', '운영', '기타'],
     overloadThreshold: 8,
     pollIntervalMs: 30000,
   };
   ```

3. **anon(공개) key만** 씁니다. `service_role` 키는 클라이언트·저장소 어디에도 두지 않습니다(자동 점검이 막습니다).

## 3. CSP의 DB 도메인 좁히기

`index.html`의 CSP 메타 태그 `connect-src`에 `https://*.supabase.co wss://*.supabase.co`가 들어 있습니다. 배포 전에 **우리 프로젝트 주소로 좁힙니다.**

```
connect-src 'self' https://<프로젝트 ref>.supabase.co wss://<프로젝트 ref>.supabase.co
```

웹서버에서 `Content-Security-Policy` 응답 헤더로 같은 값을 내려 주면 메타 태그보다 우선해 더 안전합니다.

## 4. 배포 (정적 파일 복사)

배포할 때 빌드는 필요 없습니다. 묶인 결과물(`dist/app.js`)이 저장소에 들어 있어서 아래 파일만 웹서버 문서 루트에 복사하면 됩니다. (소스 `js/`를 고쳤다면 먼저 `npm run build`.)

| 복사 | 제외(개발용) |
| --- | --- |
| `index.html`, `css/`, `dist/app.js`, `js/compat.js`, `js/config.js`(**직접 만든 설정**), `vendor/supabase-js.umd.js` | `js/`의 나머지 소스, `tests/`, `tools/`, `docs/`, `supabase/`, `node_modules/`, `dev.html`, `PRD.md`, `package*.json` |

권장 웹서버 설정(nginx 예시, 사내 주소에 맞게 수정):

```nginx
server {
  listen 443 ssl http2;
  server_name todo.example.internal;
  root /var/www/todo;

  # 접근 범위 제한(KNOWN_LIMITS.md 3). 사내망/VPN 대역만 허용한다.
  allow 10.0.0.0/8;
  deny all;

  gzip on;
  gzip_types text/css application/javascript text/javascript;
  add_header X-Robots-Tag "noindex, nofollow";
  add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
  location = /index.html { add_header Cache-Control "no-cache"; }
}
```

배포 후 새 버전이 반영되지 않으면 브라우저 캐시 때문일 수 있습니다. 모듈 파일은 `Cache-Control: no-cache`(조건부 요청)로 두는 것이 가장 단순합니다.

## 5. 백업과 복원 (주 1회 이상)

Supabase 무료 플랜은 자동 백업이 없으므로 직접 받아야 합니다. 유료 플랜의 일일 백업이 있어도 별도 덤프를 한 벌 더 권장합니다.

```bash
# 백업 — 연결 문자열은 Project Settings → Database → Connection string
pg_dump "$DATABASE_URL" --schema=public --no-owner -Fc -f "todo-$(date +%F).dump"

# 복원(빈 프로젝트 또는 로컬 PostgreSQL로)
pg_restore --clean --if-exists --no-owner -d "$TARGET_DATABASE_URL" todo-2026-10-07.dump
```

- 스케줄: cron(Linux) 또는 작업 스케줄러(Windows)로 매주 실행하고 최근 4개를 보관합니다. 실패 알림을 받을 담당자를 정합니다.
- **복원 연습을 한 번은 해 봅니다.** 덤프를 만든 것만으로는 복원이 되는지 알 수 없습니다. 새(임시) 프로젝트에 복원한 뒤 위 4단계 확인 쿼리를 다시 실행합니다.
- 복원 후에는 Realtime publication(`supabase_realtime`)에 `tasks`, `comments`가 있는지 확인합니다.

## 6. 부서원 관리

- **추가:** 앱의 「사용자 변경」에서 이름을 입력하면 등록됩니다. 동명이인이 있으면 라벨(팀·약칭)을 함께 입력하게 됩니다.
- **퇴사·전출(비활성):** 앱에서는 할 수 없습니다(RLS가 `members` 수정을 허용하지 않음). SQL Editor에서 운영자가 처리합니다. 삭제하지 않고 비활성화해야 과거 기록의 이름이 유지됩니다.

  ```sql
  update public.members set active = false where id = '<부서원 uuid>';
  -- 이름으로 찾기: select id, name, label from public.members where name = '홍길동';
  ```

  비활성 부서원은 이름 입력·담당자 선택 목록에서 사라집니다. 이미 담당자로 지정된 할일에는 이름이 그대로 표시됩니다.

## 7. 카테고리·과부하 기준 바꾸기

`js/config.js`의 `categories`, `overloadThreshold`를 고쳐 다시 배포합니다. 카테고리는 DB 제약이 없으므로 목록에서 뺀 카테고리의 기존 할일은 값이 유지되며 필터 목록에 계속 나타납니다.

## 8. 키 교체 (부서원 변경·유출 의심 시)

anon key는 번들에 들어 있어 누구나 볼 수 있으므로, 부서 밖으로 URL이 퍼졌거나 퇴사자 접근을 끊어야 할 때 교체합니다.

1. Project Settings → API → **JWT Secret 재생성**(기존 anon/service_role 키가 모두 무효화됩니다).
2. 새 anon key를 `js/config.js`에 넣고 재배포합니다.
3. 사용자에게 새로고침(Ctrl+F5)을 안내합니다. 그 전까지는 모든 요청이 거부됩니다.
4. 사내망 허용 대역(nginx `allow`)도 함께 점검합니다. 키 교체만으로는 URL을 아는 사람이 새 키를 다시 받는 것을 막지 못합니다.

## 9. RLS 점검 (배포 전·정책 변경 후)

**자동 점검(권장):** 저장소에서 아래를 실행하면 제약·트리거·RLS(DELETE 거부 등)와 실제 supabase 어댑터(등록·수정·동시 편집 충돌·소프트 삭제)를 한 번에 확인합니다. 테스트가 만든 데이터는 소프트 삭제만 가능해 남으므로 **테스트용 프로젝트**에서 실행하세요.

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_REST_URL=https://<ref>.supabase.co/rest/v1 SUPABASE_ANON_KEY=<anon key> npm run test:db
```

**수동 점검:** anon key로 허용되지 않은 동작이 거부되는지 직접 확인합니다. `$URL`, `$ANON`은 프로젝트 값입니다.

```bash
H=(-H "apikey: $ANON" -H "Authorization: Bearer $ANON")

# 허용: 조회 → 200
curl -s -o /dev/null -w "%{http_code}\n" "$URL/rest/v1/tasks?select=id&limit=1" "${H[@]}"

# 거부되어야 함: 삭제 → 401/403 (42501 permission denied)
curl -s -w "\n%{http_code}\n" -X DELETE "$URL/rest/v1/tasks?id=eq.00000000-0000-0000-0000-000000000000" "${H[@]}"
curl -s -w "\n%{http_code}\n" -X DELETE "$URL/rest/v1/comments?id=eq.00000000-0000-0000-0000-000000000000" "${H[@]}"

# 거부되어야 함: 댓글·부서원·이력 수정 → 401/403
curl -s -w "\n%{http_code}\n" -X PATCH "$URL/rest/v1/comments?id=eq.00000000-0000-0000-0000-000000000000" "${H[@]}" -H "Content-Type: application/json" -d '{"body":"x"}'
curl -s -w "\n%{http_code}\n" -X PATCH "$URL/rest/v1/members?id=eq.00000000-0000-0000-0000-000000000000" "${H[@]}" -H "Content-Type: application/json" -d '{"active":false}'

# 목록에 없는 테이블 → 404
curl -s -o /dev/null -w "%{http_code}\n" "$URL/rest/v1/pg_user?select=*" "${H[@]}"
```

## 10. 소프트 삭제 데이터의 영구 삭제 (90일 후, 수동)

앱의 삭제는 `deleted_at`을 채우는 소프트 삭제입니다. 90일이 지난 항목은 운영자가 SQL Editor(관리자 권한)에서 정리할 수 있습니다. 앱(anon)은 DELETE를 할 수 없습니다.

```sql
begin;
create temp table to_purge on commit drop as
  select id from public.tasks where deleted_at < now() - interval '90 days';
-- 외래 키 순서: 댓글·이력 → 할일
delete from public.comments    where task_id in (select id from to_purge);
delete from public.task_events where task_id in (select id from to_purge);
delete from public.tasks       where id      in (select id from to_purge);
commit;
```

실행 전에 반드시 최근 백업이 있는지 확인합니다.

## 11. 장애 시 확인 순서

1. **화면 상단에 「연결 끊김 — 최신이 아닐 수 있음」** — 실시간 연결 문제입니다. 30초마다 자동으로 다시 불러오므로 데이터는 조금 늦게 갱신됩니다. 계속되면 아래를 이어서 봅니다.
2. **Supabase 프로젝트 상태** — 무료 플랜의 일시정지(Paused) 여부, 대시보드의 서비스 상태, 월 사용량 한도.
3. **브라우저 개발자 도구 콘솔/네트워크**
   - `Content Security Policy` 오류 → 3절의 `connect-src`가 실제 프로젝트 주소와 같은지.
   - 401/403 → anon key가 교체되었는데 `js/config.js`가 옛 값이거나, RLS 정책이 바뀌었는지(9절).
   - 404/CORS → `supabaseUrl` 오타.
4. **Realtime** — 1절의 publication 확인 쿼리. 목록은 보이는데 변경이 실시간으로 안 오면 대개 publication에 테이블이 빠진 경우입니다.
5. **배포물** — `js/config.js`가 서버에 있는지(없으면 예시 설정인 local 어댑터로 동작해 팀 데이터가 공유되지 않습니다), `vendor/supabase-js.umd.js`가 있는지.
6. 위로 해결되지 않으면 최근 백업으로 복원 가능한지(5절) 확인한 뒤 대응합니다.

## 12. 성공 지표 집계

[supabase/queries/kpi.sql](../supabase/queries/kpi.sql)을 SQL Editor에서 실행합니다(K1~K4). K5·K7은 DB로 측정할 수 없어 직접 기록합니다.
