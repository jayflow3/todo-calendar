-- 성공 지표 집계 쿼리 (PRD 11장 K1~K4). 읽기 전용이며 Supabase SQL Editor에서 운영자가 실행한다.
-- 날짜 기준은 한국 시간(Asia/Seoul). 기간은 각 쿼리 맨 위의 params를 바꿔서 쓴다.
--
-- 활성 사용자 = 기간 안에 할일 등록·수정·댓글 중 하나라도 한 부서원(PRD 11장).
--   등록: tasks.created_by (created_at이 기간 안)
--   수정: tasks.updated_by (updated_at이 기간 안)  ← 마지막 수정자만 남으므로 한 항목을 여러 명이 고친 경우 마지막 사람만 센다
--   댓글: comments.author_id (created_at이 기간 안)
-- 로그인이 없어서 「누가 입력했다고 선택했는지」 기준이다(docs/KNOWN_LIMITS.md).
--
-- K5(주간 회의 활용)는 DB로 측정할 수 없다 → 회의 때 체크리스트로 직접 센다.
-- K6(성능)은 출시 전 측정(docs/TEST_REPORT.md), K7(데이터 유실 신고)은 신고 건수 기록, K8(접근성)은 출시 전 점검이다.

-- ---------------------------------------------------------------------------
-- K1 도입률 / K2 정착률 — 기간 안의 활성 사용자 ÷ 전체 활성 부서원
--   K1: 도입 후 2주 안에 80% 이상 → 기간을 도입일 ~ 도입일+14일로 지정
--   K2: 4주 차 이후 매주 70% 이상 → 기간을 한 주(월~일)로 지정해 매주 실행
-- ---------------------------------------------------------------------------
with params as (
  select
    (timestamp '2026-10-05 00:00' at time zone 'Asia/Seoul') as period_start,  -- 포함
    (timestamp '2026-10-19 00:00' at time zone 'Asia/Seoul') as period_end     -- 미포함
),
activity as (
  select t.created_by as member_id from public.tasks t, params p
   where t.created_at >= p.period_start and t.created_at < p.period_end
  union
  select t.updated_by from public.tasks t, params p
   where t.updated_at >= p.period_start and t.updated_at < p.period_end
  union
  select c.author_id from public.comments c, params p
   where c.created_at >= p.period_start and c.created_at < p.period_end
),
roster as (
  select id from public.members where active
)
select
  count(*) filter (where r.id in (select member_id from activity)) as active_users,
  count(*)                                                         as active_members,
  round(100.0 * count(*) filter (where r.id in (select member_id from activity)) / nullif(count(*), 0), 1) as active_rate_pct
from roster r;

-- K2를 최근 8주 추이로 한 번에 보기(주 시작: 월요일, 한국 시간)
with weeks as (
  select generate_series(
    date_trunc('week', (now() at time zone 'Asia/Seoul')) - interval '7 weeks',
    date_trunc('week', (now() at time zone 'Asia/Seoul')),
    interval '1 week'
  ) as week_start
),
activity as (
  select w.week_start, a.member_id
  from weeks w
  join lateral (
    select t.created_by as member_id from public.tasks t
     where (t.created_at at time zone 'Asia/Seoul') >= w.week_start and (t.created_at at time zone 'Asia/Seoul') < w.week_start + interval '1 week'
    union
    select t.updated_by from public.tasks t
     where (t.updated_at at time zone 'Asia/Seoul') >= w.week_start and (t.updated_at at time zone 'Asia/Seoul') < w.week_start + interval '1 week'
    union
    select c.author_id from public.comments c
     where (c.created_at at time zone 'Asia/Seoul') >= w.week_start and (c.created_at at time zone 'Asia/Seoul') < w.week_start + interval '1 week'
  ) a on true
)
select
  w.week_start::date as week_start,
  count(distinct a.member_id) filter (where m.active) as active_users,
  (select count(*) from public.members where active)  as active_members,
  round(100.0 * count(distinct a.member_id) filter (where m.active) / nullif((select count(*) from public.members where active), 0), 1) as active_rate_pct
from weeks w
left join activity a on a.week_start = w.week_start
left join public.members m on m.id = a.member_id
group by w.week_start
order by w.week_start;

-- ---------------------------------------------------------------------------
-- K3 최신성 — 진행 중 항목 중 최근 7일 안에 갱신된 비율(목표 80% 이상, 4주 차)
-- ---------------------------------------------------------------------------
select
  count(*) filter (where updated_at >= now() - interval '7 days') as fresh,
  count(*)                                                         as in_progress_total,
  round(100.0 * count(*) filter (where updated_at >= now() - interval '7 days') / nullif(count(*), 0), 1) as fresh_rate_pct
from public.tasks
where status = 'in_progress' and deleted_at is null;

-- ---------------------------------------------------------------------------
-- K4 마감 준수 — 지연 비율 = 지연(M5) ÷ 미완료
--   기준선: 도입 2주 차에 측정, 평가: 8주 차(기준선의 절반 이하 또는 10% 이하)
--   지연 = 미완료이면서 마감일이 한국 시간 오늘보다 앞선 항목(앱의 대시보드 M5와 같은 정의)
-- ---------------------------------------------------------------------------
select
  count(*) filter (where due_date < (now() at time zone 'Asia/Seoul')::date) as overdue,
  count(*)                                                                    as incomplete_total,
  round(100.0 * count(*) filter (where due_date < (now() at time zone 'Asia/Seoul')::date) / nullif(count(*), 0), 1) as overdue_rate_pct
from public.tasks
where status in ('todo', 'in_progress') and deleted_at is null;
