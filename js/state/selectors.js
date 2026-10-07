// 모든 뷰가 같은 필터 결과를 쓰도록 하는 단일 선택자(PRD 5.5 일관된 검색·필터).
import { applyFilters, countActiveFilters } from '../domain/filters.js';
import { getState, memberById } from './store.js';

export const assigneeName = (id) => memberById(id)?.name ?? null;

export function getVisibleTasks() {
  const { tasks, query, filters } = getState();
  return applyFilters(tasks, query, filters, assigneeName);
}

export function hasActiveCriteria() {
  const { query, filters } = getState();
  return Boolean(query.trim()) || countActiveFilters(filters) > 0;
}
