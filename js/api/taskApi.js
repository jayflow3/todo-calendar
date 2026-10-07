// 데이터 접근 계층. 화면 코드는 DB 클라이언트를 직접 부르지 않고 이 모듈만 사용한다.
// 어댑터(local | supabase)는 같은 인터페이스를 구현하므로 저장소를 바꿔도 화면 코드는 그대로다.
import { ApiError } from './errors.js';

export { ApiError };

let adapter = null;
let actorId = null;

function need() {
  if (!adapter) throw new Error('taskApi가 초기화되지 않았습니다. configureTaskApi(config)를 먼저 호출하세요');
  return adapter;
}

/** config.adapter에 따라 어댑터를 불러와 연결한다. */
export async function configureTaskApi(config) {
  if (config.adapter === 'supabase') {
    const { createSupabaseAdapter } = await import('./adapters/supabase.js');
    adapter = await createSupabaseAdapter(config);
  } else {
    const { createLocalAdapter } = await import('./adapters/local.js');
    adapter = createLocalAdapter();
  }
  return taskApi;
}

/** 테스트에서 어댑터를 직접 주입한다. */
export function useAdapter(custom) {
  adapter = custom;
  return taskApi;
}

function requireActor() {
  if (!actorId) throw new Error('현재 사용자가 선택되지 않았습니다. setActor(memberId)를 먼저 호출하세요');
  return actorId;
}

/** 어댑터 자체(개발·테스트용 훅 접근에만 쓴다). */
export const getAdapter = () => adapter;

export const taskApi = {
  /** 이후 작성·수정·댓글에 자동으로 쓰이는 members.id (created_by / updated_by / author_id). */
  setActor(memberId) {
    actorId = memberId;
  },

  listTasks: () => need().listTasks(),
  createTask: (input) => need().createTask({ ...input, created_by: requireActor() }),
  /** changes에는 바뀐 필드만 담는다. opts.expectedUpdatedAt이 있으면 서버 값과 다를 때 CONFLICT. */
  updateTask: (id, changes, opts) => need().updateTask(id, { ...changes, updated_by: requireActor() }, opts),
  softDeleteTask: (id) => need().softDeleteTask(id, { updatedBy: requireActor() }),
  restoreTask: (id) => need().restoreTask(id, { updatedBy: requireActor() }),

  listComments: (taskId) => need().listComments(taskId),
  addComment: (taskId, body) => need().addComment({ task_id: taskId, author_id: requireActor(), body }),

  listMembers: () => need().listMembers(),
  addMember: (input) => need().addMember(input),

  listEvents: (taskId) => need().listEvents(taskId),

  /** 변경 구독. 해제 함수를 반환한다. */
  subscribe: (onChange, onStatus) => need().subscribe(onChange, onStatus),
};
