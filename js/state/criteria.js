// 검색어·필터·뷰·월을 바꾸는 동작. 바뀌면 리스트 페이지를 처음으로 되돌린다.
import { ACTIVE_VIEW, emptyFilters } from '../domain/filters.js';
import { getState, setState } from './store.js';

export const setQuery = (query) => setState({ query, page: 0 });
export const setView = (view) => setState({ view });
export const setMonth = (month) => setState({ month });

/**
 * 「진행 중 업무」 보기의 초기화는 진행 중 조건을 유지한다. 이 보기에서는 상태 필터를 쓰지도 보여 주지도 않으므로,
 * 다른 보기에서 걸어 둔 상태 필터를 지우지 않고 그대로 남겨 둔다(보기 때문에 기존 필터가 바뀌지 않게).
 */
function resetFilters() {
  const { view, filters } = getState();
  return { ...emptyFilters(), ...(view === ACTIVE_VIEW && { status: filters.status }) };
}

export const clearFilters = () => setState({ filters: resetFilters(), page: 0 });
export const clearAll = () => setState({ query: '', filters: resetFilters(), page: 0 });

export function toggleFilter(key, value) {
  const { filters } = getState();
  const next = filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value];
  setState({ filters: { ...filters, [key]: next }, page: 0 });
}

export function removeFilterValue(key, value) {
  const { filters } = getState();
  setState({ filters: { ...filters, [key]: filters[key].filter((v) => v !== value) }, page: 0 });
}
