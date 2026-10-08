// 모든 뷰가 같은 필터 결과를 쓰도록 하는 단일 선택자(PRD 5.5 일관된 검색·필터).
import { ACTIVE_VIEW, applyFilters, countUserFilters, scopeFilters } from '../domain/filters.js';
import { todayKst } from '../domain/date.js';
import { isInProgress } from '../domain/inProgress.js';
import { getState, memberById } from './store.js';

export const assigneeName = (id) => memberById(id)?.name ?? null;

/** 현재 뷰의 검색·필터 결과. 「진행 중 업무」 보기에서는 상태가 진행 중으로 고정된다(scopeFilters). */
export function getVisibleTasks() {
  const { tasks, query, filters, view } = getState();
  return applyFilters(tasks, query, scopeFilters(view, filters), assigneeName, todayKst());
}

/** 검색·필터를 적용하기 전, 현재 뷰가 다루는 전체 할일(「전체 N건 중 M건」의 N). */
export function getScopeTasks() {
  const { tasks, view } = getState();
  return view === ACTIVE_VIEW ? tasks.filter(isInProgress) : tasks;
}

/** 전체 기간의 진행 중 업무 건수(검색·필터와 무관). 탭과 캘린더 바로가기에 쓴다. */
export const countInProgress = () => getState().tasks.filter(isInProgress).length;

export function hasActiveCriteria() {
  const { query, filters, view } = getState();
  return Boolean(query.trim()) || countUserFilters(view, filters) > 0;
}
