// 「진행 중 업무」 보기: 그룹·정렬·마감 문구, 상태 조건 고정, 초기화, URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, todayKst } from '../js/domain/date.js';
import { ACTIVE_VIEW, countUserFilters, emptyFilters, scopeFilters } from '../js/domain/filters.js';
import { dueSummary, groupInProgress } from '../js/domain/inProgress.js';
import { clearAll } from '../js/state/criteria.js';
import { countInProgress, getScopeTasks, getVisibleTasks, hasActiveCriteria } from '../js/state/selectors.js';
import { getState, setState } from '../js/state/store.js';
import { buildSearch, parseUrlState } from '../js/state/urlState.js';

const TODAY = '2026-10-08'; // 수요일. 이전 달(9월)·다음 달(11월) 경계를 모두 만들 수 있는 날짜
const task = (id, over = {}) => ({
  id, title: id, status: 'in_progress', priority: 'medium', category: '기타', assignee_id: null, due_date: null, ...over,
});

const ids = (group) => group.tasks.map((t) => t.id);

test('진행 중 그룹: 지연·임박(오늘~D-3)·그 외·마감일 없음으로 나누고 4개 그룹이 항상 같은 순서로 나온다', () => {
  const groups = groupInProgress([
    task('prev-month', { due_date: '2026-09-20' }), // 이전 달에서 넘어온 업무
    task('yesterday', { due_date: '2026-10-07' }),
    task('today', { due_date: '2026-10-08' }), // D-day = 임박
    task('d3', { due_date: '2026-10-11' }), // 경계: 임박
    task('d4', { due_date: '2026-10-12' }), // 경계: 그 외
    task('next-month', { due_date: '2026-11-15' }), // 다음 달 마감
    task('no-due'),
  ], TODAY);
  assert.deepEqual(groups.map((g) => g.key), ['overdue', 'soon', 'later', 'none']);
  assert.deepEqual(groups.map((g) => g.label), ['마감 지연', '마감 임박', '그 외 진행 중', '마감일 없음']);
  assert.deepEqual(ids(groups[0]), ['prev-month', 'yesterday']);
  assert.deepEqual(ids(groups[1]), ['today', 'd3']);
  assert.deepEqual(ids(groups[2]), ['d4', 'next-month']);
  assert.deepEqual(ids(groups[3]), ['no-due']);
});

test('진행 중 그룹: 할 일·완료는 들어가지 않는다(마감일이 지났어도)', () => {
  const groups = groupInProgress([
    task('todo', { status: 'todo', due_date: '2026-10-01' }),
    task('done', { status: 'done', due_date: '2026-10-01' }),
    task('doing', { due_date: '2026-10-01' }),
  ], TODAY);
  assert.deepEqual(groups.flatMap(ids), ['doing']);
});

test('진행 중 그룹: 마감일 빠른 순, 같은 날이면 우선순위 높은 순으로 정렬한다', () => {
  const [overdue] = groupInProgress([
    task('c', { due_date: '2026-10-05' }),
    task('a', { due_date: '2026-09-01' }),
    task('b-low', { due_date: '2026-10-02', priority: 'low' }),
    task('b-high', { due_date: '2026-10-02', priority: 'high' }),
  ], TODAY);
  assert.deepEqual(ids(overdue), ['a', 'b-high', 'b-low', 'c']);
});

test('진행 중 그룹: 비어 있는 그룹은 빈 배열이고, 입력 배열을 바꾸지 않는다', () => {
  const input = [task('b', { due_date: '2026-10-09' }), task('a', { due_date: '2026-10-08' })];
  const copy = [...input];
  const groups = groupInProgress(input, TODAY);
  assert.deepEqual(groups.map((g) => g.tasks.length), [0, 2, 0, 0]);
  assert.deepEqual(input, copy);
  assert.deepEqual(groupInProgress([], TODAY).map((g) => g.tasks.length), [0, 0, 0, 0]);
});

test('마감 문구: 지연 일수·남은 일수·오늘·마감일 없음(긴급 규칙과 같은 기준)', () => {
  const text = (due) => dueSummary(task('x', { due_date: due }), TODAY);
  assert.deepEqual(text('2026-09-20'), { kind: 'overdue', text: '18일 지연', days: -18 });
  assert.deepEqual(text('2026-10-07'), { kind: 'overdue', text: '1일 지연', days: -1 });
  assert.deepEqual(text('2026-10-08'), { kind: 'soon', text: '오늘 마감', days: 0 });
  assert.deepEqual(text('2026-10-11'), { kind: 'soon', text: '3일 남음', days: 3 });
  assert.deepEqual(text('2026-10-12'), { kind: 'later', text: '4일 남음', days: 4 });
  assert.deepEqual(text('2026-11-15'), { kind: 'later', text: '38일 남음', days: 38 });
  assert.deepEqual(text(null), { kind: 'none', text: '마감일 없음', days: null });
});

// ---------------------------------------------------------------- 공통 필터와의 결합
test('scopeFilters: 진행 중 보기에서만 상태를 진행 중으로 고정하고 저장된 필터는 바꾸지 않는다', () => {
  const stored = { ...emptyFilters(), status: ['done'], assignee: ['u1'] };
  const scoped = scopeFilters(ACTIVE_VIEW, stored);
  assert.deepEqual(scoped.status, ['in_progress']);
  assert.deepEqual(scoped.assignee, ['u1']);
  assert.deepEqual(stored.status, ['done']); // 원본 불변
  assert.equal(scopeFilters('list', stored), stored);
  assert.equal(countUserFilters(ACTIVE_VIEW, stored), 1); // 상태(고정)는 세지 않는다
  assert.equal(countUserFilters('list', stored), 2);
});

