// 앱 진입점: 설정 → 데이터 접근 계층 → URL 복원 → 부서원 → 작성자 식별 → 할일 목록 → 화면.
import { configureTaskApi, getAdapter, taskApi } from './api/taskApi.js';
import defaultConfig from './defaultConfig.js';
import { reloadMembers, reloadTasks } from './state/actions.js';
import { clearAll, setQuery, setView, toggleFilter } from './state/criteria.js';
import { startRealtime } from './state/realtime.js';
import { getState, setState, subscribeStore } from './state/store.js';
import { countInProgress } from './state/selectors.js';
import { buildSearch, parseUrlState } from './state/urlState.js';
import { initFilterBar } from './ui/filterBar.js';
import { ensureCurrentUser, openIdentityDialog } from './ui/identity.js';
import { memberName } from './ui/labels.js';
import { openTaskForm } from './ui/taskForm.js';
import { initThemeToggle } from './ui/themeToggle.js';
import { showError } from './ui/toast.js';
import { renderActiveView } from './views/activeView.js';
import { renderCalendarView } from './views/calendarView.js';
import { renderDashboardView } from './views/dashboardView.js';
import { renderKanbanView } from './views/kanbanView.js';
import { renderListView } from './views/listView.js';

const RENDERERS = {
  list: renderListView,
  kanban: renderKanbanView,
  calendar: renderCalendarView,
  dashboard: renderDashboardView,
  active: renderActiveView,
};

/** js/config.js(일반 스크립트)가 window.TODO_CONFIG에 둔 값을 기본값 위에 덮어쓴다. 파일이 없으면 기본값(local 어댑터)이다. */
function loadConfig() {
  return { ...defaultConfig, ...(window.TODO_CONFIG ?? {}) };
}

/** 새로고침·링크 공유 후에도 뷰와 필터가 유지되도록 URL에서 상태를 복원한다. */
function restoreFromUrl() {
  const { view, query, filters, month } = parseUrlState(location.search);
  setState({ view, query, filters, ...(month && { month }) });
}

function syncUrl() {
  const search = buildSearch(getState());
  if (search !== location.search) history.replaceState(null, '', `${location.pathname}${search}`);
}

/** WAI-ARIA 탭 패턴: 선택된 탭만 tabindex 0, 좌우 화살표·Home·End로 이동. */
function wireTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const panel = document.getElementById('view-root');
  tabs.forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
  document.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    const enabled = tabs.filter((t) => !t.disabled);
    const index = enabled.indexOf(document.activeElement);
    const next = {
      ArrowRight: enabled[(index + 1) % enabled.length],
      ArrowLeft: enabled[(index - 1 + enabled.length) % enabled.length],
      Home: enabled[0],
      End: enabled[enabled.length - 1],
    }[event.key];
    if (!next || index < 0) return;
    event.preventDefault();
    next.focus();
    setView(next.dataset.view);
  });

  return () => {
    const { view, loading } = getState();
    // 「진행 중 업무」 탭에는 전체 기간의 진행 중 건수를 함께 표시한다(검색·필터와 무관).
    const activeTab = document.getElementById('tab-active');
    const count = loading ? null : countInProgress();
    // 접근 가능한 이름은 눈에 보이는 글자(「진행 중 업무 5」)에서 그대로 나오게 한다(aria-label로 덮어쓰면 WCAG 2.5.3 위반).
    activeTab.querySelector('.tab-count').textContent = count ?? '';
    for (const tab of tabs) {
      const selected = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected) {
        tab.setAttribute('aria-current', 'page');
        panel.setAttribute('aria-labelledby', tab.id);
      } else {
        tab.removeAttribute('aria-current');
      }
    }
  };
}

function wireShell() {
  const viewRoot = document.getElementById('view-root');
  const userLabel = document.getElementById('current-user');
  const heading = document.getElementById('view-heading');
  document.getElementById('new-task').addEventListener('click', () => openTaskForm());
  document.getElementById('change-user').addEventListener('click', () => openIdentityDialog({ closable: true }));
  initThemeToggle(document.getElementById('theme-toggle'));

  const syncTabs = wireTabs();
  initFilterBar({
    panel: document.getElementById('filter-panel'),
    toggle: document.getElementById('filter-toggle'),
    searchInput: document.getElementById('search'),
    chips: document.getElementById('filter-chips'),
    count: document.getElementById('result-count'),
    content: document.getElementById('content'),
  });

  const render = () => {
    const { currentUser, view } = getState();
    userLabel.textContent = currentUser ? memberName(currentUser) : '';
    syncTabs();
    syncUrl();
    const selectedTab = document.querySelector('[role="tab"][aria-selected="true"]');
    heading.textContent = selectedTab?.dataset.title ?? selectedTab?.textContent ?? '';
    (RENDERERS[view] ?? renderListView)(viewRoot);
  };
  subscribeStore(render);
  render();
}

async function start() {
  if (window.__unsupportedBrowser) return; // js/compat.js가 안내 문구를 이미 표시했다
  const config = loadConfig();
  setState({ config });
  restoreFromUrl();
  await configureTaskApi(config);
  wireShell();

  await reloadMembers();
  await ensureCurrentUser();
  await reloadTasks();

  // 실시간 반영: 변경 구독 + 포커스 복귀 재조회 + 연결 끊김 시 폴링(PRD 6.3)
  const realtime = startRealtime({
    banner: document.getElementById('connection-status'),
    pollMs: config.pollIntervalMs ?? 30000,
  });
  if (config.adapter === 'local') {
    // 개발·테스트 전용 훅(local 어댑터일 때만): 연결 끊김을 흉내 내고, 번들 안의 모듈에 테스트가 접근할 수 있게 한다.
    window.__todoTest = {
      setConnected: (online) => getAdapter().setConnected(online),
      setPollInterval: realtime.setPollInterval,
      criteria: { setQuery, toggleFilter, clearAll },
      taskApi,
    };
  }
}

start().catch((err) => {
  console.error(err);
  setState({ loading: false });
  showError(`앱을 시작하지 못했습니다. (${err.message})`);
});
