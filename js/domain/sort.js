// 리스트 정렬. 기본 정렬은 우선순위(높은 순) → 마감일(빠른 순, 마감일 없음은 마지막).
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const STATUS_RANK = { todo: 0, in_progress: 1, done: 2 };

export const SORT_KEYS = ['title', 'status', 'priority', 'assignee', 'category', 'due_date'];

const collator = new Intl.Collator('ko');

function compareDue(a, b) {
  if (a.due_date === b.due_date) return 0;
  if (!a.due_date) return 1; // 마감일 없음은 항상 마지막
  if (!b.due_date) return -1;
  return a.due_date < b.due_date ? -1 : 1;
}

function comparePriorityThenDue(a, b) {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDue(a, b);
}

/**
 * @param {{key: string, dir: 'asc'|'desc'}} sort  dir은 선택한 열에만 적용된다.
 * @param {(id: string|null) => string|null} assigneeName
 */
export function sortTasks(tasks, sort, assigneeName = () => null) {
  const sign = sort.dir === 'desc' ? -1 : 1;
  const primary = {
    title: (a, b) => collator.compare(a.title, b.title),
    status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    category: (a, b) => collator.compare(a.category ?? '', b.category ?? ''),
    assignee: (a, b) => {
      const [x, y] = [assigneeName(a.assignee_id), assigneeName(b.assignee_id)];
      if (!x && !y) return 0;
      if (!x) return 1; // 미배정은 마지막
      if (!y) return -1;
      return collator.compare(x, y);
    },
  }[sort.key];

  return [...tasks].sort((a, b) => {
    if (sort.key === 'due_date') {
      const noDue = !a.due_date || !b.due_date;
      const d = compareDue(a, b);
      return (noDue ? d : d * sign) || comparePriorityThenDue(a, b);
    }
    return (primary ? primary(a, b) * sign : 0) || comparePriorityThenDue(a, b);
  });
}
