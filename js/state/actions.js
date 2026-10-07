// 화면에서 쓰는 데이터 동작. taskApi만 호출하고 결과를 store에 반영한다.
import { taskApi } from '../api/taskApi.js';
import { showError, showToast } from '../ui/toast.js';
import { getState, setState } from './store.js';

export async function reloadTasks() {
  try {
    setState({ tasks: await taskApi.listTasks(), loading: false });
  } catch (err) {
    setState({ loading: false });
    showError(`목록을 불러오지 못했습니다. 잠시 후 다시 시도하세요. (${err.message})`);
  }
}

export async function reloadMembers() {
  setState({ members: await taskApi.listMembers() });
}

/**
 * 상태 변경. 서버 응답 전에 화면에 먼저 반영하고(낙관적 업데이트), 실패하면 원래대로 되돌린 뒤 오류를 알린다.
 * 어느 경로(드래그·메뉴·상세)에서 부르든 같은 동작이다.
 */
export async function changeStatus(task, status) {
  if (task.status === status) return;
  const before = getState().tasks;
  setState({
    tasks: before.map((t) =>
      t.id === task.id
        ? { ...t, status, completed_at: status === 'done' ? (t.completed_at ?? new Date().toISOString()) : null }
        : t,
    ),
  });
  try {
    await taskApi.updateTask(task.id, { status }, { expectedUpdatedAt: task.updated_at });
  } catch (err) {
    setState({ tasks: before });
    showError(
      err.code === 'CONFLICT' ? '다른 사람이 먼저 수정했습니다. 최신 상태를 불러옵니다.'
      : err.code === 'DELETED' ? '이미 삭제된 항목입니다.'
      : `상태를 바꾸지 못했습니다. 다시 시도하세요. (${err.message})`,
    );
  }
  await reloadTasks();
}

/** 소프트 삭제 후 5초간 되돌리기를 제공한다. */
export async function deleteTask(task) {
  try {
    await taskApi.softDeleteTask(task.id);
  } catch (err) {
    showError(err.message);
    return false;
  }
  await reloadTasks();
  showToast({
    message: `「${task.title}」을(를) 삭제했습니다`,
    actionLabel: '되돌리기',
    timeout: 5000,
    onAction: async () => {
      try {
        await taskApi.restoreTask(task.id);
      } catch (err) {
        showError(err.message);
      }
      await reloadTasks();
    },
  });
  return true;
}

export const activeMembers = () => getState().members.filter((m) => m.active);
