// 월간 캘린더: 할일을 마감일(due_date) 칸에 배치한다.
// 데스크탑/태블릿은 칸 안에 3개까지 보여주고 나머지는 「+N개」, 모바일은 월 격자 + 선택일 목록이다.
import { addMonths, buildMonthGrid, groupByDue, monthOf, parseMonthKey } from '../domain/calendar.js';
import { todayKst } from '../domain/date.js';
import { getUrgency } from '../domain/urgency.js';
import { setMonth } from '../state/criteria.js';
import { getVisibleTasks } from '../state/selectors.js';
import { getState, memberById, setState } from '../state/store.js';
import { openDialog } from '../ui/dialog.js';
import { h, preserveFocus } from '../ui/dom.js';
import { memberName, statusBadge, urgencyBadge } from '../ui/labels.js';
import { openTaskDetail } from '../ui/taskDetail.js';
import { openTaskForm } from '../ui/taskForm.js';

const MAX_PER_CELL = 3;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const mobileQuery = window.matchMedia('(max-width: 639px)');

let selectedDay = null; // 모바일에서 선택한 날짜

const dayLabel = (key) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
const newTaskOn = (dateKey) => openTaskForm({ defaults: { due_date: dateKey } });

function taskButton(task, today, keyPrefix) {
  return h(
    'button',
    {
      type: 'button',
      class: `cal-task cal-task--${task.status}`,
      'data-focus-key': `${keyPrefix}-${task.id}`,
      onClick: (event) => {
        event.stopPropagation();
        openTaskDetail(task.id);
      },
    },
    h('span', { class: 'cal-task__title' }, task.title),
    urgencyBadge(getUrgency(task, today)),
  );
}

function openDayDialog(dateKey, tasks, today) {
  const handle = openDialog({
    title: `${dayLabel(dateKey)} 할일 ${tasks.length}건`,
    body: [
      h('ul', { class: 'day-list' }, ...tasks.map((t) =>
        h('li', { class: 'row' }, statusBadge(t.status), taskButton(t, today, 'day')))),
      h('div', { class: 'row dialog__actions' },
        h('button', { type: 'button', class: 'btn btn--primary', onClick: () => { handle.close(); newTaskOn(dateKey); } }, '이 날짜로 새 할일'),
        h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => handle.close() }, '닫기')),
    ],
  });
}

function desktopCell(dateKey, tasks, { month, today }) {
  const shown = tasks.slice(0, MAX_PER_CELL);
  const more = tasks.length - shown.length;
  return h(
    'td',
    {
      class: `cal-cell${monthOf(dateKey) !== month ? ' cal-cell--other' : ''}${dateKey === today ? ' cal-cell--today' : ''}`,
      onClick: (event) => { if (event.target === event.currentTarget) newTaskOn(dateKey); },
    },
    h('button', {
      type: 'button',
      class: 'cal-date',
      'data-focus-key': `cal-date-${dateKey}`,
      'aria-label': `${dayLabel(dateKey)} 새 할일 등록${dateKey === today ? ' (오늘)' : ''}`,
      onClick: (event) => { event.stopPropagation(); newTaskOn(dateKey); },
    }, String(Number(dateKey.slice(8, 10)))),
    ...shown.map((t) => taskButton(t, today, 'cal')),
    more > 0 && h('button', {
      type: 'button',
      class: 'cal-more',
      'data-focus-key': `cal-more-${dateKey}`,
      'aria-label': `${dayLabel(dateKey)} 할일 ${more}개 더 보기`,
      onClick: (event) => { event.stopPropagation(); openDayDialog(dateKey, tasks, today); },
    }, `+${more}개`),
  );
}

