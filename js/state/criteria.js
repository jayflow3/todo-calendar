// 검색어·필터·뷰·월을 바꾸는 동작. 바뀌면 리스트 페이지를 처음으로 되돌린다.
import { emptyFilters } from '../domain/filters.js';
import { getState, setState } from './store.js';

export const setQuery = (query) => setState({ query, page: 0 });
export const setView = (view) => setState({ view });
export const setMonth = (month) => setState({ month });
export const clearFilters = () => setState({ filters: emptyFilters(), page: 0 });
export const clearAll = () => setState({ query: '', filters: emptyFilters(), page: 0 });

export function toggleFilter(key, value) {
  const { filters } = getState();
  const next = filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value];
  setState({ filters: { ...filters, [key]: next }, page: 0 });
}

export function removeFilterValue(key, value) {
  const { filters } = getState();
  setState({ filters: { ...filters, [key]: filters[key].filter((v) => v !== value) }, page: 0 });
}
