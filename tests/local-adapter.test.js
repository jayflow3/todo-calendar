import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAdapter } from '../js/api/adapters/local.js';
import { ApiError } from '../js/api/errors.js';
import { useAdapter, taskApi } from '../js/api/taskApi.js';
import { ValidationError } from '../js/domain/validation.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

// 호출마다 1초씩 흐르는 시계: updated_at 비교를 결정적으로 만든다.
function fakeClock(start = '2026-10-07T00:00:00.000Z') {
  let t = new Date(start).getTime();
  return () => new Date((t += 1000));
}

async function setup() {
  const adapter = createLocalAdapter({ storage: memoryStorage(), now: fakeClock() });
  const [me] = await adapter.listMembers();
  return { adapter, me };
}

test('첫 실행 시 샘플 12건과 부서원 6명을 넣는다', async () => {
  const { adapter } = await setup();
  assert.equal((await adapter.listTasks()).length, 12);
  assert.equal((await adapter.listMembers()).length, 6);
});

test('createTask: 기본값과 공백 정리', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: '  새 일  ', created_by: me.id });
  assert.equal(task.title, '새 일');
  assert.equal(task.status, 'todo');
  assert.equal(task.priority, 'medium');
  assert.equal(task.category, '기타');
  assert.equal(task.completed_at, null);
  assert.equal(task.created_by, me.id);
});

test('createTask: 제목 검증(빈 값, 공백만, 101자)', async () => {
  const { adapter, me } = await setup();
  for (const title of ['', '   ', 'a'.repeat(101)]) {
    await assert.rejects(adapter.createTask({ title, created_by: me.id }), ValidationError);
  }
  const ok = await adapter.createTask({ title: 'a'.repeat(100), created_by: me.id });
  assert.equal(ok.title.length, 100);
});

test('서로 다른 필드의 부분 수정은 서로 덮어쓰지 않는다', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: '동시 수정', created_by: me.id });
  // A는 마감일만, B는 우선순위만 보낸다.
  await adapter.updateTask(task.id, { due_date: '2026-10-20', updated_by: me.id });
  await adapter.updateTask(task.id, { priority: 'high', updated_by: me.id });
  const after = (await adapter.listTasks()).find((t) => t.id === task.id);
  assert.equal(after.due_date, '2026-10-20');
  assert.equal(after.priority, 'high');
  assert.equal(after.title, '동시 수정');
});

test('updated_at은 서버가 갱신하고 클라이언트 값은 무시한다', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: 't', created_by: me.id });
  const updated = await adapter.updateTask(task.id, {
    title: 't2',
    updated_by: me.id,
    updated_at: '1999-01-01T00:00:00.000Z',
    completed_at: '1999-01-01T00:00:00.000Z',
  });
  assert.notEqual(updated.updated_at, '1999-01-01T00:00:00.000Z');
  assert.ok(updated.updated_at > task.updated_at);
  assert.equal(updated.completed_at, null);
});

test('completed_at: done이 되면 기록, 다시 열면 해제, done 유지 중 수정은 보존', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: 'c', created_by: me.id });
  const done = await adapter.updateTask(task.id, { status: 'done', updated_by: me.id });
  assert.ok(done.completed_at);
  const edited = await adapter.updateTask(task.id, { title: 'c2', updated_by: me.id });
  assert.equal(edited.completed_at, done.completed_at);
  const reopened = await adapter.updateTask(task.id, { status: 'in_progress', updated_by: me.id });
  assert.equal(reopened.completed_at, null);
});

test('task_events: status/assignee/due_date/priority 변경만 기록한다', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: 'e', created_by: me.id });
  await adapter.updateTask(task.id, { status: 'in_progress', due_date: '2026-10-30', updated_by: me.id });
  await adapter.updateTask(task.id, { title: '제목만 변경', updated_by: me.id });
  const events = await adapter.listEvents(task.id);
  assert.deepEqual(events.map((e) => e.field).sort(), ['due_date', 'status']);
  const status = events.find((e) => e.field === 'status');
  assert.equal(status.from_value, 'todo');
  assert.equal(status.to_value, 'in_progress');
  assert.equal(status.actor_id, me.id);
});

test('소프트 삭제: 목록에서 제외, 삭제된 항목 수정은 DELETED, 복원 가능', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: 'd', created_by: me.id });
  await adapter.softDeleteTask(task.id, { updatedBy: me.id });
  assert.ok(!(await adapter.listTasks()).some((t) => t.id === task.id));
  await assert.rejects(
    adapter.updateTask(task.id, { title: 'x', updated_by: me.id }),
    (err) => err instanceof ApiError && err.code === 'DELETED',
  );
  await adapter.restoreTask(task.id, { updatedBy: me.id });
  assert.ok((await adapter.listTasks()).some((t) => t.id === task.id));
});

test('expectedUpdatedAt이 서버 값과 다르면 CONFLICT', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: 'k', created_by: me.id });
  const opened = task.updated_at;
  await adapter.updateTask(task.id, { priority: 'low', updated_by: me.id }); // 다른 사람이 먼저 수정
  await assert.rejects(
    adapter.updateTask(task.id, { priority: 'high', updated_by: me.id }, { expectedUpdatedAt: opened }),
    (err) => err.code === 'CONFLICT' && err.current.priority === 'low',
  );
});

test('댓글: 등록순 조회, 1~1000자 검증', async () => {
  const { adapter, me } = await setup();
  const task = await adapter.createTask({ title: 'c', created_by: me.id });
  await adapter.addComment({ task_id: task.id, author_id: me.id, body: '첫째' });
  await adapter.addComment({ task_id: task.id, author_id: me.id, body: '둘째' });
  assert.deepEqual((await adapter.listComments(task.id)).map((c) => c.body), ['첫째', '둘째']);
  for (const body of ['', '  ', 'a'.repeat(1001)]) {
    await assert.rejects(adapter.addComment({ task_id: task.id, author_id: me.id, body }), ValidationError);
  }
});

test('부서원: 이름 검증', async () => {
  const { adapter } = await setup();
  await assert.rejects(adapter.addMember({ name: '  ' }), ValidationError);
  await assert.rejects(adapter.addMember({ name: 'a'.repeat(21) }), ValidationError);
  await assert.rejects(adapter.addMember({ name: '홍길동', label: 'a'.repeat(11) }), ValidationError);
  const m = await adapter.addMember({ name: ' 홍길동 ', label: '개발팀' });
  assert.equal(m.name, '홍길동');
});

test('subscribe: 변경 알림과 해제', async () => {
  const { adapter, me } = await setup();
  const seen = [];
  const off = adapter.subscribe((c) => seen.push(`${c.table}:${c.type}`));
  const task = await adapter.createTask({ title: 's', created_by: me.id });
  await adapter.updateTask(task.id, { title: 's2', updated_by: me.id });
  off();
  await adapter.createTask({ title: 's3', created_by: me.id });
  assert.deepEqual(seen, ['tasks:INSERT', 'tasks:UPDATE']);
});

test('taskApi: 현재 사용자를 created_by/updated_by/author_id에 자동 주입', async () => {
  const { adapter, me } = await setup();
  useAdapter(adapter);
  assert.throws(() => taskApi.createTask({ title: 'x' }), /현재 사용자/);
  taskApi.setActor(me.id);
  const task = await taskApi.createTask({ title: 'api' });
  assert.equal(task.created_by, me.id);
  const updated = await taskApi.updateTask(task.id, { priority: 'high' });
  assert.equal(updated.updated_by, me.id);
  const comment = await taskApi.addComment(task.id, '안녕');
  assert.equal(comment.author_id, me.id);
});
