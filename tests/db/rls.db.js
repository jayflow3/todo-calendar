// DB 계약 테스트: 스키마(제약·트리거)와 RLS를 anon 키로 REST API(PostgREST)에 직접 호출해 확인한다.
// 실제 Supabase 프로젝트에도 그대로 쓸 수 있다(docs/OPERATIONS.md 9절). 환경변수가 없으면 건너뛴다.
//
//   SUPABASE_REST_URL=https://<ref>.supabase.co/rest/v1  SUPABASE_ANON_KEY=<anon key>  npm run test:db
//
// 테스트가 만든 부서원·할일은 소프트 삭제(deleted_at)만 하고 남겨 둔다. anon은 DELETE를 할 수 없기 때문이다.
// 그러므로 운영 중인 프로젝트가 아니라 테스트용 프로젝트에서 실행하는 것을 권한다.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const REST = process.env.SUPABASE_REST_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_ANON_KEY;
const skip = !REST || !KEY ? 'SUPABASE_REST_URL / SUPABASE_ANON_KEY가 없어 건너뜀' : false;
const stamp = Date.now().toString(36);

async function api(method, path, body, { prefer = 'return=representation' } = {}) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 본문이 JSON이 아닐 수 있다 */ }
  return { status: res.status, json, text };
}

const denied = (r) => [401, 403].includes(r.status) || r.json?.code === '42501';
const rejected = (r) => r.status === 400 || r.status === 409; // CHECK(23514)·FK(23503) 위반 등
const ZERO = '00000000-0000-0000-0000-000000000000';

