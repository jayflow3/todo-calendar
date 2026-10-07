// 실시간 반영(PRD 6.3): 변경 구독이 기본, 포커스 복귀 시 재조회, 연결이 끊기면 폴링으로 전환한다.
import { taskApi } from '../api/taskApi.js';
import { reloadTasks } from './actions.js';

const BANNER_TEXT = '연결 끊김 — 최신이 아닐 수 있음';
const RELOAD_DEBOUNCE_MS = 50;

export function startRealtime({ banner, pollMs = 30000 }) {
  let online = true;
  let interval = pollMs;
  let pollTimer = null;
  let reloadTimer = null;

  const syncNow = () => reloadTasks();
  const scheduleReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(syncNow, RELOAD_DEBOUNCE_MS);
  };

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(syncNow, interval);
  }
  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function setOnline(next) {
    if (next === online) return;
    online = next;
    if (online) {
      stopPolling();
      banner.textContent = '';
      syncNow(); // 끊긴 동안 놓친 변경을 따라잡는다
    } else {
      banner.textContent = BANNER_TEXT;
      startPolling();
    }
  }

  taskApi.subscribe(scheduleReload, (status) => setOnline(status === 'SUBSCRIBED'));

  // 탭이 다시 보이거나 포커스를 얻으면 전체 재조회
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow();
  });
  window.addEventListener('focus', syncNow);

  return {
    setOnline,
    isOnline: () => online,
    setPollInterval(ms) {
      interval = ms;
      if (pollTimer) startPolling();
    },
  };
}
