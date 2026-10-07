// 칸반: todo / in_progress / done 3열. 열 안 정렬은 우선순위 → 마감일.
// 카드를 열 사이로 드래그해 상태를 바꾸고, 키보드·모바일에서는 카드의 「상태 변경」 메뉴를 쓴다.
import { todayKst } from '../domain/date.js';
import { sortTasks } from '../domain/sort.js';
import { getUrgency } from '../domain/urgency.js';
import { STATUSES } from '../domain/validation.js';
import { changeStatus } from '../state/actions.js';
import { getVisibleTasks } from '../state/selectors.js';
import { getState, memberById } from '../state/store.js';
import { h, preserveFocus } from '../ui/dom.js';
import { memberName, priorityBadge, STATUS_LABEL, urgencyBadge } from '../ui/labels.js';
import { openTaskDetail } from '../ui/taskDetail.js';
import { statusSelect } from '../ui/taskParts.js';

function card(task, today) {
  const assignee = memberName(memberById(task.assignee_id)) || '미배정';
  return h(
    'li',
    {
      class: 'kanban-card card',
      draggable: 'true',
      'data-task-id': task.id,
      onDragstart: (event) => {
        event.dataTransfer.setData('text/plain', task.id);
        event.dataTransfer.effectAllowed = 'move';
        event.currentTarget.classList.add('is-dragging');
      },
      onDragend: (event) => event.currentTarget.classList.remove('is-dragging'),
    },
    h('div', { class: 'row' }, priorityBadge(task.priority), urgencyBadge(getUrgency(task, today))),
    h('button', {
      type: 'button',
      class: 'link-btn',
      'data-focus-key': `open-${task.id}`,
      onClick: () => openTaskDetail(task.id),
    }, task.title),
    h('p', { class: 'muted kanban-card__meta' }, `${assignee} · ${task.due_date ?? '마감일 없음'}`),
    statusSelect(task, 'kanban-status'),
  );
}

function column(status, tasks, today) {
  const headingId = `kanban-heading-${status}`;
  const body = h(
    'ul',
    { class: 'kanban-col__body' },
    ...(tasks.length ? tasks.map((t) => card(t, today)) : [h('li', { class: 'muted kanban-empty' }, '항목 없음')]),
  );
  const section = h(
    'section',
    {
      class: 'kanban-col',
      'data-status': status,
      'aria-labelledby': headingId,
      onDragover: (event) => {
        event.preventDefault(); // 드롭 허용
        event.dataTransfer.dropEffect = 'move';
        section.classList.add('is-over');
      },
      onDragleave: (event) => {
        if (!section.contains(event.relatedTarget)) section.classList.remove('is-over');
      },
      onDrop: (event) => {
        event.preventDefault();
        section.classList.remove('is-over');
        const task = getState().tasks.find((t) => t.id === event.dataTransfer.getData('text/plain'));
        if (task) changeStatus(task, status);
      },
    },
    h(
      'h3',
      { class: 'kanban-col__head', id: headingId },
      STATUS_LABEL[status],
      ' ',
      h('span', { class: `badge badge--status-${status}`, 'aria-label': `${tasks.length}건` }, String(tasks.length)),
    ),
    body,
  );
  return section;
}

export function renderKanbanView(root) {
  const visible = getVisibleTasks();
  const today = todayKst();
  const sorted = sortTasks(visible, { key: 'priority', dir: 'asc' }, (id) => memberById(id)?.name ?? null);
  preserveFocus(() => {
    root.replaceChildren(
      h('div', { class: 'kanban' }, ...STATUSES.map((s) => column(s, sorted.filter((t) => t.status === s), today))),
    );
  });
}
