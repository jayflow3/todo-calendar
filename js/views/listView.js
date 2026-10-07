// 리스트 뷰: 데스크탑은 표, 모바일(≤639px)은 CSS로 카드 목록이 된다. 같은 DOM을 쓴다.
import { todayKst } from '../domain/date.js';
import { sortTasks } from '../domain/sort.js';
import { getUrgency } from '../domain/urgency.js';
import { changeStatus } from '../state/actions.js';
import { getState, memberById, setState } from '../state/store.js';
import { h, preserveFocus } from '../ui/dom.js';
import { option } from '../ui/form.js';
import { memberName, priorityBadge, STATUS_LABEL, urgencyBadge } from '../ui/labels.js';
import { openTaskDetail } from '../ui/taskDetail.js';
import { openTaskForm } from '../ui/taskForm.js';

export const PAGE_SIZE = 200;

const COLUMNS = [
  { key: 'title', label: '제목' },
  { key: 'status', label: '상태' },
  { key: 'priority', label: '우선순위' },
  { key: 'assignee', label: '담당자' },
  { key: 'category', label: '카테고리' },
  { key: 'due_date', label: '마감일' },
];

function setSort(key) {
  const { sort } = getState();
  setState({
    sort: { key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' },
    page: 0,
  });
}

function skeleton() {
  return h(
    'div',
    { class: 'skeleton-list', 'aria-busy': 'true', 'aria-label': '목록을 불러오는 중' },
    ...Array.from({ length: 5 }, () => h('div', { class: 'skeleton' })),
  );
}

function emptyState() {
  return h(
    'div',
    { class: 'empty-state card stack' },
    h('p', null, '등록된 할일이 없습니다.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--primary', onClick: () => openTaskForm() }, '새 할일')),
  );
}

function sortControls(sort) {
  // 모바일에서는 열 머리가 사라지므로 같은 기능을 select로 제공한다.
  return h(
    'div',
    { class: 'sort-mobile field' },
    h('label', { class: 'field__label', for: 'sort-select' }, '정렬'),
    h(
      'div',
      { class: 'row' },
      h(
        'select',
        { id: 'sort-select', class: 'field__input', value: sort.key, onChange: (e) => setState({ sort: { key: e.target.value, dir: 'asc' }, page: 0 }) },
        ...COLUMNS.map((c) => option(c.key, c.label)),
      ),
      h('button', {
        type: 'button',
        class: 'btn btn--secondary',
        'aria-label': sort.dir === 'asc' ? '오름차순 (눌러서 내림차순으로 변경)' : '내림차순 (눌러서 오름차순으로 변경)',
        onClick: () => setState({ sort: { ...sort, dir: sort.dir === 'asc' ? 'desc' : 'asc' } }),
      }, sort.dir === 'asc' ? '↑' : '↓'),
    ),
  );
}

function row(task, today) {
  const assignee = memberName(memberById(task.assignee_id));
  const statusSelect = h(
    'select',
    {
      class: 'field__input field__input--compact',
      'aria-label': `상태 변경: ${task.title}`,
      'data-focus-key': `status-${task.id}`,
      value: task.status,
      onChange: (e) => changeStatus(task, e.target.value),
    },
    ...Object.entries(STATUS_LABEL).map(([value, text]) => option(value, text)),
  );
  return h(
    'tr',
    { class: 'task-row', onClick: (e) => { if (!e.target.closest('select, button')) openTaskDetail(task.id); } },
    h('td', { 'data-label': '제목', class: 'task-row__title' },
      h('button', { type: 'button', class: 'link-btn', 'data-focus-key': `open-${task.id}`, onClick: () => openTaskDetail(task.id) }, task.title)),
    h('td', { 'data-label': '상태' }, statusSelect),
    h('td', { 'data-label': '우선순위' }, priorityBadge(task.priority)),
    h('td', { 'data-label': '담당자' }, assignee || '미배정'),
    h('td', { 'data-label': '카테고리' }, task.category ?? ''),
    h('td', { 'data-label': '마감일' }, task.due_date ?? '없음', ' ', urgencyBadge(getUrgency(task, today))),
  );
}

export function renderListView(root) {
  const { tasks, loading, sort, page } = getState();
  preserveFocus(() => {
    if (loading) return root.replaceChildren(skeleton());
    if (!tasks.length) return root.replaceChildren(emptyState());

    const today = todayKst();
    const sorted = sortTasks(tasks, sort, (id) => memberById(id)?.name ?? null);
    const pages = Math.ceil(sorted.length / PAGE_SIZE);
    const current = Math.min(page, pages - 1);
    const visible = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
    const ariaSort = (key) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

    const table = h(
      'table',
      { class: 'task-table' },
      h('caption', { class: 'visually-hidden' }, `할일 ${sorted.length}건`),
      h('thead', null, h('tr', null, ...COLUMNS.map((c) =>
        h('th', { scope: 'col', 'aria-sort': ariaSort(c.key) },
          h('button', { type: 'button', class: 'sort-btn', 'data-focus-key': `sort-${c.key}`, onClick: () => setSort(c.key) },
            c.label, sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''))))),
      h('tbody', null, ...visible.map((t) => row(t, today))),
    );

    const pager = pages > 1 && h(
      'nav',
      { class: 'row pager', 'aria-label': '페이지' },
      h('button', { type: 'button', class: 'btn btn--secondary', disabled: current === 0, onClick: () => setState({ page: current - 1 }) }, '이전'),
      h('span', null, `${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + visible.length} / ${sorted.length}건`),
      h('button', { type: 'button', class: 'btn btn--secondary', disabled: current >= pages - 1, onClick: () => setState({ page: current + 1 }) }, '다음'),
    );

    root.replaceChildren(sortControls(sort), table, pager || '');
  });
}