/** 스토어를 시나리오 상태로 맞추고, 끝나면 원래대로 돌려놓는다. */
function withStore(patch, fn) {
  const saved = { ...getState() };
  try {
    setState({ members: [{ id: 'kim', name: '김민준', label: null, active: true }, { id: 'lee', name: '이서연', label: null, active: true }], ...patch });
    return fn();
  } finally {
    setState(saved);
  }
}

const today = todayKst();
const fixtures = () => [
  task('보고서 작성', { assignee_id: 'kim', due_date: addDays(today, -40) }), // 이전 달 마감
  task('계획서 작성', { assignee_id: 'kim', due_date: addDays(today, 45) }), // 다음 달 이후 마감
  task('회의 준비', { assignee_id: 'lee' }),
  task('할 일 항목', { status: 'todo', assignee_id: 'kim' }),
  task('완료 항목', { status: 'done', assignee_id: 'kim' }),
];

test('getVisibleTasks: 진행 중 보기는 달과 상관없이 진행 중 전체를 주고, 저장된 상태 필터와 충돌해 비지 않는다', () => {
  const stored = { ...emptyFilters(), status: ['done'] };
  withStore({ tasks: fixtures(), view: ACTIVE_VIEW, query: '', filters: stored, month: '2026-01' }, () => {
    assert.deepEqual(getVisibleTasks().map((t) => t.id).sort(), ['계획서 작성', '보고서 작성', '회의 준비']);
    assert.equal(getScopeTasks().length, 3);
    assert.equal(countInProgress(), 3);
    assert.equal(hasActiveCriteria(), false); // 상태(고정)는 사용자가 건 조건이 아니다
  });
  withStore({ tasks: fixtures(), view: 'list', query: '', filters: stored }, () => {
    assert.deepEqual(getVisibleTasks().map((t) => t.id), ['완료 항목']); // 다른 보기에서는 저장된 필터가 그대로 적용된다
    assert.equal(getScopeTasks().length, 5);
    assert.equal(countInProgress(), 3); // 건수는 보기와 필터에 상관없이 전체 진행 중
  });
});

test('getVisibleTasks: 검색과 담당자 필터가 함께 적용되고 건수가 결과와 일치한다', () => {
  const filters = { ...emptyFilters(), assignee: ['kim'] };
  withStore({ tasks: fixtures(), view: ACTIVE_VIEW, query: '계획', filters }, () => {
    assert.deepEqual(getVisibleTasks().map((t) => t.id), ['계획서 작성']);
    assert.equal(hasActiveCriteria(), true);
  });
  withStore({ tasks: fixtures(), view: ACTIVE_VIEW, query: '', filters }, () => {
    assert.deepEqual(getVisibleTasks().map((t) => t.id).sort(), ['계획서 작성', '보고서 작성']);
    assert.equal(getScopeTasks().length, 3); // 「진행 중 3건 중 2건」의 분모
  });
});

test('완료로 바뀐 업무는 목록·건수에서 바로 빠진다', () => {
  const tasks = fixtures();
  withStore({ tasks, view: ACTIVE_VIEW, query: '', filters: emptyFilters() }, () => {
    assert.equal(countInProgress(), 3);
    setState({ tasks: tasks.map((t) => (t.id === '회의 준비' ? { ...t, status: 'done' } : t)) });
    assert.equal(countInProgress(), 2);
    assert.deepEqual(getVisibleTasks().map((t) => t.id).sort(), ['계획서 작성', '보고서 작성']);
  });
});

test('초기화(clearAll): 진행 중 보기에서는 검색·필터만 지우고 저장된 상태 필터는 그대로 둔다', () => {
  const filters = { ...emptyFilters(), status: ['done'], assignee: ['kim'] };
  withStore({ tasks: fixtures(), view: ACTIVE_VIEW, query: '보고', filters }, () => {
    clearAll();
    assert.equal(getState().query, '');
    assert.deepEqual(getState().filters.assignee, []);
    assert.deepEqual(getState().filters.status, ['done']); // 다른 보기용 상태 필터를 지우지 않는다
    assert.equal(getVisibleTasks().length, 3); // 여전히 진행 중만
  });
  withStore({ tasks: fixtures(), view: 'list', query: '보고', filters }, () => {
    clearAll();
    assert.deepEqual(getState().filters.status, []); // 다른 보기에서는 기존대로 전부 해제
    assert.equal(getVisibleTasks().length, 5);
  });
});

// ---------------------------------------------------------------- URL
test('URL: view=active를 복원·저장하고, 다른 보기와 마찬가지로 필터·검색을 함께 보존한다', () => {
  const state = { view: 'active', query: '보고', filters: { ...emptyFilters(), assignee: ['kim'], priority: ['high'] }, month: null };
  const search = buildSearch(state);
  assert.equal(search, '?view=active&q=%EB%B3%B4%EA%B3%A0&priority=high&assignee=kim');
  assert.deepEqual(parseUrlState(search), state);
  assert.equal(parseUrlState('?view=active').view, 'active');
  assert.equal(parseUrlState('?view=actives').view, 'list'); // 알 수 없는 값은 리스트
});
