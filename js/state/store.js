// 화면 전체가 공유하는 상태. 구독자는 상태가 바뀔 때마다 호출된다.
const state = {
  config: null,
  members: [],
  tasks: [],
  loading: true,
  currentUser: null,
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
