// 검색·필터(PRD F-07). 한 조건 안에서는 복수 선택 OR, 조건 사이는 AND.
import { todayKst } from './date.js';
import { getUrgency } from './urgency.js';

export const UNASSIGNED = '__none__'; // assignee 필터에서 「미배정」을 뜻하는 값
export const FILTER_KEYS = ['status', 'priority', 'assignee', 'category', 'urgency'];
export const URGENCY_VALUES = ['soon', 'overdue']; // 대시보드의 임박·지연 카드에서 리스트로 이동할 때 쓰는 조건

export const emptyFilters = () => ({ status: [], priority: [], assignee: [], category: [], urgency: [] });

export const countActiveFilters = (filters) => FILTER_KEYS.reduce((n, key) => n + filters[key].length, 0);

export const ACTIVE_VIEW = 'active'; // 「진행 중 업무」 보기

/**
 * 「진행 중 업무」 보기에서는 저장된 상태 필터(다른 보기에서 건 것)와 상관없이 상태를 진행 중으로 고정한다.
 * 저장된 필터 값 자체는 바꾸지 않으므로, 다른 보기로 돌아가면 원래 필터가 그대로 적용된다.
 */
export const scopeFilters = (view, filters) => (view === ACTIVE_VIEW ? { ...filters, status: ['in_progress'] } : filters);

/** 사용자가 고른 필터 개수. 진행 중 보기에서는 고정된 상태 조건을 세지 않는다. */
export const countUserFilters = (view, filters) => countActiveFilters(view === ACTIVE_VIEW ? { ...filters, status: [] } : filters);

/** 대소문자와 모든 공백을 무시하기 위한 정규화. */
const normalize = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, '');

/**
 * @param {Array} tasks
 * @param {string} query  제목·담당자 이름 부분 일치
 * @param {{status: string[], priority: string[], assignee: string[], category: string[]}} filters
 * @param {(id: string|null) => string|null} assigneeName  담당자 id → 표시 이름
 * @param {string} today  긴급 조건 판정 기준일(한국 시간 달력일)
 */
export function applyFilters(tasks, query, filters, assigneeName = () => null, today = todayKst()) {
  const q = normalize(query);
  const matches = (list, value) => list.length === 0 || list.includes(value);
  return tasks.filter((task) => {
    if (!matches(filters.status, task.status)) return false;
    if (!matches(filters.priority, task.priority)) return false;
    if (!matches(filters.category, task.category)) return false;
    if (!matches(filters.assignee, task.assignee_id ?? UNASSIGNED)) return false;
    if (filters.urgency.length && !filters.urgency.includes(getUrgency(task, today)?.kind)) return false;
    if (!q) return true;
    return normalize(task.title).includes(q) || normalize(assigneeName(task.assignee_id)).includes(q);
  });
}
