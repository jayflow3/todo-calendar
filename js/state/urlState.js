// 뷰·검색·필터를 URL 쿼리로 보존한다(PRD F-11). DOM에 의존하지 않는 순수 함수라 node에서 테스트한다.
import { emptyFilters, FILTER_KEYS, URGENCY_VALUES } from '../domain/filters.js';
import { parseMonthKey } from '../domain/calendar.js';
import { PRIORITIES, STATUSES } from '../domain/validation.js';

export const VIEWS = ['list', 'kanban', 'calendar', 'dashboard', 'active'];

const ENUMS = { status: STATUSES, priority: PRIORITIES, urgency: URGENCY_VALUES };

/** @returns {{view: string, query: string, filters: object, month: string|null}} */
export function parseUrlState(search) {
  const params = new URLSearchParams(search);
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'list';
  const filters = emptyFilters();
  for (const key of FILTER_KEYS) {
    const values = (params.get(key) ?? '').split(',').filter(Boolean);
    filters[key] = [...new Set(ENUMS[key] ? values.filter((v) => ENUMS[key].includes(v)) : values)];
  }
  const month = parseMonthKey(params.get('month')) ? params.get('month') : null;
  return { view, query: (params.get('q') ?? '').slice(0, 100), filters, month };
}

/** 기본값은 생략해 URL을 짧게 유지한다. 반환값은 '?...' 또는 ''. */
export function buildSearch({ view, query, filters, month }) {
  const params = new URLSearchParams();
  if (view && view !== 'list') params.set('view', view);
  if (query?.trim()) params.set('q', query.trim());
  for (const key of FILTER_KEYS) if (filters[key].length) params.set(key, filters[key].join(','));
  if (view === 'calendar' && month) params.set('month', month);
  const text = params.toString();
  return text ? `?${text}` : '';
}
