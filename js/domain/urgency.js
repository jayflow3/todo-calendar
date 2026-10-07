// 긴급 배지 규칙(PRD 5.4): 미완료이고 마감일이 있는 항목만. 기준은 한국 시간 달력일.
import { diffDays } from './date.js';

/** @returns {null | {kind: 'soon' | 'overdue', label: string, days: number}} */
export function getUrgency(task, today) {
  if (!task.due_date || task.status === 'done') return null;
  const days = diffDays(task.due_date, today); // D
  if (days < 0) return { kind: 'overdue', label: `D+${-days}`, days };
  if (days <= 3) return { kind: 'soon', label: days === 0 ? 'D-day' : `D-${days}`, days };
  return null;
}
