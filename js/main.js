// 앱 진입점: 설정 → 데이터 접근 계층 → 부서원 → 작성자 식별 → 할일 목록 → 화면.
import { configureTaskApi, taskApi } from './api/taskApi.js';
import { reloadMembers, reloadTasks } from './state/actions.js';
import { getState, setState, subscribeStore } from './state/store.js';
import { openIdentityDialog, ensureCurrentUser } from './ui/identity.js';
import { memberName } from './ui/labels.js';
import { openTaskForm } from './ui/taskForm.js';
import { showError } from './ui/toast.js';
import { renderListView } from './views/listView.js';

async function loadConfig() {
  try {
    return (await import('./config.js')).default;
  } catch {
    // js/config.js가 없으면 예시 설정(local 어댑터)으로 동작한다.
    return (await import('./config.example.js')).default;
  }
}

function wireShell() {
  const viewRoot = document.getElementById('view-root');
  const userLabel = document.getElementById('current-user');
  document.getElementById('new-task').addEventListener('click', () => openTaskForm());
  document.getElementById('change-user').addEventListener('click', () => openIdentityDialog({ closable: true }));

  subscribeStore(() => {
    const { currentUser } = getState();
    userLabel.textContent = currentUser ? memberName(currentUser) : '';
    renderListView(viewRoot);
  });
  renderListView(viewRoot);
}

async function start() {
  const config = await loadConfig();
  setState({ config });
  await configureTaskApi(config);
  wireShell();

  await reloadMembers();
  await ensureCurrentUser();
  await reloadTasks();

  // 같은 어댑터에서 오는 변경(다른 탭 포함)을 반영한다. 실시간 처리 강화는 단계 4.
  taskApi.subscribe((change) => {
    if (change.remote) reloadTasks();
  });
}

start().catch((err) => {
  console.error(err);
  setState({ loading: false });
  showError(`앱을 시작하지 못했습니다. (${err.message})`);
});
