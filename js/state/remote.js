// 다른 사람이 바꾼 내용을 알리는 부분(PRD 6.3): 카드 표시 + 알림(aria-live 토스트).
import { findRemoteChanges } from '../domain/diff.js';
import { getState, memberById, setState } from './store.js';
import { memberName, PRIORITY_LABEL, STATUS_LABEL } from '../ui/labels.js';
import { eulReul, euro } from '../ui/korean.js';
import { showToast } from '../ui/toast.js';

export const FIELD_LABEL = {
  title: '제목', description: '설명', status: '상태', priority: '우선순위',
  assignee_id: '담당자', category: '카테고리', due_date: '마감일',
};
const MARK_MS = 15000;

export function formatFieldValue(field, value) {
  if (value == null || value === '') return '없음';
  if (field === 'status') return STATUS_LABEL[value] ?? value;
  if (field === 'priority') return PRIORITY_LABEL[value] ?? value;
  if (field === 'assignee_id') return memberName(memberById(value)) || '알 수 없음';
  if (field === 'description') return '(내용 수정)';
  return value;
}

/** 「○○님이 [필드]를 [값]으로 변경했습니다」 */
export function describeChange(byName, { field, to }) {
  return `${byName}님이 ${eulReul(FIELD_LABEL[field])} ${euro(formatFieldValue(field, to))} 변경했습니다`;
}

/** 새로 받은 목록을 이전 목록과 비교해, 다른 사람의 변경을 표시하고 알린다. */
export function announceRemoteChanges(previous, next) {
  const { currentUser } = getState();
  if (!currentUser || !previous.length) return;
  const changes = findRemoteChanges(previous, next, currentUser.id);
  if (!changes.length) return;

  const marks = { ...getState().remoteMarks };
  for (const { task, by, fields } of changes) {
    const byName = memberName(memberById(by)) || '다른 사람';
    marks[task.id] = { by: byName, at: Date.now() };
    const extra = fields.length > 1 ? ` 외 ${fields.length - 1}건` : '';
    showToast({ message: `${describeChange(byName, fields[0])}${extra} (${task.title})`, timeout: 8000 });
    setTimeout(() => {
      const current = getState().remoteMarks[task.id];
      if (current && Date.now() - current.at >= MARK_MS - 50) {
        const { [task.id]: _gone, ...rest } = getState().remoteMarks;
        setState({ remoteMarks: rest });
      }
    }, MARK_MS);
  }
  setState({ remoteMarks: marks });
}
