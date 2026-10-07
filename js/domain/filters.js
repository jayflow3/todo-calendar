// 검색·필터(PRD F-07). 한 조건 안에서는 복수 선택 OR, 조건 사이는 AND.
export const UNASSIGNED = '__none__'; // assignee 필터에서 「미배정」을 뜻하는 값
export const FILTER_KEYS = ['status', 'priority', 'assignee', 'category'];

export const emptyFilters = () => ({ status: [], priority: [], assignee: [], category: [] });

export const countActiveFilters = (filters) => FILTER_KEYS.reduce((n, key) => n + filters[key].length, 0);

/** 대소문자와 모든 공백을 무시하기 위한 정규화. */
const normalize = (text) => String(text ?? '').toLowerCase().replace(/\s+/g, '');

/**
 * @param {Array} tasks
 * @param {string} query  제목·담당자 이름 부분 일치
 * @param {{status: string[], priority: string[], assignee: string[], category: string[]}} filters
 * @param {(id: string|null) => string|null} assigneeName  담당자 id → 표시 이름
 */
export function applyFilters(tasks, query, filters, assigneeName = () => null) {
  const q = normalize(query);
  const matches = (list, value) => list.length === 0 || list.includes(value);
  return tasks.filter((task) => {
    if (!matches(filters.status, task.status)) return false;
    if (!matches(filters.priority, task.priority)) return false;
    if (!matches(filters.category, task.category)) return false;
    if (!matches(filters.assignee, task.assignee_id ?? UNASSIGNED)) return false;
    if (!q) return true;
    return normalize(task.title).includes(q) || normalize(assigneeName(task.assignee_id)).includes(q);
  });
}
