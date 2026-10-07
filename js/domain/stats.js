// 대시보드 통계(PRD 5.6). 호출자가 (검색·필터가 적용된) 목록을 넘기며, 삭제된 항목은 제외한다.
import { getUrgency } from './urgency.js';
import { addDays } from './date.js';

const INCOMPLETE = ['todo', 'in_progress'];
const HISTORY_LIMIT = 20;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {Array} tasks
 * @param {Array} members
 * @param {string} today  한국 시간 달력일 'YYYY-MM-DD'
 * @param {{overloadThreshold?: number}} options
 */
export function computeStats(tasks, members, today, { overloadThreshold = 8 } = {}) {
  const live = tasks.filter((t) => !t.deleted_at);
  const incomplete = live.filter((t) => INCOMPLETE.includes(t.status));

  // M1 상태별 건수
  const counts = { todo: 0, in_progress: 0, done: 0 };
  for (const t of live) counts[t.status] += 1;

  // M2 완료율: 전체가 0건이면 null(화면에서 「–」)
  const completionRate = live.length ? round1((counts.done / live.length) * 100) : null;

  // M3 담당자별 미완료 건수(미배정은 별도 행), 내림차순
  const load = new Map();
  for (const t of incomplete) load.set(t.assignee_id ?? null, (load.get(t.assignee_id ?? null) ?? 0) + 1);
  const nameOf = new Map(members.map((m) => [m.id, m]));
  const workload = [...load.entries()]
    .map(([id, count]) => ({
      assigneeId: id,
      member: id ? nameOf.get(id) ?? null : null,
      count,
      overload: count >= overloadThreshold,
    }))
    .sort((a, b) => b.count - a.count || (a.assigneeId === null) - (b.assigneeId === null));

  // M4 마감 임박(D-3~D-day), M5 지연(D+n). 둘 다 미완료만 대상이다.
  let soon = 0;
  let overdue = 0;
  for (const t of incomplete) {
    const u = getUrgency(t, today);
    if (u?.kind === 'soon') soon += 1;
    else if (u?.kind === 'overdue') overdue += 1;
  }
  const overdueRate = incomplete.length ? round1((overdue / incomplete.length) * 100) : null;

  // M6 완료 이력(completed_at 최신순 20건)과 최근 7일 완료 건수.
  // 최근 7일 = 오늘 포함 7일(오늘−6일 ~ 오늘, 한국 시간 달력일).
  const completed = live.filter((t) => t.status === 'done' && t.completed_at);
  const history = [...completed].sort((a, b) => (a.completed_at < b.completed_at ? 1 : -1)).slice(0, HISTORY_LIMIT);
  const since = addDays(today, -6);
  const keyOf = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(iso));
  const completedLast7Days = completed.filter((t) => keyOf(t.completed_at) >= since).length;

  return {
    total: live.length,
    incompleteCount: incomplete.length,
    counts,
    completionRate,
    workload,
    soon,
    overdue,
    overdueRate,
    history,
    completedLast7Days,
  };
}
