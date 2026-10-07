// 월간 캘린더 계산. 날짜는 모두 'YYYY-MM-DD' 키로 다룬다(한국 시간 달력일).
import { addDays, parseDateKey } from './date.js';
import { sortTasks } from './sort.js';

const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

export function parseMonthKey(key) {
  const match = MONTH_PATTERN.exec(key ?? '');
  if (!match) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  return month >= 1 && month <= 12 ? { year, month } : null;
}

export const monthOf = (dateKey) => dateKey.slice(0, 7);

export function addMonths(monthKey, delta) {
  const { year, month } = parseMonthKey(monthKey);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** 일요일 시작 주 단위 격자. 앞뒤 달의 날짜도 채워 항상 7의 배수 칸이 된다. */
export function buildMonthGrid(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const first = `${monthKey}-01`;
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=일
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = addDays(first, -weekday);
  const weeks = Math.ceil((weekday + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** 마감일별 그룹(날짜 키 → 할일 목록, 기본 정렬)과 마감일 없는 항목. */
export function groupByDue(tasks) {
  const byDate = new Map();
  const noDue = [];
  for (const task of sortTasks(tasks, { key: 'priority', dir: 'asc' })) {
    if (!task.due_date || !parseDateKey(task.due_date)) {
      noDue.push(task);
      continue;
    }
    if (!byDate.has(task.due_date)) byDate.set(task.due_date, []);
    byDate.get(task.due_date).push(task);
  }
  return { byDate, noDue };
}
