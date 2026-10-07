-- 테스트용 샘플 데이터: 부서원 6명, 할일 20건, 댓글 4건 (앱의 local 어댑터 샘플과 같은 내용).
-- 마이그레이션(0001_init.sql) 적용 뒤 SQL Editor(관리자 권한)에서 한 번 실행한다. 운영 데이터가 있는 프로젝트에서는 실행하지 않는다.
-- 마감일은 실행한 날(한국 시간) 기준 상대값이라 임박·지연 배지, 캘린더, 대시보드를 바로 시험할 수 있다.
-- 이미 할일이 있으면 아무것도 넣지 않는다(중복 방지).

do $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid;
begin
  if exists (select 1 from public.tasks) then
    raise notice '이미 할일이 있어 샘플 데이터를 넣지 않습니다.';
    return;
  end if;

  -- 같은 이름이 이미 있으면 재사용한다.
  insert into public.members (name)
  select n from unnest(array['김민준', '이서연', '박지호', '최유나', '정도윤', '한지우']) as n
  where not exists (select 1 from public.members m where m.name = n and m.label is null);

  select id into m1 from public.members where name = '김민준' and label is null limit 1;
  select id into m2 from public.members where name = '이서연' and label is null limit 1;
  select id into m3 from public.members where name = '박지호' and label is null limit 1;
  select id into m4 from public.members where name = '최유나' and label is null limit 1;
  select id into m5 from public.members where name = '정도윤' and label is null limit 1;
  select id into m6 from public.members where name = '한지우' and label is null limit 1;

  -- (제목, 상태, 우선순위, 담당자, 카테고리, 마감일 오프셋(일), 설명). 완료 시각은 트리거가 기록한다.
  insert into public.tasks (title, status, priority, assignee_id, category, due_date, description, created_by, updated_by)
  select v.title, v.status, v.priority, v.assignee, v.category, case when v.due is null then null else today + v.due end, v.descr, m1, m1
  from (values
    ('분기 업무 계획서 작성',      'in_progress', 'high',   m1, '기획',   3,    null),
    ('신규 기능 API 설계',         'todo',        'high',   m2, '개발',   4,    null),
    ('메인 화면 시안 검토',        'todo',        'medium', m3, '디자인', 0,    null),
    ('서버 로그 정리',             'in_progress', 'low',    m4, '운영',  -1,    null),
    ('주간 회의 자료 준비',        'todo',        'medium', m1, '기획',   1,    null),
    ('로그인 오류 수정',           'done',        'high',   m2, '개발',  -3,    null),
    ('아이콘 세트 교체',           'todo',        'low',    m3, '디자인', 10,   null),
    ('백업 점검',                  'in_progress', 'medium', m5, '운영',   2,    null),
    ('사용자 인터뷰 정리',         'done',        'medium', m6, '기획',  -5,    null),
    ('성능 측정 스크립트',         'todo',        'medium', null::uuid, '개발', null, null),
    ('비품 구매 요청',             'todo',        'low',    m4, '기타',  -2,    null),
    ('신입 온보딩 문서',           'in_progress', 'medium', m6, '기타',   7,    null),
    ('고객 문의 응대 매뉴얼 정리', 'in_progress', 'medium', m5, '운영',   5,    '자주 오는 문의 20건을 유형별로 묶고 답변 예시를 붙인다.'),
    ('신규 입사자 계정 발급',      'todo',        'high',   m4, '운영',   1,    '메신저·공유 드라이브·그룹웨어 계정. 입사일 전날까지.'),
    ('모바일 화면 점검',           'todo',        'medium', m3, '디자인', 6,    '375px 기준으로 목록·칸반·캘린더 레이아웃 확인.'),
    ('월간 보고서 초안 작성',      'in_progress', 'high',   m1, '기획',  -2,    '지난달 완료율과 지연 사유 정리.'),
    ('로그 모니터링 알림 설정',    'done',        'medium', m4, '운영',  -4,    null),
    ('접근성 점검 항목 정리',      'done',        'low',    m6, '기타',  -1,    null),
    ('데이터 백업 절차 문서화',    'todo',        'high',   m5, '운영',   3,    '주 1회 백업과 복원 연습 절차를 문서로 남긴다.'),
    ('디자인 시스템 컬러 검토',    'in_progress', 'medium', m3, '디자인', 8,    null)
  ) as v(title, status, priority, assignee, category, due, descr);

  insert into public.comments (task_id, author_id, body, created_at)
  select t.id, c.author, c.body, now() - make_interval(mins => c.minutes_ago)
  from (values
    ('분기 업무 계획서 작성', m2, '개발 일정은 2주 단위로 나눠서 적어 주세요.',      95),
    ('분기 업무 계획서 작성', m1, '네, 오늘 오후까지 반영해서 공유하겠습니다.',        70),
    ('로그인 오류 수정',      m2, '원인은 세션 만료 처리였고 수정 후 확인했습니다.',  300),
    ('백업 점검',             m5, '복원 테스트까지 해 봐야 해서 마감을 이틀 잡았습니다.', 40)
  ) as c(title, author, body, minutes_ago)
  join public.tasks t on t.title = c.title;

  raise notice '샘플 데이터를 넣었습니다: 할일 20건, 댓글 4건.';
end $$;
