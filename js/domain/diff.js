// 다른 사람의 변경 감지(PRD 6.3). 이전·이후 목록을 비교해 「누가 어떤 필드를 바꿨는지」를 구한다.
export const TRACKED_FIELDS = ['title', 'description', 'status', 'priority', 'assignee_id', 'category', 'due_date'];

const sameValue = (a, b) => (a ?? null) === (b ?? null);

/** 두 레코드에서 값이 다른 추적 필드 목록. */
export function changedFields(before, after) {
  return TRACKED_FIELDS.filter((f) => !sameValue(before[f], after[f])).map((field) => ({
    field,
    from: before[field] ?? null,
    to: after[field] ?? null,
  }));
}

/**
 * 내가 아닌 사람이 바꾼 할일만 골라낸다.
 * @returns {Array<{task: object, by: string, fields: Array}>}
 */
export function findRemoteChanges(previous, next, myId) {
  const before = new Map(previous.map((t) => [t.id, t]));
  const changes = [];
  for (const task of next) {
    const old = before.get(task.id);
    if (!old || old.updated_at === task.updated_at) continue;
    if (task.updated_by === myId) continue;
    const fields = changedFields(old, task);
    if (fields.length) changes.push({ task, by: task.updated_by, fields });
  }
  return changes;
}

/** 같은 필드를 내가 바꾸는 동안 다른 사람도 바꿨는지(진짜 충돌) 판단한다. */
export function conflictingFields(openedWith, current, myChanges) {
  return Object.keys(myChanges).filter((f) => TRACKED_FIELDS.includes(f) && !sameValue(openedWith[f], current[f]));
}
