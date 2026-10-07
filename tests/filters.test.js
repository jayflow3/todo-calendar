import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilters, countActiveFilters, emptyFilters, UNASSIGNED } from '../js/domain/filters.js';
import { addMonths, buildMonthGrid, groupByDue, monthOf } from '../js/domain/calendar.js';
import { buildSearch, parseUrlState } from '../js/state/urlState.js';

const names = { m1: '김민준', m2: 'Lee Seo Yeon' };
const nameOf = (id) => names[id] ?? null;
const t = (id, over = {}) => ({
  id, title: `할일 ${id}`, status: 'todo', priority: 'medium', category: '개발',
  assignee_id: 'm1', due_date: null, ...over,
});
const ids = (list) => list.map((x) => x.id);

test('검색: 제목·담당자 이름 부분 일치, 대소문자·공백 무시', () => {
  const tasks = [t('a', { title: 'API 설계' }), t('b', { title: '문서 정리', assignee_id: 'm2' }), t('c', { assignee_id: null })];
  assert.deepEqual(ids(applyFilters(tasks, 'api', emptyFilters(), nameOf)), ['a']);
  assert.deepEqual(ids(applyFilters(tasks, ' a p i ', emptyFilters(), nameOf)), ['a']);
  assert.deepEqual(ids(applyFilters(tasks, 'leeseo', emptyFilters(), nameOf)), ['b']); // 담당자
  assert.deepEqual(ids(applyFilters(tasks, '김민', emptyFilters(), nameOf)), ['a']); // c는 미배정이라 담당자 이름이 없다
  assert.deepEqual(ids(applyFilters(tasks, '   ', emptyFilters(), nameOf)), ['a', 'b', 'c']);
  assert.deepEqual(ids(applyFilters(tasks, '없는말', emptyFilters(), nameOf)), []);
});

test('필터: 조건 안은 OR, 조건 사이는 AND', () => {
  const tasks = [
    t('a', { status: 'todo', priority: 'high' }),
    t('b', { status: 'done', priority: 'high' }),
    t('c', { status: 'in_progress', priority: 'low' }),
  ];
  const f = { ...emptyFilters(), status: ['todo', 'done'] };
  assert.deepEqual(ids(applyFilters(tasks, '', f, nameOf)), ['a', 'b']);
  assert.deepEqual(ids(applyFilters(tasks, '', { ...f, priority: ['high'] }, nameOf)), ['a', 'b']);
  assert.deepEqual(ids(applyFilters(tasks, '', { ...f, priority: ['low'] }, nameOf)), []);
});

test('필터: 미배정 포함, 카테고리, 검색과의 AND', () => {
  const tasks = [t('a'), t('b', { assignee_id: null }), t('c', { assignee_id: 'm2', category: '기획' })];
  assert.deepEqual(ids(applyFilters(tasks, '', { ...emptyFilters(), assignee: [UNASSIGNED] }, nameOf)), ['b']);
  assert.deepEqual(ids(applyFilters(tasks, '', { ...emptyFilters(), assignee: [UNASSIGNED, 'm2'] }, nameOf)), ['b', 'c']);
  assert.deepEqual(ids(applyFilters(tasks, '', { ...emptyFilters(), category: ['기획'] }, nameOf)), ['c']);
  assert.deepEqual(ids(applyFilters(tasks, '할일 c', { ...emptyFilters(), category: ['개발'] }, nameOf)), []);
});

test('countActiveFilters', () => {
  assert.equal(countActiveFilters(emptyFilters()), 0);
  assert.equal(countActiveFilters({ ...emptyFilters(), status: ['todo', 'done'], category: ['기획'] }), 3);
});

test('캘린더 격자: 2026-10은 목요일 시작, 5주', () => {
  const grid = buildMonthGrid('2026-10');
  assert.equal(grid.length, 5);
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(grid[0][0], '2026-09-27'); // 일요일
  assert.equal(grid[0][4], '2026-10-01');
  assert.equal(grid[4][6], '2026-10-31');
});

test('캘린더 격자: 일요일 시작 2월(4주)과 6주가 필요한 달', () => {
  assert.equal(buildMonthGrid('2026-02').length, 4); // 2026-02-01은 일요일, 28일
  assert.equal(buildMonthGrid('2026-02')[0][0], '2026-02-01');
  assert.equal(buildMonthGrid('2026-08').length, 6); // 토요일 시작 31일
  assert.equal(buildMonthGrid('2028-02').flat().includes('2028-02-29'), true); // 윤년
});

test('addMonths/monthOf: 연 경계', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', 0), '2026-10');
  assert.equal(monthOf('2026-10-07'), '2026-10');
});

test('groupByDue: 마감일별 묶음과 마감일 없음', () => {
  const tasks = [
    t('a', { due_date: '2026-10-07', priority: 'low' }),
    t('b', { due_date: '2026-10-07', priority: 'high' }),
    t('c', { due_date: null }),
  ];
  const { byDate, noDue } = groupByDue(tasks);
  assert.deepEqual(ids(byDate.get('2026-10-07')), ['b', 'a']); // 우선순위 순
  assert.deepEqual(ids(noDue), ['c']);
});

test('URL: 파싱과 직렬화는 서로 역변환이다', () => {
  const state = {
    view: 'calendar',
    query: '회의 자료',
    filters: { status: ['todo', 'in_progress'], priority: ['high'], assignee: ['m1', UNASSIGNED], category: ['기획'], urgency: ['overdue'] },
    month: '2026-11',
  };
  const search = buildSearch(state);
  assert.deepEqual(parseUrlState(search), state);
});

test('URL: 기본값은 생략하고, 잘못된 값은 버린다', () => {
  assert.equal(buildSearch({ view: 'list', query: '', filters: emptyFilters(), month: '2026-10' }), '');
  const parsed = parseUrlState('?view=hack&status=todo,bogus,todo&priority=x&month=2026-13&q=a');
  assert.equal(parsed.view, 'list');
  assert.deepEqual(parsed.filters.status, ['todo']);
  assert.deepEqual(parsed.filters.priority, []);
  assert.equal(parsed.month, null);
  assert.equal(parsed.query, 'a');
  // 캘린더가 아니면 month는 URL에 넣지 않는다.
  assert.equal(buildSearch({ view: 'kanban', query: '', filters: emptyFilters(), month: '2026-11' }), '?view=kanban');
});
