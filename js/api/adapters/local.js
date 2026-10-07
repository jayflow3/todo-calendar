// localStorage 기반 어댑터. DB 트리거 동작(updated_at, completed_at, task_events)을 코드로 흉내 낸다.
// 키 없이 화면·로직을 개발·검증하기 위한 용도이며 팀 공유는 되지 않는다.
import { newId } from '../../domain/uuid.js';
import { validateComment, validateMember, validateTask } from '../../domain/validation.js';
import { ApiError } from '../errors.js';
import { buildSeed } from './seed.js';

const STORAGE_KEY = 'todo.local.db.v1';
const TASK_WRITABLE = [
  'title', 'description', 'status', 'priority', 'assignee_id',
  'category', 'due_date', 'updated_by', 'deleted_at',
];
const EVENT_FIELDS = ['status', 'assignee_id', 'due_date', 'priority'];

export function createLocalAdapter({ storage = globalThis.localStorage, now = () => new Date() } = {}) {
  const listeners = new Set();
  const statusListeners = new Set();
  let connected = true; // false면 변경 알림을 전달하지 않는다(연결 끊김 시뮬레이션)
  const clone = (v) => structuredClone(v);

  function load() {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const seeded = buildSeed(newId, now());
    storage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  const save = (db) => storage.setItem(STORAGE_KEY, JSON.stringify(db));
  const emit = (change) => connected && listeners.forEach((fn) => fn(change));

  // 다른 탭의 변경은 storage 이벤트로 받는다.
  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) emit({ table: 'tasks', type: 'refresh', remote: true });
    });
  }

  const newestFirst = (a, b) => (a.created_at < b.created_at ? 1 : -1);
  const oldestFirst = (a, b) => (a.created_at < b.created_at ? -1 : 1);

  return {
    async listTasks() {
      return clone(load().tasks.filter((t) => !t.deleted_at).sort(newestFirst));
    },

    async createTask(input) {
      const clean = validateTask(input);
      const db = load();
      const stamp = now().toISOString();
      const status = clean.status ?? 'todo';
      const task = {
        id: newId(),
        title: clean.title,
        description: clean.description ?? null,
        status,
        priority: clean.priority ?? 'medium',
        assignee_id: clean.assignee_id ?? null,
        category: clean.category ?? '기타',
        due_date: clean.due_date ?? null,
        completed_at: status === 'done' ? stamp : null,
        created_by: input.created_by,
        updated_by: input.created_by,
        created_at: stamp,
        updated_at: stamp,
        deleted_at: null,
      };
      db.tasks.push(task);
      save(db);
      emit({ table: 'tasks', type: 'INSERT', record: clone(task) });
      return clone(task);
    },

    /**
     * 바뀐 필드만 받아 병합한다. opts.expectedUpdatedAt이 있고 서버 값과 다르면 CONFLICT.
     * 삭제된 항목은 deleted_at을 되돌리는 경우가 아니면 DELETED.
     */
    async updateTask(id, changes, opts = {}) {
      const db = load();
      const task = db.tasks.find((t) => t.id === id);
      if (!task) throw new ApiError('NOT_FOUND', '항목을 찾을 수 없습니다');
      if (task.deleted_at && !('deleted_at' in changes)) {
        throw new ApiError('DELETED', '이미 삭제된 항목입니다', { current: clone(task) });
      }
      if (opts.expectedUpdatedAt && opts.expectedUpdatedAt !== task.updated_at) {
        throw new ApiError('CONFLICT', '다른 사람이 먼저 수정했습니다', { current: clone(task) });
      }

      const patch = {};
      for (const key of TASK_WRITABLE) if (key in changes) patch[key] = changes[key];
      const clean = validateTask(patch, { partial: true });
      const before = clone(task);

      Object.assign(task, clean);
      // 서버 관리 필드(DB 트리거에 대응)
      task.updated_at = now().toISOString();
      if (task.status === 'done') {
        task.completed_at = before.status === 'done' ? before.completed_at : task.updated_at;
      } else {
        task.completed_at = null;
      }

      for (const field of EVENT_FIELDS) {
        if (task[field] !== before[field]) {
          db.events.push({
            id: newId(),
            task_id: id,
            actor_id: task.updated_by,
            field,
            from_value: before[field] == null ? null : String(before[field]),
            to_value: task[field] == null ? null : String(task[field]),
            created_at: task.updated_at,
          });
        }
      }
      save(db);
      emit({ table: 'tasks', type: 'UPDATE', record: clone(task) });
      return clone(task);
    },

    async softDeleteTask(id, { updatedBy } = {}) {
      return this.updateTask(id, { deleted_at: now().toISOString(), ...(updatedBy && { updated_by: updatedBy }) });
    },

    async restoreTask(id, { updatedBy } = {}) {
      return this.updateTask(id, { deleted_at: null, ...(updatedBy && { updated_by: updatedBy }) });
    },

    async listComments(taskId) {
      return clone(load().comments.filter((c) => c.task_id === taskId).sort(oldestFirst));
    },

    async addComment({ task_id, author_id, body }) {
      const text = validateComment(body);
      const db = load();
      if (!db.tasks.some((t) => t.id === task_id)) throw new ApiError('NOT_FOUND', '항목을 찾을 수 없습니다');
      const comment = { id: newId(), task_id, author_id, body: text, created_at: now().toISOString() };
      db.comments.push(comment);
      save(db);
      emit({ table: 'comments', type: 'INSERT', record: clone(comment) });
      return clone(comment);
    },

    async listMembers() {
      return clone(load().members);
    },

    async addMember(input) {
      const clean = validateMember(input);
      const db = load();
      const member = { id: newId(), ...clean, active: true, created_at: now().toISOString() };
      db.members.push(member);
      save(db);
      return clone(member);
    },

    async listEvents(taskId) {
      return clone(load().events.filter((e) => e.task_id === taskId).sort(oldestFirst));
    },

    /** onStatus(status): 'SUBSCRIBED' | 'CLOSED' — supabase 어댑터와 같은 값을 쓴다. */
    subscribe(onChange, onStatus) {
      listeners.add(onChange);
      if (onStatus) {
        statusListeners.add(onStatus);
        onStatus(connected ? 'SUBSCRIBED' : 'CLOSED');
      }
      return () => {
        listeners.delete(onChange);
        statusListeners.delete(onStatus);
      };
    },

    /** 개발·테스트용: 실시간 연결이 끊기거나 복구된 상황을 흉내 낸다. */
    setConnected(next) {
      connected = next;
      statusListeners.forEach((fn) => fn(next ? 'SUBSCRIBED' : 'CLOSED'));
    },
  };
}
