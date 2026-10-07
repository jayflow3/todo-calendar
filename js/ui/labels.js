import { h } from './dom.js';

export const STATUS_LABEL = { todo: '할 일', in_progress: '진행 중', done: '완료' };
export const PRIORITY_LABEL = { high: '높음', medium: '보통', low: '낮음' };

/** 동명이인은 라벨을 붙여 「이름(라벨)」로 표시한다. */
export function memberName(member) {
  if (!member) return '';
  return member.label ? `${member.name}(${member.label})` : member.name;
}

const dateTimeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDateTime(iso) {
  return iso ? dateTimeFormat.format(new Date(iso)) : '';
}

export const statusBadge = (status) =>
  h('span', { class: `badge badge--status-${status}` }, STATUS_LABEL[status]);

export const priorityBadge = (priority) =>
  h('span', { class: `badge badge--priority-${priority}` }, PRIORITY_LABEL[priority]);

/** 색에만 의존하지 않도록 D-n 텍스트와 스크린리더용 설명을 함께 넣는다. */
export function urgencyBadge(urgency) {
  if (!urgency) return null;
  return h(
    'span',
    { class: `badge badge--urgent-${urgency.kind}` },
    h('span', { class: 'visually-hidden' }, urgency.kind === 'soon' ? '마감 임박 ' : '마감 지연 '),
    urgency.label,
  );
}