describe('DB 계약(anon 키)', { skip }, () => {
  let me;
  let other;

  test('준비: 부서원을 등록하면 이름 공백이 정리되어 저장된다', async () => {
    const a = await api('POST', '/members', { name: `  테스터${stamp}  `, label: '  QA  ' });
    assert.equal(a.status, 201, a.text);
    me = a.json[0];
    assert.equal(me.name, `테스터${stamp}`);
    assert.equal(me.label, 'QA');
    assert.equal(me.active, true);
    const b = await api('POST', '/members', { name: `상대${stamp}` });
    assert.equal(b.status, 201, b.text);
    other = b.json[0];
  });

  test('부서원 제약: 이름 21자·빈 이름·라벨 11자는 거부된다', async () => {
    for (const body of [{ name: 'a'.repeat(21) }, { name: '   ' }, { name: 'ok', label: 'a'.repeat(11) }]) {
      const r = await api('POST', '/members', body);
      assert.ok(rejected(r), `${JSON.stringify(body).slice(0, 40)} → ${r.status} ${r.text}`);
    }
  });

  test('할일 등록: 기본값과 서버 관리 필드(클라이언트가 보낸 시각·완료 시각은 무시)', async () => {
    const r = await api('POST', '/tasks', {
      title: `  제목${stamp}  `, created_by: me.id, updated_by: me.id,
      created_at: '1999-01-01T00:00:00Z', updated_at: '1999-01-01T00:00:00Z', completed_at: '1999-01-01T00:00:00Z', deleted_at: '1999-01-01T00:00:00Z',
    });
    assert.equal(r.status, 201, r.text);
    const t = r.json[0];
    assert.equal(t.title, `제목${stamp}`);
    assert.equal(t.status, 'todo');
    assert.equal(t.priority, 'medium');
    assert.equal(t.category, '기타');
    assert.equal(t.completed_at, null);
    assert.equal(t.deleted_at, null);
    assert.ok(new Date(t.created_at).getFullYear() >= 2026, `created_at=${t.created_at}`);
    assert.ok(new Date(t.updated_at).getFullYear() >= 2026);
    me.task = t;
  });

  test('할일 제약: 제목 빈 값·공백·101자, 설명 2001자, 잘못된 상태·우선순위·존재하지 않는 부서원은 거부', async () => {
    const base = { created_by: me.id, updated_by: me.id };
    for (const body of [
      { title: '' }, { title: '   ' }, { title: 'a'.repeat(101) }, { title: 'ok', description: 'a'.repeat(2001) },
      { title: 'ok', status: 'bogus' }, { title: 'ok', priority: 'urgent' },
      { title: 'ok', created_by: ZERO, updated_by: ZERO },
    ]) {
      const r = await api('POST', '/tasks', { ...base, ...body });
      assert.ok(rejected(r), `${JSON.stringify(body).slice(0, 50)} → ${r.status} ${r.text}`);
    }
    const ok = await api('POST', '/tasks', { ...base, title: 'a'.repeat(100), description: 'a'.repeat(2000) });
    assert.equal(ok.status, 201, ok.text); // 경계값은 허용
    await api('PATCH', `/tasks?id=eq.${ok.json[0].id}`, { deleted_at: new Date().toISOString(), updated_by: me.id });
  });

  test('수정: updated_at은 서버가 갱신하고, done이면 completed_at 기록·다시 열면 해제, created_by는 바뀌지 않는다', async () => {
    const id = me.task.id;
    const before = me.task.updated_at;
    await new Promise((r) => setTimeout(r, 15));
    const done = await api('PATCH', `/tasks?id=eq.${id}`, { status: 'done', updated_by: me.id, updated_at: '1999-01-01T00:00:00Z', created_by: other.id });
    assert.equal(done.status, 200, done.text);
    const t = done.json[0];
    assert.ok(t.completed_at, 'done이면 completed_at이 기록되어야 한다');
    assert.ok(new Date(t.updated_at) > new Date(before), '서버가 updated_at을 갱신해야 한다');
    assert.equal(t.created_by, me.id, 'created_by는 수정할 수 없다');

    const stillDone = await api('PATCH', `/tasks?id=eq.${id}`, { title: `제목수정${stamp}`, updated_by: me.id });
    assert.equal(stillDone.json[0].completed_at, t.completed_at, '완료 상태 유지 중 수정은 최초 완료 시각을 보존한다');

    const reopened = await api('PATCH', `/tasks?id=eq.${id}`, { status: 'in_progress', updated_by: me.id });
    assert.equal(reopened.json[0].completed_at, null);
    me.task = reopened.json[0];
  });

  test('변경 이력(task_events): 상태·담당자·마감일·우선순위 변경만 자동 기록되고 행위자는 updated_by', async () => {
    const id = me.task.id;
    await api('PATCH', `/tasks?id=eq.${id}`, { priority: 'high', assignee_id: other.id, due_date: '2026-12-25', updated_by: other.id });
    await api('PATCH', `/tasks?id=eq.${id}`, { description: '이력에 남지 않는 변경', updated_by: me.id });
    const r = await api('GET', `/task_events?task_id=eq.${id}&order=created_at`);
    assert.equal(r.status, 200, r.text);
    const byField = Object.fromEntries(r.json.map((e) => [e.field + ':' + e.to_value, e]));
    assert.ok(byField['status:done'] && byField['status:in_progress'], '상태 변경 이력');
    assert.equal(byField['priority:high']?.from_value, 'medium');
    assert.equal(byField['due_date:2026-12-25']?.from_value, null);
    assert.equal(byField[`assignee_id:${other.id}`]?.actor_id, other.id);
    assert.ok(!r.json.some((e) => e.field === 'description' || e.field === 'title'), '제목·설명 변경은 이력 대상이 아니다');
  });

  test('댓글: 등록·조회, 빈 값·공백·1001자는 거부', async () => {
    const id = me.task.id;
    const ok = await api('POST', '/comments', { task_id: id, author_id: me.id, body: '  안녕하세요  ' });
    assert.equal(ok.status, 201, ok.text);
    assert.equal(ok.json[0].body, '안녕하세요');
    for (const body of ['', '   ', 'a'.repeat(1001)]) {
      const r = await api('POST', '/comments', { task_id: id, author_id: me.id, body });
      assert.ok(rejected(r), `${body.length}자 → ${r.status}`);
    }
    const list = await api('GET', `/comments?task_id=eq.${id}`);
    assert.equal(list.json.length, 1);
    me.comment = ok.json[0];
  });

  test('소프트 삭제는 PATCH(deleted_at)로 가능하다', async () => {
    const r = await api('POST', '/tasks', { title: `삭제대상${stamp}`, created_by: me.id, updated_by: me.id });
    const id = r.json[0].id;
    const del = await api('PATCH', `/tasks?id=eq.${id}`, { deleted_at: new Date().toISOString(), updated_by: me.id });
    assert.equal(del.status, 200, del.text);
    assert.ok(del.json[0].deleted_at);
    const back = await api('PATCH', `/tasks?id=eq.${id}`, { deleted_at: null, updated_by: me.id });
    assert.equal(back.json[0].deleted_at, null);
    await api('PATCH', `/tasks?id=eq.${id}`, { deleted_at: new Date().toISOString(), updated_by: me.id });
  });

  describe('RLS: 허용되지 않은 동작은 거부된다', () => {
    test('모든 테이블에서 DELETE 거부(실제로 행이 지워지지 않는다)', async () => {
      for (const [table, id] of [['tasks', me?.task?.id], ['comments', me?.comment?.id], ['members', me?.id], ['task_events', ZERO]]) {
        const r = await api('DELETE', `/${table}?id=eq.${id}`);
        assert.ok(denied(r), `${table} DELETE → ${r.status} ${r.text}`);
      }
      const still = await api('GET', `/tasks?id=eq.${me.task.id}&select=id`);
      assert.equal(still.json.length, 1, '행이 남아 있어야 한다');
      const dec = await api('GET', `/comments?id=eq.${me.comment.id}&select=id`);
      assert.equal(dec.json.length, 1);
    });

    test('댓글·부서원·변경 이력 수정 거부', async () => {
      const c = await api('PATCH', `/comments?id=eq.${me.comment.id}`, { body: '변조' });
      assert.ok(denied(c), `comments PATCH → ${c.status}`);
      const m = await api('PATCH', `/members?id=eq.${me.id}`, { active: false });
      assert.ok(denied(m), `members PATCH → ${m.status}`);
      const e = await api('PATCH', `/task_events?task_id=eq.${me.task.id}`, { to_value: 'x' });
      assert.ok(denied(e), `task_events PATCH → ${e.status}`);
      const check = await api('GET', `/comments?id=eq.${me.comment.id}`);
      assert.equal(check.json[0].body, '안녕하세요');
    });

    test('허용 목록에 없는 테이블·함수는 접근할 수 없다', async () => {
      for (const path of ['/pg_user?select=*', '/pg_roles?select=*', '/information_schema.tables?select=*']) {
        const r = await api('GET', path);
        assert.ok([404, 401, 403].includes(r.status), `${path} → ${r.status}`);
      }
    });

    test('조회는 허용된다(기본 동작 확인)', async () => {
      for (const table of ['tasks', 'comments', 'members', 'task_events']) {
        const r = await api('GET', `/${table}?select=id&limit=1`);
        assert.equal(r.status, 200, `${table} → ${r.status}`);
      }
    });
  });
});
