// 화면 전체가 공유하는 상태. 구독자는 상태가 바뀔 때마다 호출된다.
import { emptyFilters } from '../domain/filters.js';
import { todayKst } from '../domain/date.js';
import { monthOf } from '../domain/calendar.js';

const state = {
  config: null,
  members: [],
  tasks: [],
  loading: true,
  remoteMarks: {}, // 다른 사람이 방금 수정한 할일 id → {by, at}
  currentUser: null,
  // 뷰·검색·필터는 하나의 전역 상태이며 뷰를 바꿔도 유지된다(PRD 5.5). URL과 동기화된다.
  view: 'list',
  query: '',
  filters: emptyFilters(),
  month: monthOf(todayKst()),
  // 리스트 정렬·페이지는 URL에 두지 않는다.
  sort: { key: 'priority', dir: 'asc' },
  page: 0,
};

const listeners = new Set();

export const getState = () => state;

export function setState(patch) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function subscribeStore(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const memberById = (id) => state.members.find((m) => m.id === id) ?? null;