function mobileCell(dateKey, tasks, { month, today }) {
  return h(
    'td',
    { class: `cal-cell${monthOf(dateKey) !== month ? ' cal-cell--other' : ''}${dateKey === today ? ' cal-cell--today' : ''}` },
    h('button', {
      type: 'button',
      class: 'cal-date',
      'data-focus-key': `cal-date-${dateKey}`,
      'aria-pressed': String(dateKey === selectedDay),
      'aria-label': `${dayLabel(dateKey)}, 할일 ${tasks.length}건${dateKey === today ? ' (오늘)' : ''}`,
      onClick: () => { selectedDay = dateKey; renderCalendarView(document.getElementById('view-root')); },
    }, String(Number(dateKey.slice(8, 10))), tasks.length > 0 && h('span', { class: 'cal-count' }, String(tasks.length))),
  );
}

export function renderCalendarView(root) {
  const { month } = getState();
  const today = todayKst();
  const { byDate, noDue } = groupByDue(getVisibleTasks());
  const grid = buildMonthGrid(month);
  const mobile = mobileQuery.matches;
  const { year, month: monthNumber } = parseMonthKey(month);
  const context = { month, today };

  if (mobile && (!selectedDay || monthOf(selectedDay) !== month)) {
    selectedDay = monthOf(today) === month ? today : `${month}-01`;
  }

  preserveFocus(() => {
    const nav = h(
      'div',
      { class: 'cal-nav row' },
      h('button', { type: 'button', class: 'btn btn--secondary', 'aria-label': '이전 달', onClick: () => setMonth(addMonths(month, -1)) }, '‹'),
      h('h2', { class: 'cal-title', 'aria-live': 'polite' }, `${year}년 ${monthNumber}월`),
      h('button', { type: 'button', class: 'btn btn--secondary', 'aria-label': '다음 달', onClick: () => setMonth(addMonths(month, 1)) }, '›'),
      h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => setMonth(monthOf(today)) }, '오늘'),
    );

    const table = h(
      'table',
      { class: `cal-grid${mobile ? ' cal-grid--mobile' : ''}` },
      h('caption', { class: 'visually-hidden' }, `${year}년 ${monthNumber}월 마감일 캘린더`),
      h('thead', null, h('tr', null, ...WEEKDAYS.map((d) => h('th', { scope: 'col' }, d)))),
      h('tbody', null, ...grid.map((week) =>
        h('tr', null, ...week.map((key) => (mobile ? mobileCell : desktopCell)(key, byDate.get(key) ?? [], context))))),
    );

    const selectedTasks = mobile ? byDate.get(selectedDay) ?? [] : [];
    const dayPanel = mobile && h(
      'section',
      { class: 'card stack', 'aria-labelledby': 'cal-day-heading' },
      h('h3', { id: 'cal-day-heading' }, `${dayLabel(selectedDay)} 할일 ${selectedTasks.length}건`),
      selectedTasks.length
        ? h('ul', { class: 'day-list' }, ...selectedTasks.map((t) => h('li', { class: 'row' }, statusBadge(t.status), taskButton(t, today, 'day'))))
        : h('p', { class: 'muted' }, '이 날짜에 마감인 할일이 없습니다.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn--primary', onClick: () => newTaskOn(selectedDay) }, '이 날짜로 새 할일')),
    );

    const noDueSection = h(
      'section',
      { class: 'card stack', 'aria-labelledby': 'cal-nodue-heading' },
      h('h3', { id: 'cal-nodue-heading' }, `마감일 없음 (${noDue.length}건)`),
      noDue.length
        ? h('ul', { class: 'day-list' }, ...noDue.map((t) => h('li', { class: 'row' }, statusBadge(t.status), taskButton(t, today, 'nodue'),
            h('span', { class: 'muted' }, memberName(memberById(t.assignee_id)) || '미배정'))))
        : h('p', { class: 'muted' }, '마감일이 없는 할일이 없습니다.'),
    );

    root.replaceChildren(h('div', { class: 'stack' }, nav, table, dayPanel || '', noDueSection));
  });
}

// 화면 폭이 모바일 경계를 넘나들면 다시 그린다.
mobileQuery.addEventListener('change', () => {
  if (getState().view === 'calendar') setState({});
});
