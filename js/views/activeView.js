// 「진행 중 업무」 보기: 월과 상관없이 status가 진행 중인 업무 전체를 마감 상황별로 묶어 보여 준다.
// 목록은 getVisibleTasks()(공통 검색·필터, 상태는 진행 중으로 고정)에서만 받고, 데이터를 따로 복사하지 않는다.
import { todayKst } from '../domain/date.js';
import { dueSummary, groupInProgress } from '../domain/inProgress.js';
import { getUrgency } from '../domain/urgency.js';
import { clearAll, setView } from '../state/criteria.js';
import { getScopeTasks, getVisibleTasks, hasActiveCriteria } from '../state/selectors.js';
import { getState, memberById } from '../state/store.js';
import { captureFocus, h, renderProgressive } from '../ui/dom.js';
import { memberName, priorityBadge, urgencyBadge } from '../ui/labels.js';
import { remoteMark, statusSelect } from '../ui/taskParts.js';
import { openTaskDetail } from '../ui/taskDetail.js';
import { openTaskForm } from '../ui/taskForm.js';
import { skeleton } from './listView.js';

const FIRST_PAINT_ITEMS = 40;

function emptyState() {
  // 진행 중 업무가 아예 없을 때와, 검색·필터 때문에 없을 때는 안내와 할 수 있는 일이 다르다.
  if (getScopeTasks().length === 0) {
    return h(
      'div',
      { class: 'empty-state card stack' },
      h('p', null, '진행 중인 업무가 없습니다.'),
      h('p', { class: 'muted' }, '업무의 상태를 「진행 중」으로 바꾸면 여기에 모입니다.'),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn--primary', onClick: () => openTaskForm({ defaults: { status: 'in_progress' } }) }, '새 할일'),
        h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => setView('list') }, '리스트 보기')),
    );
  }
  return h(
    'div',
    { class: 'empty-state card stack' },
    h('p', null, '조건에 맞는 진행 중 업무가 없습니다.'),
    hasActiveCriteria() && h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--secondary', onClick: clearAll }, '조건 초기화')),
  );
}

function item(task, group, today) {
  const assignee = memberName(memberById(task.assignee_id));
  const due = dueSummary(task, today);
  return h(
    'li',
    {
      class: `active-item card active-item--${group.key}`,
      onClick: (event) => { if (!event.target.closest('select, button')) openTaskDetail(task.id); },
    },
    // 제목과 담당자가 가장 먼저 눈에 들어오도록 왼쪽에 크게 둔다.
    h('div', { class: 'active-item__main' },
      h('button', { type: 'button', class: 'link-btn active-item__title', 'data-focus-key': `open-${task.id}`, onClick: () => openTaskDetail(task.id) }, task.title),
      remoteMark(task),
      h('span', { class: `active-item__assignee${assignee ? '' : ' muted'}` },
        h('span', { class: 'visually-hidden' }, '담당자 '), assignee || '미배정')),
    h('div', { class: 'active-item__meta' },
      h('span', { class: 'active-item__due' }, h('span', { class: 'visually-hidden' }, '마감일 '), task.due_date ?? '마감일 없음'),
      // 색에만 의존하지 않도록 D-n 배지와 「2일 지연」 같은 글자를 함께 보여 준다.
      h('span', { class: `active-item__remain active-item__remain--${due.kind}` },
        urgencyBadge(getUrgency(task, today)), due.kind === 'none' ? null : due.text),
      priorityBadge(task.priority)),
    h('div', { class: 'active-item__actions' }, statusSelect(task)),
  );
}

export function renderActiveView(root) {
  const { loading } = getState();
  if (loading) return root.replaceChildren(h('div', { class: 'active-view' }, skeleton()));

  const tasks = getVisibleTasks();
  if (!tasks.length) return root.replaceChildren(h('div', { class: 'active-view' }, emptyState()));

  const today = todayKst();
  const groups = groupInProgress(tasks, today, (id) => memberById(id)?.name ?? null);
  const restoreFocus = captureFocus();

  const summary = h(
    'ul',
    { class: 'active-summary', 'aria-label': '마감 상황별 건수' },
    ...groups.map((g) => h('li', { class: `active-summary__item active-summary__item--${g.key}` },
      h('span', { class: 'active-summary__label' }, g.label), h('strong', { class: 'active-summary__count' }, `${g.tasks.length}건`))),
  );

  const shown = groups.filter((g) => g.tasks.length).map((g) => ({
    group: g,
    list: h('ul', { class: 'active-list' }),
  }));
  const sections = shown.map(({ group: g, list }) =>
    h(
      'section',
      { class: 'active-group stack', 'aria-labelledby': `active-group-${g.key}` },
      h('h3', { class: 'active-group__title', id: `active-group-${g.key}` },
        g.label, ' ', h('span', { class: 'active-group__count' }, `${g.tasks.length}건`),
        g.hint && h('span', { class: 'active-group__hint muted' }, ` · ${g.hint}`)),
      list,
    ));
  root.replaceChildren(h('div', { class: 'active-view stack' }, summary, ...sections));

  // 많을 때(1,000건)도 반응하도록 첫 화면에는 전체에서 앞 40건만 그리고, 나머지는 그룹 순서대로 다음 프레임들에 이어 붙인다.
  let budget = FIRST_PAINT_ITEMS;
  const drawFrom = (index) => {
    const entry = shown[index];
    if (!entry) return restoreFocus(); // 아직 안 그려진 행에 포커스가 있었다면 다 그린 뒤 복원
    const first = Math.min(budget, entry.group.tasks.length);
    budget = Math.max(0, budget - first);
    renderProgressive(entry.list, entry.group.tasks, (t) => item(t, entry.group, today), {
      first,
      chunk: FIRST_PAINT_ITEMS,
      onDone: () => drawFrom(index + 1),
    });
  };
  drawFrom(0);
  restoreFocus();
}
