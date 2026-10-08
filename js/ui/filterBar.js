// 검색창·필터 패널·활성 필터 칩·결과 건수. 데스크탑(≥1024px)은 좌측 사이드바,
// 태블릿(640~1023px)은 접이식 패널, 모바일(≤639px)은 전체 화면 시트(배경 inert)다. 배치는 CSS가 정한다.
import { ACTIVE_VIEW, countUserFilters, FILTER_KEYS, UNASSIGNED, URGENCY_VALUES } from '../domain/filters.js';
import { PRIORITIES, STATUSES } from '../domain/validation.js';
import { clearAll, removeFilterValue, setQuery, toggleFilter } from '../state/criteria.js';
import { getScopeTasks, getVisibleTasks, hasActiveCriteria } from '../state/selectors.js';
import { getState, memberById, subscribeStore } from '../state/store.js';
import { h, preserveFocus } from './dom.js';
import { memberName, PRIORITY_LABEL, STATUS_LABEL } from './labels.js';

const GROUP_LABEL = { status: '상태', priority: '우선순위', assignee: '담당자', category: '카테고리', urgency: '마감' };
const URGENCY_LABEL = { soon: '임박(D-3~D-day)', overdue: '지연' };
const SEARCH_DEBOUNCE_MS = 200;

function optionsFor(key, state) {
  switch (key) {
    case 'status': return STATUSES.map((v) => ({ value: v, text: STATUS_LABEL[v] }));
    case 'priority': return PRIORITIES.map((v) => ({ value: v, text: PRIORITY_LABEL[v] }));
    case 'assignee':
      return [
        { value: UNASSIGNED, text: '미배정' },
        ...state.members.filter((m) => m.active).map((m) => ({ value: m.id, text: memberName(m) })),
      ];
    case 'urgency': return URGENCY_VALUES.map((v) => ({ value: v, text: URGENCY_LABEL[v] }));
    case 'category': {
      const known = state.config?.categories ?? [];
      const extra = [...new Set(state.tasks.map((t) => t.category).filter((c) => c && !known.includes(c)))];
      return [...known, ...extra].map((v) => ({ value: v, text: v }));
    }
    default: return [];
  }
}

function chipLabel(key, value) {
  if (key === 'status') return STATUS_LABEL[value];
  if (key === 'priority') return PRIORITY_LABEL[value];
  if (key === 'urgency') return URGENCY_LABEL[value];
  if (key === 'assignee') return value === UNASSIGNED ? '미배정' : memberName(memberById(value)) || '알 수 없음';
  return value;
}

