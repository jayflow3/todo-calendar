import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getUrgency } from '../js/domain/urgency.js';
import { sortTasks } from '../js/domain/sort.js';

const today = '2026-10-07';
const task = (due_date, status = 'todo') => ({ due_date, status });

test('urgency: 경계값', () => {
  assert.equal(getUrgency(task('2026-10-11'), today), null); // D=4
  assert.deepEqual(getUrgency(task('2026-10-10'), today), { kind: 'soon', label: 'D-3', days: 3 });
  assert.equal(getUrgency(task('2026-10-08'), today).label, 'D-1');
  assert.equal(getUrgency(task('2026-10-07'), today).label, 'D-day');
  assert.deepEqual(getUrgency(task('2026-10-06'), today), { kind: 'overdue', label: 'D+1', days: -1 });
  assert.equal(getUrgency(task('2026-09-30'), today).label, 'D+7');
});

test('urgency: 완료·마감일 없음은 배지 없음, 월말·연말 경계', () => {
  assert.equal(getUrgency(task('2026-10-01', 'done'), today), null);
  assert.equal(getUrgency(task(null), today), null);
  assert.equal(getUrgency(task('2026-11-02'), '2026-10-31').label, 'D-2');
  assert.equal(getUrgency(task('2027-01-01'), '2026-12-31').label, 'D-1');
});

test('sort: 기본(우선순위 → 마감일, 마감일 없음은 마지막)', () => {
  const rows = [
    { title: 'a', priority: 'low', due_date: '2026-10-01' },
    { title: 'b', priority: 'high', due_date: null },
    { title: 'c', priority: 'high', due_date: '2026-10-09' },
    { title: 'd', priority: 'high', due_date: '2026-10-08' },
  ];
  const sorted = sortTasks(rows, { key: 'priority', dir: 'asc' });
  assert.deepEqual(sorted.map((t) => t.title), ['d', 'c', 'b', 'a']);
});

test('sort: 마감일 내림차순에서도 마감일 없음은 마지막', () => {
  const rows = [
    { title: 'a', priority: 'low', due_date: null },
    { title: 'b', priority: 'low', due_date: '2026-10-01' },
    { title: 'c', priority: 'low', due_date: '2026-10-05' },
  ];
  assert.deepEqual(sortTasks(rows, { key: 'due_date', dir: 'desc' }).map((t) => t.title), ['c', 'b', 'a']);
});

test('sort: 담당자 이름순, 미배정은 마지막', () => {
  const names = { 1: '다', 2: '가' };
  const rows = [
    { title: 'x', priority: 'low', due_date: null, assignee_id: null },
    { title: 'y', priority: 'low', due_date: null, assignee_id: '1' },
    { title: 'z', priority: 'low', due_date: null, assignee_id: '2' },
  ];
  assert.deepEqual(sortTasks(rows, { key: 'assignee', dir: 'asc' }, (id) => names[id]).map((t) => t.title), ['z', 'y', 'x']);
});
