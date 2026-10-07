import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../js/domain/stats.js';
import { changedFields, conflictingFields, findRemoteChanges } from '../js/domain/diff.js';
import { eulReul, euro } from '../js/ui/korean.js';

const today = '2026-10-07';
const members = [{ id: 'm1', name: '김' }, { id: 'm2', name: '이' }];
let n = 0;
const t = (over = {}) => ({
  id: `t${++n}`, status: 'todo', due_date: null, assignee_id: 'm1', deleted_at: null, completed_at: null, ...over,
});
const stats = (tasks, opts) => computeStats(tasks, members, today, opts);

test('빈 목록: 0건, 완료율·지연 비율은 null', () => {
  const s = stats([]);
  assert.deepEqual(s.counts, { todo: 0, in_progress: 0, done: 0 });
  assert.equal(s.completionRate, null);
  assert.equal(s.overdueRate, null);
  assert.deepEqual(s.workload, []);
  assert.deepEqual(s.history, []);
  assert.equal(s.completedLast7Days, 0);
});

test('M1·M2: 상태별 건수와 완료율(소수점 첫째 자리 반올림)', () => {
  const s = stats([t({ status: 'done', completed_at: '2026-10-06T01:00:00Z' }), t(), t()]);
  assert.deepEqual(s.counts, { todo: 2, in_progress: 0, done: 1 });
  assert.equal(s.completionRate, 33.3);
  assert.equal(stats([t({ status: 'done', completed_at: '2026-10-06T01:00:00Z' }), t({ status: 'done', completed_at: '2026-10-06T02:00:00Z' }), t()]).completionRate, 66.7);
});

test('전부 완료: 완료율 100, 미완료 0이라 지연 비율 null, 부하 없음', () => {
  const s = stats([t({ status: 'done', completed_at: '2026-10-06T01:00:00Z' }), t({ status: 'done', completed_at: '2026-10-05T01:00:00Z' })]);
  assert.equal(s.completionRate, 100);
  assert.equal(s.overdueRate, null);
  assert.deepEqual(s.workload, []);
});

test('삭제된 항목은 모든 지표에서 제외', () => {
  const s = stats([t(), t({ deleted_at: '2026-10-01T00:00:00Z' }), t({ status: 'done', completed_at: '2026-10-06T00:00:00Z', deleted_at: '2026-10-02T00:00:00Z' })]);
  assert.equal(s.total, 1);
  assert.equal(s.counts.done, 0);
  assert.equal(s.history.length, 0);
});

test('M3: 담당자별 미완료 부하, 미배정은 별도 행, 내림차순, 완료는 제외', () => {
  const s = stats([
    t({ assignee_id: 'm1' }), t({ assignee_id: 'm1', status: 'in_progress' }), t({ assignee_id: 'm1', status: 'done', completed_at: '2026-10-06T00:00:00Z' }),
    t({ assignee_id: 'm2' }),
    t({ assignee_id: null }), t({ assignee_id: null }), t({ assignee_id: null }),
  ]);
  assert.deepEqual(s.workload.map((w) => [w.assigneeId, w.count]), [[null, 3], ['m1', 2], ['m2', 1]]);
  assert.equal(s.workload[1].member.name, '김');
  assert.equal(s.workload[0].member, null);
});

test('M3: 과부하 임계치 경계(7건/8건/9건, 임계치 변경)', () => {
  const many = (k) => Array.from({ length: k }, () => t());
  assert.equal(stats(many(7)).workload[0].overload, false);
  assert.equal(stats(many(8)).workload[0].overload, true);
  assert.equal(stats(many(9)).workload[0].overload, true);
  assert.equal(stats(many(3), { overloadThreshold: 3 }).workload[0].overload, true);
});