export function initFilterBar({ panel, toggle, searchInput, chips, count, content }) {
  const isCollapsible = window.matchMedia('(max-width: 1023px)');
  const isMobile = window.matchMedia('(max-width: 639px)');
  let open = false;
  let typingTimer = null;
  let signature = '';

  function setOpen(next, { restoreFocus = true } = {}) {
    open = next;
    panel.dataset.open = String(next);
    toggle.setAttribute('aria-expanded', String(next));
    // 모바일 시트가 열려 있는 동안에는 배경을 비활성화해 포커스를 가둔다.
    const modal = next && isMobile.matches;
    for (const el of [document.querySelector('.app-header'), content]) el.inert = modal;
    if (next) panel.querySelector('input')?.focus();
    else if (restoreFocus) toggle.focus();
  }

  toggle.addEventListener('click', () => setOpen(!open));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open && isCollapsible.matches) {
      event.stopPropagation();
      setOpen(false);
    }
  });
  isCollapsible.addEventListener('change', () => setOpen(false, { restoreFocus: false }));
  isMobile.addEventListener('change', () => setOpen(false, { restoreFocus: false }));

  searchInput.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      typingTimer = null;
      setQuery(searchInput.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  function filterGroup(key, state) {
    // 진행 중 보기에서는 상태가 고정이므로 체크박스 대신 고정 안내를 보여 준다(저장된 상태 필터는 건드리지 않는다).
    if (key === 'status' && state.view === ACTIVE_VIEW) {
      return h(
        'fieldset',
        { class: 'filter-group' },
        h('legend', null, GROUP_LABEL.status),
        h('p', { class: 'filter-fixed' }, STATUS_LABEL.in_progress, h('span', { class: 'muted' }, ' (이 보기에서는 고정)')),
      );
    }
    return h(
      'fieldset',
      { class: 'filter-group' },
      h('legend', null, GROUP_LABEL[key]),
      ...optionsFor(key, state).map(({ value, text }) =>
        h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: state.filters[key].includes(value),
            'data-focus-key': `filter-${key}-${value}`,
            onChange: () => toggleFilter(key, value),
          }),
          h('span', null, text),
        ),
      ),
    );
  }

  function buildPanel(state) {
    const activeView = state.view === ACTIVE_VIEW;
    const groups = FILTER_KEYS.map((key) => filterGroup(key, state));
    panel.replaceChildren(
      h(
        'div',
        { class: 'filter-panel__head' },
        h('h2', { class: 'filter-panel__title' }, '필터'),
        h('button', { type: 'button', class: 'btn btn--secondary filter-panel__close', onClick: () => setOpen(false) }, '닫기'),
      ),
      ...groups,
      h('button', { type: 'button', class: 'btn btn--secondary', 'data-focus-key': 'filter-clear', onClick: clearAll }, activeView ? '조건 초기화' : '모두 해제'),
    );
  }

  function buildChips(state) {
    const items = [];
    const activeView = state.view === ACTIVE_VIEW;
    // 진행 중 보기: 항상 적용 중인 고정 조건을 먼저 보여 준다(해제할 수 없음).
    if (activeView) items.push(h('span', { class: 'chip chip--fixed' }, '상태: 진행 중 (고정)'));
    if (state.query.trim()) {
      items.push(
        h('button', { type: 'button', class: 'chip', 'aria-label': `검색어 해제: ${state.query.trim()}`, onClick: () => setQuery('') }, `검색: ${state.query.trim()} ✕`),
      );
    }
    for (const key of FILTER_KEYS) {
      if (activeView && key === 'status') continue; // 저장된 상태 필터는 이 보기에서 쓰이지 않는다
      for (const value of state.filters[key]) {
        items.push(
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'data-focus-key': `chip-${key}-${value}`,
              'aria-label': `필터 해제: ${GROUP_LABEL[key]} ${chipLabel(key, value)}`,
              onClick: () => removeFilterValue(key, value),
            },
            `${GROUP_LABEL[key]}: ${chipLabel(key, value)} ✕`,
          ),
        );
      }
    }
    const fixed = activeView ? 1 : 0;
    if (items.length > fixed) items.push(h('button', { type: 'button', class: 'btn btn--secondary chip-clear', onClick: clearAll }, activeView ? '조건 초기화' : '모두 해제'));
    chips.replaceChildren(...items);
  }

  function update(state) {
    // 패널은 필터·부서원·카테고리가 바뀔 때만 다시 만든다.
    const next = JSON.stringify([state.view === ACTIVE_VIEW, state.filters, state.members.map((m) => [m.id, m.name, m.label, m.active]), state.config?.categories]);
    if (next !== signature) {
      signature = next;
      preserveFocus(() => buildPanel(state));
    }
    preserveFocus(() => buildChips(state));

    // URL에서 복원된 검색어 반영(직접 입력 중에는 건드리지 않는다).
    if (typingTimer === null && searchInput.value.trim() !== state.query.trim()) searchInput.value = state.query;

    const active = countUserFilters(state.view, state.filters);
    toggle.textContent = active ? `필터 (${active})` : '필터';
    const shown = getVisibleTasks().length;
    // 진행 중 보기에서는 「진행 중 N건 중 M건」: 분모는 검색·필터 전의 진행 중 전체이며 화면의 목록과 항상 같은 기준이다.
    const scope = state.view === ACTIVE_VIEW ? '진행 중' : '전체';
    const total = getScopeTasks().length;
    count.textContent = state.loading
      ? ''
      : hasActiveCriteria()
        ? `${scope} ${total}건 중 ${shown}건`
        : state.view === ACTIVE_VIEW
          ? `진행 중 ${shown}건`
          : `${shown}건`;
  }

  subscribeStore(update);
  update(getState());
}
