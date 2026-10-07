import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, diffDays, parseDateKey, todayKst } from '../js/domain/date.js';
import { escapeHtml } from '../js/domain/escape.js';

test('todayKst: 한국 시간 자정 전후로 날짜가 바뀐다', () => {
  // 2026-10-07 14:59:59 UTC = 2026-10-07 23:59:59 KST
  assert.equal(todayKst(new Date('2026-10-07T14:59:59Z')), '2026-10-07');
  // 2026-10-07 15:00:00 UTC = 2026-10-08 00:00:00 KST
  assert.equal(todayKst(new Date('2026-10-07T15:00:00Z')), '2026-10-08');
});

test('todayKst: 연말 경계', () => {
  assert.equal(todayKst(new Date('2026-12-31T15:00:00Z')), '2027-01-01');
  assert.equal(todayKst(new Date('2026-12-31T14:59:59Z')), '2026-12-31');
});

test('parseDateKey: 유효/무효', () => {
  assert.deepEqual(parseDateKey('2026-10-07'), { year: 2026, month: 10, day: 7 });
  assert.equal(parseDateKey('2026-02-29'), null); // 평년
  assert.deepEqual(parseDateKey('2028-02-29'), { year: 2028, month: 2, day: 29 }); // 윤년
  assert.equal(parseDateKey('2026-13-01'), null);
  assert.equal(parseDateKey('2026-1-1'), null);
  assert.equal(parseDateKey(null), null);
  assert.equal(parseDateKey('2026-10-07T00:00:00Z'), null);
});

test('diffDays: 월말·연말·윤년 경계', () => {
  assert.equal(diffDays('2026-10-10', '2026-10-07'), 3);
  assert.equal(diffDays('2026-10-07', '2026-10-10'), -3);
  assert.equal(diffDays('2026-10-07', '2026-10-07'), 0);
  assert.equal(diffDays('2026-11-01', '2026-10-31'), 1);
  assert.equal(diffDays('2027-01-01', '2026-12-31'), 1);
  assert.equal(diffDays('2028-03-01', '2028-02-28'), 2);
  assert.equal(diffDays('2026-03-01', '2026-02-28'), 1);
  assert.throws(() => diffDays('2026-02-30', '2026-01-01'), RangeError);
});

test('addDays: 경계 이동', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-10-07', 0), '2026-10-07');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(0), '0');
});