test('M4·M5: 날짜 경계(D=4, D=3, D=0, D=-1)와 완료·마감일 없음 제외, 지연 비율', () => {
  const s = stats([
    t({ due_date: '2026-10-11' }), // D=4 → 해당 없음
    t({ due_date: '2026-10-10' }), // D=3 임박
    t({ due_date: '2026-10-07' }), // D=0 임박
    t({ due_date: '2026-10-06' }), // D=-1 지연
    t({ due_date: '2026-10-01', status: 'in_progress' }), // 지연
    t({ due_date: '2026-10-01', status: 'done', completed_at: '2026-10-02T00:00:00Z' }), // 완료는 제외
    t({ due_date: null }),
  ]);
  assert.equal(s.soon, 2);
  assert.equal(s.overdue, 2);
  assert.equal(s.incompleteCount, 6);
  assert.equal(s.overdueRate, 33.3);
});

test('M6: 완료 이력은 completed_at 최신순 20건, 최근 7일은 오늘 포함 7일(한국 시간)', () => {
  const done = (iso) => t({ status: 'done', completed_at: iso });
  const tasks = [
    done('2026-10-01T00:00:00Z'), // 오늘−6일(10-01) → 포함
    done('2026-09-30T14:59:59Z'), // KST 09-30 23:59 → 제외
    done('2026-09-30T15:00:00Z'), // KST 10-01 00:00 → 포함
    done('2026-10-07T14:59:59Z'), // KST 10-07 23:59 → 포함
    ...Array.from({ length: 25 }, (_, i) => done(`2026-08-${String((i % 25) + 1).padStart(2, '0')}T00:00:00Z`)),
  ];
  const s = stats(tasks);
  assert.equal(s.history.length, 20);
  assert.equal(s.history[0].completed_at, '2026-10-07T14:59:59Z');
  assert.ok(s.history.every((x, i, a) => i === 0 || a[i - 1].completed_at >= x.completed_at));
  assert.equal(s.completedLast7Days, 3);
});

test('diff: 변경 필드와 다른 사람의 변경만 골라낸다', () => {
  const a = { id: 'x', title: 'a', status: 'todo', priority: 'low', updated_at: '1', updated_by: 'me' };
  const b = { ...a, priority: 'high', updated_at: '2', updated_by: 'other' };
  assert.deepEqual(changedFields(a, b), [{ field: 'priority', from: 'low', to: 'high' }]);
  assert.equal(findRemoteChanges([a], [b], 'me').length, 1);
  assert.equal(findRemoteChanges([a], [{ ...b, updated_by: 'me' }], 'me').length, 0); // 내 변경
  assert.equal(findRemoteChanges([a], [a], 'me').length, 0); // 변화 없음
  assert.equal(findRemoteChanges([], [b], 'me').length, 0); // 새 항목은 변경 알림 대상이 아님
});

test('conflictingFields: 내가 바꾼 필드를 다른 사람도 바꿨을 때만 충돌', () => {
  const opened = { due_date: null, priority: 'medium' };
  const current = { due_date: null, priority: 'high' };
  assert.deepEqual(conflictingFields(opened, current, { due_date: '2026-10-20' }), []); // 다른 필드
  assert.deepEqual(conflictingFields(opened, current, { priority: 'low' }), ['priority']); // 같은 필드
});

test('조사: 을/를, 으로/로', () => {
  assert.equal(eulReul('우선순위'), '우선순위를');
  assert.equal(eulReul('마감일'), '마감일을');
  assert.equal(eulReul('상태'), '상태를');
  assert.equal(euro('낮음'), '낮음으로');
  assert.equal(euro('완료'), '완료로');
  assert.equal(euro('진행 중'), '진행 중으로');
  assert.equal(euro('2026-10-20'), '2026-10-20으로'); // 영(0)
  assert.equal(euro('2026-10-27'), '2026-10-27로'); // 칠(7): ㄹ 받침
  assert.equal(euro('2026-10-21'), '2026-10-21로'); // 일(1): ㄹ 받침
  assert.equal(euro('2026-10-22'), '2026-10-22로'); // 이(2): 받침 없음
});
