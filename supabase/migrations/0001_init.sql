-- 부서 공용 업무 캘린더 — 초기 스키마 (PRD 5.2~5.3, 6.3, 7.4)
--
-- [한계] anon key는 클라이언트에 공개된다고 가정한다.
-- [한계] 로그인이 없으므로 RLS는 사용자를 구분하지 못한다. 허용 동작의 종류와 데이터 형식만 제한한다.
-- [한계] anon key와 URL을 아는 사람은 허용된 범위 안에서 모든 데이터를 읽고 쓸 수 있다(사내망 제한으로 보완).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null
              check (char_length(name) between 1 and 20 and name = btrim(name)),
  label       text
              check (label is null or char_length(label) <= 10),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null
               check (char_length(title) between 1 and 100 and title = btrim(title)),
  description  text
               check (description is null or char_length(description) <= 2000),
  status       text not null default 'todo'
               check (status in ('todo', 'in_progress', 'done')),
  priority     text not null default 'medium'
               check (priority in ('high', 'medium', 'low')),
  assignee_id  uuid references public.members (id),
  category     text default '기타',
  due_date     date,
  completed_at timestamptz,
  created_by   uuid not null references public.members (id),
  updated_by   uuid not null references public.members (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index tasks_due_date_idx on public.tasks (due_date) where deleted_at is null;
create index tasks_assignee_idx on public.tasks (assignee_id) where deleted_at is null;

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id),
  author_id   uuid not null references public.members (id),
  body        text not null
              check (char_length(body) between 1 and 1000 and body = btrim(body)),
  created_at  timestamptz not null default now()
);

create index comments_task_idx on public.comments (task_id, created_at);

create table public.task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id),
  actor_id    uuid not null references public.members (id),
  field       text not null
              check (field in ('status', 'assignee_id', 'due_date', 'priority')),
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);

create index task_events_task_idx on public.task_events (task_id, created_at);

-- ---------------------------------------------------------------------------
-- 트리거: 앞뒤 공백 제거 (CHECK는 공백이 남은 값을 거부하므로 그 앞에서 정리)
-- ---------------------------------------------------------------------------

create function public.trim_text_fields() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'tasks' then
    new.title := btrim(new.title);
    new.description := nullif(btrim(new.description), '');
  elsif tg_table_name = 'members' then
    new.name := btrim(new.name);
    new.label := nullif(btrim(new.label), '');
  elsif tg_table_name = 'comments' then
    new.body := btrim(new.body);
  end if;
  return new;
end $$;

create trigger tasks_trim    before insert or update on public.tasks    for each row execute function public.trim_text_fields();
create trigger members_trim  before insert or update on public.members  for each row execute function public.trim_text_fields();
create trigger comments_trim before insert         on public.comments for each row execute function public.trim_text_fields();

-- ---------------------------------------------------------------------------
-- 트리거: tasks 서버 관리 필드 (클라이언트가 보낸 값은 무시)
-- ---------------------------------------------------------------------------

create function public.tasks_server_fields() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at   := now();
    new.updated_at   := now();
    new.deleted_at   := null;
    new.completed_at := case when new.status = 'done' then now() else null end;
  else
    new.id         := old.id;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    if new.status = 'done' then
      -- 이미 완료 상태였다면 최초 완료 시각을 유지한다.
      new.completed_at := case when old.status = 'done' then old.completed_at else now() end;
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger tasks_server_fields
  before insert or update on public.tasks
  for each row execute function public.tasks_server_fields();

-- ---------------------------------------------------------------------------
-- 트리거: 변경 이력 (status / assignee_id / due_date / priority)
-- ---------------------------------------------------------------------------

create function public.tasks_log_events() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into task_events (task_id, actor_id, field, from_value, to_value)
    values (new.id, new.updated_by, 'status', old.status, new.status);
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into task_events (task_id, actor_id, field, from_value, to_value)
    values (new.id, new.updated_by, 'assignee_id', old.assignee_id::text, new.assignee_id::text);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into task_events (task_id, actor_id, field, from_value, to_value)
    values (new.id, new.updated_by, 'due_date', old.due_date::text, new.due_date::text);
  end if;
  if new.priority is distinct from old.priority then
    insert into task_events (task_id, actor_id, field, from_value, to_value)
    values (new.id, new.updated_by, 'priority', old.priority, new.priority);
  end if;
  return new;
end $$;

create trigger tasks_log_events
  after update on public.tasks
  for each row execute function public.tasks_log_events();

-- ---------------------------------------------------------------------------
-- 권한 + RLS (PRD 7.4): DELETE는 전 테이블에서 허용하지 않는다.
-- 정책이 없는 동작은 기본 거부.
-- ---------------------------------------------------------------------------

alter table public.members     enable row level security;
alter table public.tasks       enable row level security;
alter table public.comments    enable row level security;
alter table public.task_events enable row level security;

revoke all on public.members, public.tasks, public.comments, public.task_events from anon, authenticated;

grant select, insert         on public.members     to anon;
grant select, insert, update on public.tasks       to anon;
grant select, insert         on public.comments    to anon;
grant select, insert         on public.task_events to anon;

create policy members_select on public.members for select to anon using (true);
create policy members_insert on public.members for insert to anon with check (true);

create policy tasks_select on public.tasks for select to anon using (true);
create policy tasks_insert on public.tasks for insert to anon with check (true);
create policy tasks_update on public.tasks for update to anon using (true) with check (true);

create policy comments_select on public.comments for select to anon using (true);
create policy comments_insert on public.comments for insert to anon with check (true);

create policy task_events_select on public.task_events for select to anon using (true);
create policy task_events_insert on public.task_events for insert to anon with check (true);

-- ---------------------------------------------------------------------------
-- Realtime (PRD 6.3): tasks, comments 변경 구독
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.comments;
  end if;
end $$;
