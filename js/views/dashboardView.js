// 대시보드(PRD 5.6, M1~M6). 현재 적용된 검색·필터를 반영하며, 카드를 누르면 같은 조건의 리스트로 이동한다.
import { todayKst } from '../domain/date.js';
import { UNASSIGNED } from '../domain/filters.js';
import { computeStats } from '../domain/stats.js';
import { getState, memberById, setState } from '../state/store.js';
import { getVisibleTasks } from '../state/selectors.js';
import { h, preserveFocus, svg } from '../ui/dom.js';
import { formatDateTime, memberName, STATUS_LABEL } from '../ui/labels.js';
import { openTaskDetail } from '../ui/taskDetail.js';

const BAR_WIDTH = 100; // viewBox 기준 폭
const BAR_HEIGHT = 8;
const INCOMPLETE = ['todo', 'in_progress'];

/** 리스트 뷰로 이동하면서 조건을 덧붙인다(현재 필터 위에 쌓으므로 카드 숫자와 리스트 건수가 같다). */
function goToList(patch) {
  const { filters } = getState();
  setState({ view: 'list', filters: { ...filters, ...patch }, page: 0 });
}

const percent = (value) => (value === null ? '–' : `${value}%`);

/** 값 텍스트와 함께 쓰는 가로 막대. 색만으로 전달하지 않는다(숫자는 항상 별도 텍스트로 표시). */
function bar(ratio, modifier = '') {
  const width = Math.max(0, Math.min(1, ratio)) * BAR_WIDTH;
  return svg(
    'svg',
    { class: 'bar', viewBox: `0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { class: 'bar__track', x: 0, y: 0, width: BAR_WIDTH, height: BAR_HEIGHT, rx: 2 }),
    width > 0 && svg('rect', { class: `bar__fill ${modifier}`, x: 0, y: 0, width, height: BAR_HEIGHT, rx: 2 }),
  );
}

function stackedBar(counts, total) {
  let x = 0;
  const segments = ['todo', 'in_progress', 'done'].map((status) => {
    const width = total ? (counts[status] / total) * BAR_WIDTH : 0;
    const rect = width > 0 && svg('rect', { class: `bar__fill bar__fill--${status}`, x, y: 0, width, height: BAR_HEIGHT });
    x += width;
    return rect;
  });
  return svg(
    'svg',
    { class: 'bar', viewBox: `0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    svg('rect', { class: 'bar__track', x: 0, y: 0, width: BAR_WIDTH, height: BAR_HEIGHT, rx: 2 }),
    ...segments,
  );
}

function metricCard({ id, title, value, note, onClick, disabled }) {
  const label = h('span', { class: 'metric__label' }, title);
  const number = h('span', { class: 'metric__value', 'data-metric': id }, value);
  const body = [label, number, note && h('span', { class: 'metric__note' }, note)];
  return onClick
    ? h('button', {
        type: 'button',
        class: 'metric metric--action card',
        'data-focus-key': `metric-${id}`,
        disabled,
        'aria-label': `${title} ${value}${note ? `, ${note}` : ''}. 눌러서 리스트에서 보기`,
        onClick,
      }, ...body)
    : h('div', { class: 'metric card' }, ...body);
}

function workloadRow(row, threshold) {
  const name = row.assigneeId ? memberName(row.member) || '알 수 없음' : '미배정';
  const target = row.assigneeId ?? UNASSIGNED;
  const max = Math.max(threshold, row.count);
  return h(
    'li',
    { class: 'workload__row' },
    h(
      'button',
      {
        type: 'button',
        class: 'workload__name link-btn',
        'data-focus-key': `workload-${target}`,
        'aria-label': `${name} 미완료 ${row.count}건${row.overload ? ' 과부하' : ''}. 눌러서 리스트에서 보기`,
        onClick: () => {
          const current = getState().filters.status.filter((s) => INCOMPLETE.includes(s));
          goToList({ assignee: [target], status: current.length ? current : INCOMPLETE });
        },
      },
      name,
    ),
    bar(row.count / max, row.overload ? 'bar__fill--overload' : ''),
    h('span', { class: 'workload__count' }, `${row.count}건`),
    row.overload && h('span', { class: 'badge badge--priority-high' }, '과부하'),
  );
}

export function renderDashboardView(root) {
  const { config, loading } = getState();
  const stats = computeStats(getVisibleTasks(), getState().members, todayKst(), {
    overloadThreshold: config?.overloadThreshold ?? 8,
  });
  const threshold = config?.overloadThreshold ?? 8;
  const statusCard = (status) =>
    metricCard({
      id: status,
      title: STATUS_LABEL[status],
      value: String(stats.counts[status]),
      disabled: stats.counts[status] === 0,
      onClick: () => goToList({ status: [status] }),
    });

  preserveFocus(() => {
    if (loading) return root.replaceChildren(h('div', { class: 'skeleton-list', 'aria-busy': 'true' }, h('div', { class: 'skeleton' })));

    root.replaceChildren(
      h(
        'div',
        { class: 'dashboard stack' },
        h('section', { class: 'stack', 'aria-labelledby': 'dash-status' },
          h('h2', { id: 'dash-status', class: 'section-title' }, '상태별 현황'),
          h('div', { class: 'metric-grid' }, statusCard('todo'), statusCard('in_progress'), statusCard('done')),
          h('div', { class: 'card stack' },
            stackedBar(stats.counts, stats.total),
            h('p', { class: 'muted' }, `전체 ${stats.total}건 — 할 일 ${stats.counts.todo} · 진행 중 ${stats.counts.in_progress} · 완료 ${stats.counts.done}`))),
        h('div', { class: 'metric-grid' },
          h('div', { class: 'metric card stack' },
            h('span', { class: 'metric__label' }, '완료율'),
            h('span', { class: 'metric__value', 'data-metric': 'completion' }, percent(stats.completionRate)),
            bar((stats.completionRate ?? 0) / 100, 'bar__fill--done')),
          metricCard({
            id: 'soon', title: '마감 임박', value: String(stats.soon), note: 'D-3 ~ D-day',
            disabled: stats.soon === 0, onClick: () => goToList({ urgency: ['soon'] }),
          }),
          metricCard({
            id: 'overdue', title: '지연', value: String(stats.overdue),
            note: `지연 비율 ${percent(stats.overdueRate)}`,
            disabled: stats.overdue === 0, onClick: () => goToList({ urgency: ['overdue'] }),
          })),
        h('section', { class: 'card stack', 'aria-labelledby': 'dash-load' },
          h('h2', { id: 'dash-load', class: 'section-title' }, '담당자별 부하(미완료)'),
          stats.workload.length
            ? h('ul', { class: 'workload' }, ...stats.workload.map((row) => workloadRow(row, threshold)))
            : h('p', { class: 'muted' }, '미완료 할일이 없습니다.'),
          h('p', { class: 'muted' }, `${threshold}건 이상이면 「과부하」로 표시합니다.`)),
        h('section', { class: 'card stack', 'aria-labelledby': 'dash-history' },
          h('h2', { id: 'dash-history', class: 'section-title' }, '완료 이력'),
          h('p', { 'data-metric': 'last7' }, `최근 7일 완료 ${stats.completedLast7Days}건`),
          stats.history.length
            ? h('ol', { class: 'history' }, ...stats.history.map((t) =>
                h('li', { class: 'row' },
                  h('button', { type: 'button', class: 'link-btn', 'data-focus-key': `history-${t.id}`, onClick: () => openTaskDetail(t.id) }, t.title),
                  h('span', { class: 'muted' }, `${memberName(memberById(t.assignee_id)) || '미배정'} · ${formatDateTime(t.completed_at)}`))))
            : h('p', { class: 'muted' }, '완료된 할일이 없습니다.'))),
    );
  });
}
