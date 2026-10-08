// 「진행 중 업무」 보기의 그룹·마감 문구. UI와 무관한 순수 로직이라 node에서 테스트한다.
// 날짜 판단은 한국 시간 달력일(date.js)과 긴급 배지 규칙(urgency.js)을 그대로 쓴다.
import { diffDays } from './date.js';
import { sortTasks } from './sort.js';
import { getUrgency } from './urgency.js';

/** 화면에 보이는 순서. soon은 긴급 규칙의 「임박」(오늘부터 3일 이내)과 같다. */
export const IN_PROGRESS_GROUPS = [
  { key: 'overdue', label: '마감 지연' },
  { key: 'soon', label: '마감 임박', hint: '오늘부터 3일 이내' },
  { key: 'later', label: '그 외 진행 중' },
  { key: 'none', label: '마감일 없음' },
];

export const isInProgress = (task) => task.status === 'in_progress';

/**
 * 진행 중인 업무만 4개 그룹으로 나누고, 각 그룹은 마감일 빠른 순(같으면 우선순위순)으로 정렬한다.
 * 항상 4개 그룹을 같은 순서로 돌려주며, 비어 있는 그룹은 tasks가 빈 배열이다.
 * @param {(id: string|null) => string|null} assigneeName
 */
export function groupInProgress(tasks, today, assigneeName = () => null) {
  const buckets = { overdue: [], soon: [], later: [], none: [] };
  for (const task of tasks) {
    if (!isInProgress(task)) continue;
    const key = task.due_date ? getUrgency(task, today)?.kind ?? 'later' : 'none';
    buckets[key].push(task);
  }
  return IN_PROGRESS_GROUPS.map((group) => ({
    ...group,
    tasks: sortTasks(buckets[group.key], { key: 'due_date', dir: 'asc' }, assigneeName),
  }));
}

/**
 * 마감까지 남은 일수·지연 일수 문구. kind는 색 표현에 쓰고, text는 항상 함께 보여 준다.
 * @returns {{kind: 'overdue'|'soon'|'later'|'none', text: string, days: number|null}}
 */
export function dueSummary(task, today) {
  if (!task.due_date) return { kind: 'none', text: '마감일 없음', days: null };
  const urgency = getUrgency(task, today);
  const days = urgency ? urgency.days : diffDays(task.due_date, today);
  if (days < 0) return { kind: 'overdue', text: `${-days}일 지연`, days };
  if (days === 0) return { kind: 'soon', text: '오늘 마감', days };
  return { kind: urgency ? 'soon' : 'later', text: `${days}일 남음`, days };
}
