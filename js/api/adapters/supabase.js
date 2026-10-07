// Supabase(Postgres + Realtime) 어댑터. 클라이언트에는 anon key만 사용한다.
// supabase-js는 vendor/supabase-js.umd.js를 <script>로 불러온다(외부 CDN 사용 금지).
import { validateComment, validateMember, validateTask } from '../../domain/validation.js';
import { ApiError } from '../errors.js';

const TASK_WRITABLE = [
  'title', 'description', 'status', 'priority', 'assignee_id',
  'category', 'due_date', 'updated_by', 'deleted_at',
];

function loadVendorScript(src) {
  if (globalThis.supabase?.createClient) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new ApiError('NETWORK', `${src}를 불러오지 못했습니다`));
    document.head.append(script);
  });
}

function unwrap({ data, error }) {
  if (error) throw new ApiError('NETWORK', error.message, { cause: error });
  return data;
}

export async function createSupabaseAdapter({ supabaseUrl, supabaseAnonKey, vendorPath = './vendor/supabase-js.umd.js' }) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('supabaseUrl과 supabaseAnonKey(anon key)를 js/config.js에 설정하세요');
  }
  await loadVendorScript(vendorPath);
  const client = globalThis.supabase.createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async listTasks() {
      return unwrap(await client.from('tasks').select('*').is('deleted_at', null).order('created_at', { ascending: false }));
    },

    async createTask(input) {
      const clean = validateTask(input);
      const row = {
        title: clean.title,
        description: clean.description ?? null,
        status: clean.status ?? 'todo',
        priority: clean.priority ?? 'medium',
        assignee_id: clean.assignee_id ?? null,
        category: clean.category ?? '기타',
        due_date: clean.due_date ?? null,
        created_by: input.created_by,
        updated_by: input.created_by,
      };
      return unwrap(await client.from('tasks').insert(row).select().single());
    },

    /** 바뀐 필드만 PATCH한다. updated_at·completed_at은 DB 트리거가 정한다. */
    async updateTask(id, changes, opts = {}) {
      const patch = {};
      for (const key of TASK_WRITABLE) if (key in changes) patch[key] = changes[key];
      const clean = validateTask(patch, { partial: true });

      let query = client.from('tasks').update(clean).eq('id', id);
      if (!('deleted_at' in changes)) query = query.is('deleted_at', null);
      if (opts.expectedUpdatedAt) query = query.eq('updated_at', opts.expectedUpdatedAt);

      const rows = unwrap(await query.select());
      if (rows.length) return rows[0];

      // 0행 갱신: 원인을 구분한다.
      const current = unwrap(await client.from('tasks').select('*').eq('id', id).maybeSingle());
      if (!current) throw new ApiError('NOT_FOUND', '항목을 찾을 수 없습니다');
      if (current.deleted_at && !('deleted_at' in changes)) {
        throw new ApiError('DELETED', '이미 삭제된 항목입니다', { current });
      }
      throw new ApiError('CONFLICT', '다른 사람이 먼저 수정했습니다', { current });
    },

    async softDeleteTask(id, { updatedBy } = {}) {
      return this.updateTask(id, { deleted_at: new Date().toISOString(), ...(updatedBy && { updated_by: updatedBy }) });
    },

    async restoreTask(id, { updatedBy } = {}) {
      return this.updateTask(id, { deleted_at: null, ...(updatedBy && { updated_by: updatedBy }) });
    },

    async listComments(taskId) {
      return unwrap(await client.from('comments').select('*').eq('task_id', taskId).order('created_at'));
    },

    async addComment({ task_id, author_id, body }) {
      const text = validateComment(body);
      return unwrap(await client.from('comments').insert({ task_id, author_id, body: text }).select().single());
    },

    async listMembers() {
      return unwrap(await client.from('members').select('*').order('created_at'));
    },

    async addMember(input) {
      const clean = validateMember(input);
      return unwrap(await client.from('members').insert(clean).select().single());
    },

    async listEvents(taskId) {
      return unwrap(await client.from('task_events').select('*').eq('task_id', taskId).order('created_at'));
    },

    /** onStatus(status): 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' */
    subscribe(onChange, onStatus) {
      const channel = client.channel('todo-changes');
      for (const table of ['tasks', 'comments']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          onChange({ table, type: payload.eventType, record: payload.new });
        });
      }
      channel.subscribe((status) => onStatus?.(status));
      return () => client.removeChannel(channel);
    },
  };
}
