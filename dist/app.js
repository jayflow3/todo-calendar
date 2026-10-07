/* 자동 생성 파일 — 직접 고치지 말고 소스(js/)를 고친 뒤 npm run build 를 실행하세요. */
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/api/errors.js
  var ApiError;
  var init_errors = __esm({
    "js/api/errors.js"() {
      ApiError = class extends Error {
        /**
         * code: 'CONFLICT'(다른 사람이 먼저 수정) | 'DELETED'(이미 삭제됨) | 'NOT_FOUND' | 'NETWORK'
         * extra.current: 서버의 최신 레코드(알 수 있을 때)
         */
        constructor(code, message, extra = {}) {
          super(message);
          this.name = "ApiError";
          this.code = code;
          Object.assign(this, extra);
        }
      };
    }
  });

  // js/domain/date.js
  function todayKst(now = /* @__PURE__ */ new Date()) {
    return kstFormatter.format(now);
  }
  function parseDateKey(key) {
    const match = KEY_PATTERN.exec(key ?? "");
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const probe = new Date(Date.UTC(year, month - 1, day));
    const valid = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
    return valid ? { year, month, day } : null;
  }
  function diffDays(a, b) {
    const pa = parseDateKey(a);
    const pb = parseDateKey(b);
    if (!pa || !pb) throw new RangeError(`잘못된 날짜: ${a}, ${b}`);
    const ms = Date.UTC(pa.year, pa.month - 1, pa.day) - Date.UTC(pb.year, pb.month - 1, pb.day);
    return Math.round(ms / 864e5);
  }
  function addDays(key, days) {
    const p = parseDateKey(key);
    if (!p) throw new RangeError(`잘못된 날짜: ${key}`);
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
    return d.toISOString().slice(0, 10);
  }
  var KEY_PATTERN, kstFormatter;
  var init_date = __esm({
    "js/domain/date.js"() {
      KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
      kstFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });
    }
  });

  // js/domain/validation.js
  function checkLength(errors, field2, value, min, max, label) {
    const len = [...value].length;
    if (len < min) errors[field2] = `${label}을(를) 입력하세요`;
    else if (len > max) errors[field2] = `${label}은(는) ${max}자 이하로 입력하세요`;
  }
  function validateTask(input, { partial = false } = {}) {
    const errors = {};
    const out = { ...input };
    if (!partial || "title" in input) {
      out.title = String(input.title ?? "").trim();
      checkLength(errors, "title", out.title, 1, 100, "제목");
    }
    if ("description" in input) {
      out.description = input.description == null ? null : String(input.description).trim() || null;
      if (out.description && [...out.description].length > 2e3) {
        errors.description = "설명은 2000자 이하로 입력하세요";
      }
    }
    if ("status" in input && !STATUSES.includes(input.status)) errors.status = "상태 값이 올바르지 않습니다";
    if ("priority" in input && !PRIORITIES.includes(input.priority)) errors.priority = "우선순위 값이 올바르지 않습니다";
    if ("due_date" in input && input.due_date != null && !parseDateKey(input.due_date)) {
      errors.due_date = "마감일은 YYYY-MM-DD 형식이어야 합니다";
    }
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return out;
  }
  function validateComment(body) {
    const text = String(body ?? "").trim();
    const errors = {};
    checkLength(errors, "body", text, 1, 1e3, "댓글");
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return text;
  }
  function validateMember({ name, label }) {
    const errors = {};
    const out = { name: String(name ?? "").trim(), label: label ? String(label).trim() || null : null };
    checkLength(errors, "name", out.name, 1, 20, "이름");
    if (out.label && [...out.label].length > 10) errors.label = "라벨은 10자 이하로 입력하세요";
    if (Object.keys(errors).length) throw new ValidationError(errors);
    return out;
  }
  var STATUSES, PRIORITIES, ValidationError;
  var init_validation = __esm({
    "js/domain/validation.js"() {
      init_date();
      STATUSES = ["todo", "in_progress", "done"];
      PRIORITIES = ["high", "medium", "low"];
      ValidationError = class extends Error {
        constructor(errors) {
          super("입력값이 올바르지 않습니다");
          this.name = "ValidationError";
          this.code = "VALIDATION";
          this.errors = errors;
        }
      };
    }
  });

  // js/api/adapters/supabase.js
  var supabase_exports = {};
  __export(supabase_exports, {
    createSupabaseAdapter: () => createSupabaseAdapter
  });
  function loadVendorScript(src) {
    if (globalThis.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new ApiError("NETWORK", `${src}를 불러오지 못했습니다`));
      document.head.append(script);
    });
  }
  function unwrap({ data, error }) {
    if (error) throw new ApiError("NETWORK", error.message, { cause: error });
    return data;
  }
  async function createSupabaseAdapter({ supabaseUrl, supabaseAnonKey, vendorPath = "./vendor/supabase-js.umd.js" }) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("supabaseUrl과 supabaseAnonKey(anon key)를 js/config.js에 설정하세요");
    }
    await loadVendorScript(vendorPath);
    const client = globalThis.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return {
      async listTasks() {
        return unwrap(await client.from("tasks").select("*").is("deleted_at", null).order("created_at", { ascending: false }));
      },
      async createTask(input) {
        const clean = validateTask(input);
        const row2 = {
          title: clean.title,
          description: clean.description ?? null,
          status: clean.status ?? "todo",
          priority: clean.priority ?? "medium",
          assignee_id: clean.assignee_id ?? null,
          category: clean.category ?? "기타",
          due_date: clean.due_date ?? null,
          created_by: input.created_by,
          updated_by: input.created_by
        };
        return unwrap(await client.from("tasks").insert(row2).select().single());
      },
      /** 바뀐 필드만 PATCH한다. updated_at·completed_at은 DB 트리거가 정한다. */
      async updateTask(id, changes, opts = {}) {
        const patch = {};
        for (const key of TASK_WRITABLE) if (key in changes) patch[key] = changes[key];
        const clean = validateTask(patch, { partial: true });
        let query = client.from("tasks").update(clean).eq("id", id);
        if (!("deleted_at" in changes)) query = query.is("deleted_at", null);
        if (opts.expectedUpdatedAt) query = query.eq("updated_at", opts.expectedUpdatedAt);
        const rows = unwrap(await query.select());
        if (rows.length) return rows[0];
        const current = unwrap(await client.from("tasks").select("*").eq("id", id).maybeSingle());
        if (!current) throw new ApiError("NOT_FOUND", "항목을 찾을 수 없습니다");
        if (current.deleted_at && !("deleted_at" in changes)) {
          throw new ApiError("DELETED", "이미 삭제된 항목입니다", { current });
        }
        throw new ApiError("CONFLICT", "다른 사람이 먼저 수정했습니다", { current });
      },
      async softDeleteTask(id, { updatedBy } = {}) {
        return this.updateTask(id, { deleted_at: (/* @__PURE__ */ new Date()).toISOString(), ...updatedBy && { updated_by: updatedBy } });
      },
      async restoreTask(id, { updatedBy } = {}) {
        return this.updateTask(id, { deleted_at: null, ...updatedBy && { updated_by: updatedBy } });
      },
      async listComments(taskId) {
        return unwrap(await client.from("comments").select("*").eq("task_id", taskId).order("created_at"));
      },
      async addComment({ task_id, author_id, body }) {
        const text = validateComment(body);
        return unwrap(await client.from("comments").insert({ task_id, author_id, body: text }).select().single());
      },
      async listMembers() {
        return unwrap(await client.from("members").select("*").order("created_at"));
      },
      async addMember(input) {
        const clean = validateMember(input);
        return unwrap(await client.from("members").insert(clean).select().single());
      },
      async listEvents(taskId) {
        return unwrap(await client.from("task_events").select("*").eq("task_id", taskId).order("created_at"));
      },
      /** onStatus(status): 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' */
      subscribe(onChange, onStatus) {
        const channel = client.channel("todo-changes");
        for (const table of ["tasks", "comments"]) {
          channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
            onChange({ table, type: payload.eventType, record: payload.new });
          });
        }
        channel.subscribe((status) => onStatus?.(status));
        return () => client.removeChannel(channel);
      }
    };
  }
  var TASK_WRITABLE;
  var init_supabase = __esm({
    "js/api/adapters/supabase.js"() {
      init_validation();
      init_errors();
      TASK_WRITABLE = [
        "title",
        "description",
        "status",
        "priority",
        "assignee_id",
        "category",
        "due_date",
        "updated_by",
        "deleted_at"
      ];
    }
  });

  // js/domain/uuid.js
  function newId() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    const h2 = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h2.slice(0, 8)}-${h2.slice(8, 12)}-${h2.slice(12, 16)}-${h2.slice(16, 20)}-${h2.slice(20)}`;
  }
  var init_uuid = __esm({
    "js/domain/uuid.js"() {
    }
  });

  // js/api/adapters/seed.js
  function buildSeed(newId2, now = /* @__PURE__ */ new Date()) {
    const today = todayKst(now);
    const iso = now.toISOString();
    const members = ["김민준", "이서연", "박지호", "최유나", "정도윤", "한지우"].map((name) => ({
      id: newId2(),
      name,
      label: null,
      active: true,
      created_at: iso
    }));
    const [m1, m2, m3, m4, m5, m6] = members.map((m) => m.id);
    const rows = [
      ["분기 업무 계획서 작성", "in_progress", "high", m1, "기획", 3],
      ["신규 기능 API 설계", "todo", "high", m2, "개발", 4],
      ["메인 화면 시안 검토", "todo", "medium", m3, "디자인", 0],
      ["서버 로그 정리", "in_progress", "low", m4, "운영", -1],
      ["주간 회의 자료 준비", "todo", "medium", m1, "기획", 1],
      ["로그인 오류 수정", "done", "high", m2, "개발", -3],
      ["아이콘 세트 교체", "todo", "low", m3, "디자인", 10],
      ["백업 점검", "in_progress", "medium", m5, "운영", 2],
      ["사용자 인터뷰 정리", "done", "medium", m6, "기획", -5],
      ["성능 측정 스크립트", "todo", "medium", null, "개발", null],
      ["비품 구매 요청", "todo", "low", m4, "기타", -2],
      ["신입 온보딩 문서", "in_progress", "medium", m6, "기타", 7],
      ["고객 문의 응대 매뉴얼 정리", "in_progress", "medium", m5, "운영", 5, "자주 오는 문의 20건을 유형별로 묶고 답변 예시를 붙인다."],
      ["신규 입사자 계정 발급", "todo", "high", m4, "운영", 1, "메신저·공유 드라이브·그룹웨어 계정. 입사일 전날까지."],
      ["모바일 화면 점검", "todo", "medium", m3, "디자인", 6, "375px 기준으로 목록·칸반·캘린더 레이아웃 확인."],
      ["월간 보고서 초안 작성", "in_progress", "high", m1, "기획", -2, "지난달 완료율과 지연 사유 정리."],
      ["로그 모니터링 알림 설정", "done", "medium", m4, "운영", -4],
      ["접근성 점검 항목 정리", "done", "low", m6, "기타", -1],
      ["데이터 백업 절차 문서화", "todo", "high", m5, "운영", 3, "주 1회 백업과 복원 연습 절차를 문서로 남긴다."],
      ["디자인 시스템 컬러 검토", "in_progress", "medium", m3, "디자인", 8]
    ];
    const tasks = rows.map(([title, status, priority, assignee, category, offset, description], i) => {
      const created = new Date(now.getTime() - (rows.length - i) * 36e5).toISOString();
      return {
        id: newId2(),
        title,
        description: description ?? null,
        status,
        priority,
        assignee_id: assignee,
        category,
        due_date: offset === null ? null : addDays(today, offset),
        completed_at: status === "done" ? created : null,
        created_by: m1,
        updated_by: m1,
        created_at: created,
        updated_at: created,
        deleted_at: null
      };
    });
    const byTitle = (title) => tasks.find((t) => t.title === title).id;
    const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 6e4).toISOString();
    const comments = [
      { task_id: byTitle("분기 업무 계획서 작성"), author_id: m2, body: "개발 일정은 2주 단위로 나눠서 적어 주세요.", created_at: at(95) },
      { task_id: byTitle("분기 업무 계획서 작성"), author_id: m1, body: "네, 오늘 오후까지 반영해서 공유하겠습니다.", created_at: at(70) },
      { task_id: byTitle("로그인 오류 수정"), author_id: m2, body: "원인은 세션 만료 처리였고 수정 후 확인했습니다.", created_at: at(300) },
      { task_id: byTitle("백업 점검"), author_id: m5, body: "복원 테스트까지 해 봐야 해서 마감을 이틀 잡았습니다.", created_at: at(40) }
    ].map((c) => ({ id: newId2(), ...c }));
    return { members, tasks, comments, events: [] };
  }
  var init_seed = __esm({
    "js/api/adapters/seed.js"() {
      init_date();
    }
  });

  // js/api/adapters/local.js
  var local_exports = {};
  __export(local_exports, {
    createLocalAdapter: () => createLocalAdapter
  });
  function createLocalAdapter({ storage = globalThis.localStorage, now = () => /* @__PURE__ */ new Date() } = {}) {
    const listeners2 = /* @__PURE__ */ new Set();
    const statusListeners = /* @__PURE__ */ new Set();
    let connected = true;
    const clone = (v) => JSON.parse(JSON.stringify(v));
    function load() {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      const seeded = buildSeed(newId, now());
      storage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const save = (db) => storage.setItem(STORAGE_KEY, JSON.stringify(db));
    const emit = (change) => connected && listeners2.forEach((fn) => fn(change));
    if (typeof globalThis.addEventListener === "function") {
      globalThis.addEventListener("storage", (e) => {
        if (e.key === STORAGE_KEY) emit({ table: "tasks", type: "refresh", remote: true });
      });
    }
    const newestFirst = (a, b) => a.created_at < b.created_at ? 1 : -1;
    const oldestFirst = (a, b) => a.created_at < b.created_at ? -1 : 1;
    return {
      async listTasks() {
        return clone(load().tasks.filter((t) => !t.deleted_at).sort(newestFirst));
      },
      async createTask(input) {
        const clean = validateTask(input);
        const db = load();
        const stamp = now().toISOString();
        const status = clean.status ?? "todo";
        const task = {
          id: newId(),
          title: clean.title,
          description: clean.description ?? null,
          status,
          priority: clean.priority ?? "medium",
          assignee_id: clean.assignee_id ?? null,
          category: clean.category ?? "기타",
          due_date: clean.due_date ?? null,
          completed_at: status === "done" ? stamp : null,
          created_by: input.created_by,
          updated_by: input.created_by,
          created_at: stamp,
          updated_at: stamp,
          deleted_at: null
        };
        db.tasks.push(task);
        save(db);
        emit({ table: "tasks", type: "INSERT", record: clone(task) });
        return clone(task);
      },
      /**
       * 바뀐 필드만 받아 병합한다. opts.expectedUpdatedAt이 있고 서버 값과 다르면 CONFLICT.
       * 삭제된 항목은 deleted_at을 되돌리는 경우가 아니면 DELETED.
       */
      async updateTask(id, changes, opts = {}) {
        const db = load();
        const task = db.tasks.find((t) => t.id === id);
        if (!task) throw new ApiError("NOT_FOUND", "항목을 찾을 수 없습니다");
        if (task.deleted_at && !("deleted_at" in changes)) {
          throw new ApiError("DELETED", "이미 삭제된 항목입니다", { current: clone(task) });
        }
        if (opts.expectedUpdatedAt && opts.expectedUpdatedAt !== task.updated_at) {
          throw new ApiError("CONFLICT", "다른 사람이 먼저 수정했습니다", { current: clone(task) });
        }
        const patch = {};
        for (const key of TASK_WRITABLE2) if (key in changes) patch[key] = changes[key];
        const clean = validateTask(patch, { partial: true });
        const before = clone(task);
        Object.assign(task, clean);
        task.updated_at = now().toISOString();
        if (task.status === "done") {
          task.completed_at = before.status === "done" ? before.completed_at : task.updated_at;
        } else {
          task.completed_at = null;
        }
        for (const field2 of EVENT_FIELDS) {
          if (task[field2] !== before[field2]) {
            db.events.push({
              id: newId(),
              task_id: id,
              actor_id: task.updated_by,
              field: field2,
              from_value: before[field2] == null ? null : String(before[field2]),
              to_value: task[field2] == null ? null : String(task[field2]),
              created_at: task.updated_at
            });
          }
        }
        save(db);
        emit({ table: "tasks", type: "UPDATE", record: clone(task) });
        return clone(task);
      },
      async softDeleteTask(id, { updatedBy } = {}) {
        return this.updateTask(id, { deleted_at: now().toISOString(), ...updatedBy && { updated_by: updatedBy } });
      },
      async restoreTask(id, { updatedBy } = {}) {
        return this.updateTask(id, { deleted_at: null, ...updatedBy && { updated_by: updatedBy } });
      },
      async listComments(taskId) {
        return clone(load().comments.filter((c) => c.task_id === taskId).sort(oldestFirst));
      },
      async addComment({ task_id, author_id, body }) {
        const text = validateComment(body);
        const db = load();
        if (!db.tasks.some((t) => t.id === task_id)) throw new ApiError("NOT_FOUND", "항목을 찾을 수 없습니다");
        const comment = { id: newId(), task_id, author_id, body: text, created_at: now().toISOString() };
        db.comments.push(comment);
        save(db);
        emit({ table: "comments", type: "INSERT", record: clone(comment) });
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
        listeners2.add(onChange);
        if (onStatus) {
          statusListeners.add(onStatus);
          onStatus(connected ? "SUBSCRIBED" : "CLOSED");
        }
        return () => {
          listeners2.delete(onChange);
          statusListeners.delete(onStatus);
        };
      },
      /** 개발·테스트용: 실시간 연결이 끊기거나 복구된 상황을 흉내 낸다. */
      setConnected(next) {
        connected = next;
        statusListeners.forEach((fn) => fn(next ? "SUBSCRIBED" : "CLOSED"));
      }
    };
  }
  var STORAGE_KEY, TASK_WRITABLE2, EVENT_FIELDS;
  var init_local = __esm({
    "js/api/adapters/local.js"() {
      init_uuid();
      init_validation();
      init_errors();
      init_seed();
      STORAGE_KEY = "todo.local.db.v2";
      TASK_WRITABLE2 = [
        "title",
        "description",
        "status",
        "priority",
        "assignee_id",
        "category",
        "due_date",
        "updated_by",
        "deleted_at"
      ];
      EVENT_FIELDS = ["status", "assignee_id", "due_date", "priority"];
    }
  });

  // js/api/taskApi.js
  init_errors();
  var adapter = null;
  var actorId = null;
  function need() {
    if (!adapter) throw new Error("taskApi가 초기화되지 않았습니다. configureTaskApi(config)를 먼저 호출하세요");
    return adapter;
  }
  async function configureTaskApi(config) {
    if (config.adapter === "supabase") {
      const { createSupabaseAdapter: createSupabaseAdapter2 } = await Promise.resolve().then(() => (init_supabase(), supabase_exports));
      adapter = await createSupabaseAdapter2(config);
    } else {
      const { createLocalAdapter: createLocalAdapter2 } = await Promise.resolve().then(() => (init_local(), local_exports));
      adapter = createLocalAdapter2();
    }
    return taskApi;
  }
  function requireActor() {
    if (!actorId) throw new Error("현재 사용자가 선택되지 않았습니다. setActor(memberId)를 먼저 호출하세요");
    return actorId;
  }
  var getAdapter = () => adapter;
  var taskApi = {
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
    subscribe: (onChange, onStatus) => need().subscribe(onChange, onStatus)
  };

  // js/defaultConfig.js
  var defaultConfig_default = {
    adapter: "local",
    // 'local' | 'supabase'
    supabaseUrl: "",
    supabaseAnonKey: "",
    categories: ["기획", "개발", "디자인", "운영", "기타"],
    overloadThreshold: 8,
    pollIntervalMs: 3e4
    // 실시간 연결이 끊겼을 때 재조회 간격
  };

  // js/ui/dom.js
  var BOOLEAN_ATTRS = /* @__PURE__ */ new Set(["disabled", "required", "hidden", "readonly", "open", "multiple"]);
  var PROPERTY_ATTRS = /* @__PURE__ */ new Set(["value", "checked", "selected"]);
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    const deferred = [];
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value == null || value === false) continue;
      if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "class") {
        el.className = value;
      } else if (key === "dataset") {
        Object.assign(el.dataset, value);
      } else if (PROPERTY_ATTRS.has(key)) {
        deferred.push([key, value]);
      } else if (BOOLEAN_ATTRS.has(key)) {
        el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
    append(el, children);
    for (const [key, value] of deferred) el[key] = value;
    return el;
  }
  var SVG_NS = "http://www.w3.org/2000/svg";
  function svg(tag, props, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(props ?? {})) if (value != null && value !== false) el.setAttribute(key, String(value));
    append(el, children);
    return el;
  }
  function append(parent, children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return parent;
  }
  function captureFocus() {
    const key = document.activeElement?.dataset?.focusKey;
    return () => {
      if (!key) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.dataset?.focusKey !== key && active.isConnected) return;
      document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
    };
  }
  function preserveFocus(render) {
    const restore = captureFocus();
    render();
    restore();
  }
  var progressiveTokens = /* @__PURE__ */ new WeakMap();
  function renderProgressive(container, items, build, { first = 40, chunk = 40, onDone } = {}) {
    const token = /* @__PURE__ */ Symbol("render");
    progressiveTokens.set(container, token);
    container.replaceChildren();
    let index = 0;
    const appendNext = (count) => {
      const fragment = document.createDocumentFragment();
      const end = Math.min(items.length, index + count);
      for (; index < end; index += 1) fragment.append(build(items[index]));
      container.append(fragment);
    };
    const frame = () => {
      if (progressiveTokens.get(container) !== token || !container.isConnected) return;
      if (index >= items.length) return onDone?.();
      appendNext(chunk);
      requestAnimationFrame(frame);
    };
    appendNext(first);
    if (index >= items.length) onDone?.();
    else requestAnimationFrame(() => setTimeout(frame, 0));
  }
  var counter = 0;
  var uid = (prefix) => `${prefix}-${++counter}`;

  // js/ui/toast.js
  function showToast({ message, actionLabel, onAction, kind = "info", timeout = 5e3 }) {
    const region = document.getElementById("toast-region");
    const toast = h("div", { class: `toast toast--${kind}` }, h("span", null, message));
    const remove = () => toast.remove();
    if (actionLabel) {
      toast.append(
        h("button", {
          type: "button",
          class: "btn btn--secondary toast__action",
          onClick: () => {
            remove();
            onAction?.();
          }
        }, actionLabel)
      );
    }
    region.append(toast);
    if (timeout) setTimeout(remove, timeout);
    return remove;
  }
  var showError = (message) => showToast({ message, kind: "error", timeout: 8e3 });

  // js/domain/diff.js
  var TRACKED_FIELDS = ["title", "description", "status", "priority", "assignee_id", "category", "due_date"];
  var sameValue = (a, b) => (a ?? null) === (b ?? null);
  function changedFields(before, after) {
    return TRACKED_FIELDS.filter((f) => !sameValue(before[f], after[f])).map((field2) => ({
      field: field2,
      from: before[field2] ?? null,
      to: after[field2] ?? null
    }));
  }
  function findRemoteChanges(previous, next, myId) {
    const before = new Map(previous.map((t) => [t.id, t]));
    const changes = [];
    for (const task of next) {
      const old = before.get(task.id);
      if (!old || old.updated_at === task.updated_at) continue;
      if (task.updated_by === myId) continue;
      const fields = changedFields(old, task);
      if (fields.length) changes.push({ task, by: task.updated_by, fields });
    }
    return changes;
  }
  function conflictingFields(openedWith, current, myChanges) {
    return Object.keys(myChanges).filter((f) => TRACKED_FIELDS.includes(f) && !sameValue(openedWith[f], current[f]));
  }

  // js/domain/filters.js
  init_date();

  // js/domain/urgency.js
  init_date();
  function getUrgency(task, today) {
    if (!task.due_date || task.status === "done") return null;
    const days = diffDays(task.due_date, today);
    if (days < 0) return { kind: "overdue", label: `D+${-days}`, days };
    if (days <= 3) return { kind: "soon", label: days === 0 ? "D-day" : `D-${days}`, days };
    return null;
  }

  // js/domain/filters.js
  var UNASSIGNED = "__none__";
  var FILTER_KEYS = ["status", "priority", "assignee", "category", "urgency"];
  var URGENCY_VALUES = ["soon", "overdue"];
  var emptyFilters = () => ({ status: [], priority: [], assignee: [], category: [], urgency: [] });
  var countActiveFilters = (filters) => FILTER_KEYS.reduce((n, key) => n + filters[key].length, 0);
  var normalize = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, "");
  function applyFilters(tasks, query, filters, assigneeName2 = () => null, today = todayKst()) {
    const q = normalize(query);
    const matches = (list, value) => list.length === 0 || list.includes(value);
    return tasks.filter((task) => {
      if (!matches(filters.status, task.status)) return false;
      if (!matches(filters.priority, task.priority)) return false;
      if (!matches(filters.category, task.category)) return false;
      if (!matches(filters.assignee, task.assignee_id ?? UNASSIGNED)) return false;
      if (filters.urgency.length && !filters.urgency.includes(getUrgency(task, today)?.kind)) return false;
      if (!q) return true;
      return normalize(task.title).includes(q) || normalize(assigneeName2(task.assignee_id)).includes(q);
    });
  }

  // js/state/store.js
  init_date();

  // js/domain/calendar.js
  init_date();

  // js/domain/sort.js
  var PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  var STATUS_RANK = { todo: 0, in_progress: 1, done: 2 };
  var collator = new Intl.Collator("ko");
  function compareDue(a, b) {
    if (a.due_date === b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  function comparePriorityThenDue(a, b) {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDue(a, b);
  }
  function sortTasks(tasks, sort, assigneeName2 = () => null) {
    const sign = sort.dir === "desc" ? -1 : 1;
    const primary = {
      title: (a, b) => collator.compare(a.title, b.title),
      status: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
      priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
      category: (a, b) => collator.compare(a.category ?? "", b.category ?? ""),
      assignee: (a, b) => {
        const [x, y] = [assigneeName2(a.assignee_id), assigneeName2(b.assignee_id)];
        if (!x && !y) return 0;
        if (!x) return 1;
        if (!y) return -1;
        return collator.compare(x, y);
      }
    }[sort.key];
    return [...tasks].sort((a, b) => {
      if (sort.key === "due_date") {
        const noDue = !a.due_date || !b.due_date;
        const d = compareDue(a, b);
        return (noDue ? d : d * sign) || comparePriorityThenDue(a, b);
      }
      return (primary ? primary(a, b) * sign : 0) || comparePriorityThenDue(a, b);
    });
  }

  // js/domain/calendar.js
  var MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
  function parseMonthKey(key) {
    const match = MONTH_PATTERN.exec(key ?? "");
    if (!match) return null;
    const [year, month] = [Number(match[1]), Number(match[2])];
    return month >= 1 && month <= 12 ? { year, month } : null;
  }
  var monthOf = (dateKey) => dateKey.slice(0, 7);
  function addMonths(monthKey, delta) {
    const { year, month } = parseMonthKey(monthKey);
    const index = year * 12 + (month - 1) + delta;
    return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
  }
  function buildMonthGrid(monthKey) {
    const { year, month } = parseMonthKey(monthKey);
    const first = `${monthKey}-01`;
    const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const start2 = addDays(first, -weekday);
    const weeks = Math.ceil((weekday + daysInMonth) / 7);
    return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_2, d) => addDays(start2, w * 7 + d)));
  }
  function groupByDue(tasks) {
    const byDate = /* @__PURE__ */ new Map();
    const noDue = [];
    for (const task of sortTasks(tasks, { key: "priority", dir: "asc" })) {
      if (!task.due_date || !parseDateKey(task.due_date)) {
        noDue.push(task);
        continue;
      }
      if (!byDate.has(task.due_date)) byDate.set(task.due_date, []);
      byDate.get(task.due_date).push(task);
    }
    return { byDate, noDue };
  }

  // js/state/store.js
  var state = {
    config: null,
    members: [],
    tasks: [],
    loading: true,
    remoteMarks: {},
    // 다른 사람이 방금 수정한 할일 id → {by, at}
    currentUser: null,
    // 뷰·검색·필터는 하나의 전역 상태이며 뷰를 바꿔도 유지된다(PRD 5.5). URL과 동기화된다.
    view: "list",
    query: "",
    filters: emptyFilters(),
    month: monthOf(todayKst()),
    // 리스트 정렬·페이지는 URL에 두지 않는다.
    sort: { key: "priority", dir: "asc" },
    page: 0
  };
  var listeners = /* @__PURE__ */ new Set();
  var getState = () => state;
  function setState(patch) {
    Object.assign(state, patch);
    listeners.forEach((fn) => fn(state));
  }
  function subscribeStore(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  var memberById = (id) => state.members.find((m) => m.id === id) ?? null;

  // js/ui/labels.js
  var STATUS_LABEL = { todo: "할 일", in_progress: "진행 중", done: "완료" };
  var PRIORITY_LABEL = { high: "높음", medium: "보통", low: "낮음" };
  function memberName(member) {
    if (!member) return "";
    return member.label ? `${member.name}(${member.label})` : member.name;
  }
  var dateTimeFormat = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  function formatDateTime(iso) {
    return iso ? dateTimeFormat.format(new Date(iso)) : "";
  }
  var statusBadge = (status) => h("span", { class: `badge badge--status-${status}` }, STATUS_LABEL[status]);
  var priorityBadge = (priority) => h("span", { class: `badge badge--priority-${priority}` }, PRIORITY_LABEL[priority]);
  function urgencyBadge(urgency) {
    if (!urgency) return null;
    return h(
      "span",
      { class: `badge badge--urgent-${urgency.kind}` },
      h("span", { class: "visually-hidden" }, urgency.kind === "soon" ? "마감 임박 " : "마감 지연 "),
      urgency.label
    );
  }

  // js/ui/korean.js
  var DIGIT_HAS_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
  function batchim(word) {
    const ch = String(word).trim().slice(-1);
    if (!ch) return "none";
    const code = ch.charCodeAt(0);
    if (code >= 44032 && code <= 55203) {
      const jong = (code - 44032) % 28;
      return jong === 0 ? "none" : jong === 8 ? "rieul" : "other";
    }
    if (/[0-9]/.test(ch)) {
      if (ch === "1" || ch === "7" || ch === "8") return "rieul";
      return DIGIT_HAS_BATCHIM[ch] ? "other" : "none";
    }
    return "none";
  }
  var eulReul = (word) => `${word}${batchim(word) === "none" ? "를" : "을"}`;
  var euro = (word) => `${word}${batchim(word) === "other" ? "으로" : "로"}`;

  // js/state/remote.js
  var FIELD_LABEL = {
    title: "제목",
    description: "설명",
    status: "상태",
    priority: "우선순위",
    assignee_id: "담당자",
    category: "카테고리",
    due_date: "마감일"
  };
  var MARK_MS = 15e3;
  function formatFieldValue(field2, value) {
    if (value == null || value === "") return "없음";
    if (field2 === "status") return STATUS_LABEL[value] ?? value;
    if (field2 === "priority") return PRIORITY_LABEL[value] ?? value;
    if (field2 === "assignee_id") return memberName(memberById(value)) || "알 수 없음";
    if (field2 === "description") return "(내용 수정)";
    return value;
  }
  function describeChange(byName, { field: field2, to }) {
    return `${byName}님이 ${eulReul(FIELD_LABEL[field2])} ${euro(formatFieldValue(field2, to))} 변경했습니다`;
  }
  function announceRemoteChanges(previous, next) {
    const { currentUser } = getState();
    if (!currentUser || !previous.length) return;
    const changes = findRemoteChanges(previous, next, currentUser.id);
    if (!changes.length) return;
    const marks = { ...getState().remoteMarks };
    for (const { task, by, fields } of changes) {
      const byName = memberName(memberById(by)) || "다른 사람";
      marks[task.id] = { by: byName, at: Date.now() };
      const extra = fields.length > 1 ? ` 외 ${fields.length - 1}건` : "";
      showToast({ message: `${describeChange(byName, fields[0])}${extra} (${task.title})`, timeout: 8e3 });
      setTimeout(() => {
        const current = getState().remoteMarks[task.id];
        if (current && Date.now() - current.at >= MARK_MS - 50) {
          const { [task.id]: _gone, ...rest } = getState().remoteMarks;
          setState({ remoteMarks: rest });
        }
      }, MARK_MS);
    }
    setState({ remoteMarks: marks });
  }

  // js/state/actions.js
  async function reloadTasks() {
    try {
      const next = await taskApi.listTasks();
      announceRemoteChanges(getState().tasks, next);
      setState({ tasks: next, loading: false });
    } catch (err) {
      setState({ loading: false });
      showError(`목록을 불러오지 못했습니다. 잠시 후 다시 시도하세요. (${err.message})`);
    }
  }
  async function reloadMembers() {
    setState({ members: await taskApi.listMembers() });
  }
  async function changeStatus(task, status) {
    if (task.status === status) return;
    const before = getState().tasks;
    setState({
      tasks: before.map(
        (t) => t.id === task.id ? { ...t, status, completed_at: status === "done" ? t.completed_at ?? (/* @__PURE__ */ new Date()).toISOString() : null } : t
      )
    });
    try {
      await taskApi.updateTask(task.id, { status });
    } catch (err) {
      setState({ tasks: before });
      showError(
        err.code === "DELETED" ? "이미 삭제된 항목입니다." : `상태를 바꾸지 못했습니다. 다시 시도하세요. (${err.message})`
      );
    }
    await reloadTasks();
  }
  async function deleteTask(task) {
    try {
      await taskApi.softDeleteTask(task.id);
    } catch (err) {
      showError(err.message);
      return false;
    }
    await reloadTasks();
    showToast({
      message: `「${task.title}」을(를) 삭제했습니다`,
      actionLabel: "되돌리기",
      timeout: 5e3,
      onAction: async () => {
        try {
          await taskApi.restoreTask(task.id);
        } catch (err) {
          showError(err.message);
        }
        await reloadTasks();
      }
    });
    return true;
  }
  var activeMembers = () => getState().members.filter((m) => m.active);

  // js/state/criteria.js
  var setQuery = (query) => setState({ query, page: 0 });
  var setView = (view) => setState({ view });
  var setMonth = (month) => setState({ month });
  var clearAll = () => setState({ query: "", filters: emptyFilters(), page: 0 });
  function toggleFilter(key, value) {
    const { filters } = getState();
    const next = filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value];
    setState({ filters: { ...filters, [key]: next }, page: 0 });
  }
  function removeFilterValue(key, value) {
    const { filters } = getState();
    setState({ filters: { ...filters, [key]: filters[key].filter((v) => v !== value) }, page: 0 });
  }

  // js/state/realtime.js
  var BANNER_TEXT = "연결 끊김 — 최신이 아닐 수 있음";
  var RELOAD_DEBOUNCE_MS = 50;
  function startRealtime({ banner, pollMs = 3e4 }) {
    let online = true;
    let interval = pollMs;
    let pollTimer = null;
    let reloadTimer = null;
    const syncNow = async () => {
      try {
        await reloadMembers();
      } catch {
      }
      await reloadTasks();
    };
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
        banner.textContent = "";
        syncNow();
      } else {
        banner.textContent = BANNER_TEXT;
        startPolling();
      }
    }
    taskApi.subscribe(scheduleReload, (status) => setOnline(status === "SUBSCRIBED"));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) syncNow();
    });
    window.addEventListener("focus", syncNow);
    return {
      setOnline,
      isOnline: () => online,
      setPollInterval(ms) {
        interval = ms;
        if (pollTimer) startPolling();
      }
    };
  }

  // js/state/urlState.js
  init_validation();
  var VIEWS = ["list", "kanban", "calendar", "dashboard"];
  var ENUMS = { status: STATUSES, priority: PRIORITIES, urgency: URGENCY_VALUES };
  function parseUrlState(search) {
    const params = new URLSearchParams(search);
    const view = VIEWS.includes(params.get("view")) ? params.get("view") : "list";
    const filters = emptyFilters();
    for (const key of FILTER_KEYS) {
      const values = (params.get(key) ?? "").split(",").filter(Boolean);
      filters[key] = [...new Set(ENUMS[key] ? values.filter((v) => ENUMS[key].includes(v)) : values)];
    }
    const month = parseMonthKey(params.get("month")) ? params.get("month") : null;
    return { view, query: (params.get("q") ?? "").slice(0, 100), filters, month };
  }
  function buildSearch({ view, query, filters, month }) {
    const params = new URLSearchParams();
    if (view && view !== "list") params.set("view", view);
    if (query?.trim()) params.set("q", query.trim());
    for (const key of FILTER_KEYS) if (filters[key].length) params.set(key, filters[key].join(","));
    if (view === "calendar" && month) params.set("month", month);
    const text = params.toString();
    return text ? `?${text}` : "";
  }

  // js/ui/filterBar.js
  init_validation();

  // js/state/selectors.js
  init_date();
  var assigneeName = (id) => memberById(id)?.name ?? null;
  function getVisibleTasks() {
    const { tasks, query, filters } = getState();
    return applyFilters(tasks, query, filters, assigneeName, todayKst());
  }
  function hasActiveCriteria() {
    const { query, filters } = getState();
    return Boolean(query.trim()) || countActiveFilters(filters) > 0;
  }

  // js/ui/filterBar.js
  var GROUP_LABEL = { status: "상태", priority: "우선순위", assignee: "담당자", category: "카테고리", urgency: "마감" };
  var URGENCY_LABEL = { soon: "임박(D-3~D-day)", overdue: "지연" };
  var SEARCH_DEBOUNCE_MS = 200;
  function optionsFor(key, state2) {
    switch (key) {
      case "status":
        return STATUSES.map((v) => ({ value: v, text: STATUS_LABEL[v] }));
      case "priority":
        return PRIORITIES.map((v) => ({ value: v, text: PRIORITY_LABEL[v] }));
      case "assignee":
        return [
          { value: UNASSIGNED, text: "미배정" },
          ...state2.members.filter((m) => m.active).map((m) => ({ value: m.id, text: memberName(m) }))
        ];
      case "urgency":
        return URGENCY_VALUES.map((v) => ({ value: v, text: URGENCY_LABEL[v] }));
      case "category": {
        const known = state2.config?.categories ?? [];
        const extra = [...new Set(state2.tasks.map((t) => t.category).filter((c) => c && !known.includes(c)))];
        return [...known, ...extra].map((v) => ({ value: v, text: v }));
      }
      default:
        return [];
    }
  }
  function chipLabel(key, value) {
    if (key === "status") return STATUS_LABEL[value];
    if (key === "priority") return PRIORITY_LABEL[value];
    if (key === "urgency") return URGENCY_LABEL[value];
    if (key === "assignee") return value === UNASSIGNED ? "미배정" : memberName(memberById(value)) || "알 수 없음";
    return value;
  }
  function initFilterBar({ panel, toggle, searchInput, chips, count, content }) {
    const isCollapsible = window.matchMedia("(max-width: 1023px)");
    const isMobile = window.matchMedia("(max-width: 639px)");
    let open = false;
    let typingTimer = null;
    let signature = "";
    function setOpen(next, { restoreFocus = true } = {}) {
      open = next;
      panel.dataset.open = String(next);
      toggle.setAttribute("aria-expanded", String(next));
      const modal = next && isMobile.matches;
      for (const el of [document.querySelector(".app-header"), content]) el.inert = modal;
      if (next) panel.querySelector("input")?.focus();
      else if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener("click", () => setOpen(!open));
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && open && isCollapsible.matches) {
        event.stopPropagation();
        setOpen(false);
      }
    });
    isCollapsible.addEventListener("change", () => setOpen(false, { restoreFocus: false }));
    isMobile.addEventListener("change", () => setOpen(false, { restoreFocus: false }));
    searchInput.addEventListener("input", () => {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        typingTimer = null;
        setQuery(searchInput.value);
      }, SEARCH_DEBOUNCE_MS);
    });
    function buildPanel(state2) {
      const groups = FILTER_KEYS.map(
        (key) => h(
          "fieldset",
          { class: "filter-group" },
          h("legend", null, GROUP_LABEL[key]),
          ...optionsFor(key, state2).map(
            ({ value, text }) => h(
              "label",
              { class: "check" },
              h("input", {
                type: "checkbox",
                checked: state2.filters[key].includes(value),
                "data-focus-key": `filter-${key}-${value}`,
                onChange: () => toggleFilter(key, value)
              }),
              h("span", null, text)
            )
          )
        )
      );
      panel.replaceChildren(
        h(
          "div",
          { class: "filter-panel__head" },
          h("h2", { class: "filter-panel__title" }, "필터"),
          h("button", { type: "button", class: "btn btn--secondary filter-panel__close", onClick: () => setOpen(false) }, "닫기")
        ),
        ...groups,
        h("button", { type: "button", class: "btn btn--secondary", "data-focus-key": "filter-clear", onClick: clearAll }, "모두 해제")
      );
    }
    function buildChips(state2) {
      const items = [];
      if (state2.query.trim()) {
        items.push(
          h("button", { type: "button", class: "chip", "aria-label": `검색어 해제: ${state2.query.trim()}`, onClick: () => setQuery("") }, `검색: ${state2.query.trim()} ✕`)
        );
      }
      for (const key of FILTER_KEYS) {
        for (const value of state2.filters[key]) {
          items.push(
            h(
              "button",
              {
                type: "button",
                class: "chip",
                "data-focus-key": `chip-${key}-${value}`,
                "aria-label": `필터 해제: ${GROUP_LABEL[key]} ${chipLabel(key, value)}`,
                onClick: () => removeFilterValue(key, value)
              },
              `${GROUP_LABEL[key]}: ${chipLabel(key, value)} ✕`
            )
          );
        }
      }
      if (items.length) items.push(h("button", { type: "button", class: "btn btn--secondary chip-clear", onClick: clearAll }, "모두 해제"));
      chips.replaceChildren(...items);
    }
    function update(state2) {
      const next = JSON.stringify([state2.filters, state2.members.map((m) => [m.id, m.name, m.label, m.active]), state2.config?.categories]);
      if (next !== signature) {
        signature = next;
        preserveFocus(() => buildPanel(state2));
      }
      preserveFocus(() => buildChips(state2));
      if (typingTimer === null && searchInput.value.trim() !== state2.query.trim()) searchInput.value = state2.query;
      const active = countActiveFilters(state2.filters);
      toggle.textContent = active ? `필터 (${active})` : "필터";
      const shown = getVisibleTasks().length;
      count.textContent = state2.loading ? "" : hasActiveCriteria() ? `전체 ${state2.tasks.length}건 중 ${shown}건` : `${shown}건`;
    }
    subscribeStore(update);
    update(getState());
  }

  // js/ui/identity.js
  init_validation();

  // js/ui/dialog.js
  var FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  function openDialog({ title, body, closable = true, onClosed, wide = false }) {
    const opener = document.activeElement;
    const openerKey = opener?.dataset?.focusKey;
    const titleId = uid("dialog-title");
    const dialog = h(
      "dialog",
      { class: `dialog${wide ? " dialog--wide" : ""}`, "aria-labelledby": titleId },
      h("div", { class: "dialog__body stack" }, h("h2", { id: titleId, class: "dialog__title" }, title), body)
    );
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
    dialog.addEventListener("cancel", (event) => {
      if (!closable) event.preventDefault();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      const target = opener?.isConnected ? opener : openerKey && document.querySelector(`[data-focus-key="${CSS.escape(openerKey)}"]`);
      (target || document.getElementById("main"))?.focus();
      onClosed?.(dialog.returnValue);
    });
    document.body.append(dialog);
    dialog.showModal();
    (dialog.querySelector("[data-autofocus]") ?? dialog.querySelector("input, select, textarea, button"))?.focus();
    return { dialog, close: (value = "") => dialog.close(value) };
  }
  function confirmDialog({ title, message, confirmLabel = "확인" }) {
    return new Promise((resolve) => {
      const body = [
        h("p", null, message),
        h(
          "div",
          { class: "row dialog__actions" },
          h("button", { type: "button", class: "btn btn--primary", "data-autofocus": "", onClick: () => handle.close("ok") }, confirmLabel),
          h("button", { type: "button", class: "btn btn--secondary", onClick: () => handle.close("cancel") }, "취소")
        )
      ];
      const handle = openDialog({ title, body, onClosed: (value) => resolve(value === "ok") });
    });
  }

  // js/ui/form.js
  function field({ label, required = false, hint, control }) {
    const id = control.id || (control.id = uid("field"));
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const error = h("p", { class: "field__error", id: errorId, hidden: true });
    const describedBy = [hint && hintId].filter(Boolean);
    if (describedBy.length) control.setAttribute("aria-describedby", describedBy.join(" "));
    if (required) control.setAttribute("aria-required", "true");
    control.classList.add("field__input");
    const el = h(
      "div",
      { class: "field" },
      h("label", { class: "field__label", for: id }, label, required && h("span", { class: "field__required" }, " (필수)")),
      control,
      hint && h("p", { class: "field__hint", id: hintId }, hint),
      error
    );
    return {
      el,
      control,
      setError(message) {
        error.hidden = !message;
        error.textContent = message ?? "";
        const ids = [...describedBy, message && errorId].filter(Boolean);
        if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
        else control.removeAttribute("aria-describedby");
        if (message) control.setAttribute("aria-invalid", "true");
        else control.removeAttribute("aria-invalid");
      }
    };
  }
  function errorSummary() {
    const el = h("p", { class: "form-summary", role: "alert", "aria-live": "assertive", hidden: true });
    return {
      el,
      show(message) {
        el.hidden = !message;
        el.textContent = message ?? "";
      }
    };
  }
  var option = (value, text, selected = false) => h("option", { value, selected }, text);

  // js/ui/identity.js
  var STORAGE_KEY2 = "todo.currentMemberId";
  function readStoredId() {
    try {
      return localStorage.getItem(STORAGE_KEY2);
    } catch {
      return null;
    }
  }
  function storeId(id) {
    try {
      localStorage.setItem(STORAGE_KEY2, id);
    } catch {
    }
  }
  function adopt(member) {
    storeId(member.id);
    taskApi.setActor(member.id);
    setState({ currentUser: member });
  }
  async function ensureCurrentUser() {
    const stored = readStoredId();
    const found = stored && activeMembers().find((m) => m.id === stored);
    if (found) {
      adopt(found);
      return found;
    }
    return openIdentityDialog({ closable: false });
  }
  function openIdentityDialog({ closable }) {
    return new Promise((resolve) => {
      let chosen = null;
      const nameField = field({
        label: "이름",
        required: true,
        control: h("input", { type: "text", autocomplete: "off", list: "member-names", maxlength: 40, "data-autofocus": "" })
      });
      const labelField = field({
        label: "구분용 라벨",
        hint: "동명이인이 있을 때만 팀·약칭을 입력하세요(최대 10자).",
        control: h("input", { type: "text", autocomplete: "off", maxlength: 20 })
      });
      const summary = errorSummary();
      const datalist = h("datalist", { id: "member-names" }, ...[...new Set(activeMembers().map((m) => m.name))].map((n) => h("option", { value: n })));
      async function submit(event) {
        event.preventDefault();
        nameField.setError(null);
        labelField.setError(null);
        summary.show(null);
        const name = nameField.control.value.trim();
        const label = labelField.control.value.trim() || null;
        if (!name) {
          nameField.setError("이름을 입력하세요");
          summary.show("입력 내용을 확인하세요 (오류 1개)");
          nameField.control.focus();
          return;
        }
        const sameName = activeMembers().filter((m) => m.name === name);
        let member;
        if (label) {
          member = sameName.find((m) => m.label === label);
        } else if (sameName.length === 1) {
          member = sameName[0];
        } else if (sameName.length > 1) {
          labelField.setError(`같은 이름이 ${sameName.length}명 있습니다. 라벨을 입력하세요 (${sameName.map(memberName).join(", ")})`);
          summary.show("입력 내용을 확인하세요 (오류 1개)");
          labelField.control.focus();
          return;
        }
        try {
          if (!member) member = await taskApi.addMember({ name, label });
        } catch (err) {
          const errors = err instanceof ValidationError ? err.errors : {};
          nameField.setError(errors.name ?? null);
          labelField.setError(errors.label ?? null);
          summary.show(Object.keys(errors).length ? `입력 내용을 확인하세요 (오류 ${Object.keys(errors).length}개)` : err.message);
          (errors.name ? nameField : labelField).control.focus();
          return;
        }
        await reloadMembers();
        adopt(member);
        chosen = member;
        handle.close("ok");
      }
      const form = h(
        "form",
        { class: "stack", novalidate: true, onSubmit: submit },
        h("p", { class: "notice" }, "이름은 본인 확인 수단이 아닙니다. 사내 구성원만 사용하세요."),
        summary.el,
        nameField.el,
        labelField.el,
        datalist,
        h(
          "div",
          { class: "row dialog__actions" },
          h("button", { type: "submit", class: "btn btn--primary" }, "확인"),
          closable && h("button", { type: "button", class: "btn btn--secondary", onClick: () => handle.close("cancel") }, "취소")
        )
      );
      const handle = openDialog({
        title: closable ? "사용자 변경" : "이름을 입력하세요",
        body: form,
        closable,
        onClosed: () => resolve(chosen)
      });
    });
  }

  // js/ui/taskForm.js
  init_validation();
  var FIELD_ORDER = ["title", "description", "status", "priority", "assignee_id", "category", "due_date"];
  function openTaskForm({ task = null, defaults = {} } = {}) {
    return new Promise((resolve) => {
      const isEdit = Boolean(task);
      const initial = {
        title: "",
        description: "",
        status: "todo",
        priority: "medium",
        assignee_id: null,
        category: "기타",
        due_date: null,
        ...defaults,
        ...task ?? {}
      };
      let saved = null;
      let submitting = false;
      const categories = getState().config.categories;
      const categoryOptions = categories.includes(initial.category) ? categories : [initial.category, ...categories];
      const assignees = activeMembers();
      if (initial.assignee_id && !assignees.some((m) => m.id === initial.assignee_id)) {
        const gone = getState().members.find((m) => m.id === initial.assignee_id);
        if (gone) assignees.push(gone);
      }
      const f = {
        title: field({
          label: "제목",
          required: true,
          hint: "100자 이하",
          control: h("input", { type: "text", value: initial.title, maxlength: 200, "data-autofocus": "" })
        }),
        description: field({
          label: "설명",
          hint: "2000자 이하, 일반 텍스트",
          control: h("textarea", { rows: 4, value: initial.description ?? "" })
        }),
        status: field({
          label: "상태",
          control: h("select", { value: initial.status }, ...Object.entries(STATUS_LABEL).map(([v, t]) => option(v, t)))
        }),
        priority: field({
          label: "우선순위",
          control: h("select", { value: initial.priority }, ...Object.entries(PRIORITY_LABEL).map(([v, t]) => option(v, t)))
        }),
        assignee_id: field({
          label: "담당자",
          control: h(
            "select",
            { value: initial.assignee_id ?? "" },
            option("", "미배정"),
            ...assignees.map((m) => option(m.id, memberName(m)))
          )
        }),
        category: field({
          label: "카테고리",
          control: h("select", { value: initial.category }, ...categoryOptions.map((c) => option(c, c)))
        }),
        due_date: field({
          label: "마감일",
          control: h("input", { type: "date", value: initial.due_date ?? "" })
        })
      };
      const summary = errorSummary();
      function readValues() {
        return {
          title: f.title.control.value,
          description: f.description.control.value,
          status: f.status.control.value,
          priority: f.priority.control.value,
          assignee_id: f.assignee_id.control.value || null,
          category: f.category.control.value,
          due_date: f.due_date.control.value || null
        };
      }
      function showErrors(errors) {
        const names = Object.keys(errors);
        for (const name of FIELD_ORDER) f[name]?.setError(errors[name] ?? null);
        summary.show(names.length ? `입력 내용을 확인하세요 (오류 ${names.length}개)` : null);
        const first = FIELD_ORDER.find((n) => errors[n]);
        if (first) f[first].control.focus();
      }
      function diff(values) {
        const normalize2 = (name, value) => {
          if (name === "title") return String(value ?? "").trim();
          if (name === "description") return String(value ?? "").trim() || null;
          return value || null;
        };
        const changes = {};
        for (const name of FIELD_ORDER) {
          if (normalize2(name, initial[name]) !== normalize2(name, values[name])) changes[name] = values[name];
        }
        return changes;
      }
      function askConflict(current, fields) {
        return new Promise((resolve2) => {
          let choice = null;
          const rows = fields.map((name) => h("li", null, `${FIELD_LABEL[name]}: 서버 값 「${formatFieldValue(name, current[name])}」 / 내 값 「${formatFieldValue(name, values_[name])}」`));
          const by = memberName(memberById(current.updated_by)) || "다른 사람";
          const pick = (value) => () => {
            choice = value;
            ask.close(value);
          };
          const ask = openDialog({
            title: "다른 사람이 먼저 수정했습니다",
            body: [
              h("p", null, `${by}님이 같은 항목을 먼저 수정했습니다.`),
              h("ul", null, ...rows),
              h(
                "div",
                { class: "row dialog__actions" },
                h("button", { type: "button", class: "btn btn--primary", "data-autofocus": "", onClick: pick("overwrite") }, "덮어쓰기"),
                h("button", { type: "button", class: "btn btn--secondary", onClick: pick("server") }, "서버 값 사용"),
                h("button", { type: "button", class: "btn btn--secondary", onClick: () => ask.close("cancel") }, "취소")
              )
            ],
            onClosed: () => resolve2(choice)
          });
        });
      }
      let values_ = {};
      async function saveEdit(changes) {
        try {
          return await taskApi.updateTask(task.id, changes, { expectedUpdatedAt: initial.updated_at });
        } catch (err) {
          if (err.code !== "CONFLICT") throw err;
          const clash = conflictingFields(initial, err.current, changes);
          if (!clash.length) return taskApi.updateTask(task.id, changes);
          const decision = await askConflict(err.current, clash);
          if (decision === "overwrite") return taskApi.updateTask(task.id, changes);
          if (decision === "server") {
            await reloadTasks();
            showToast({ message: "서버의 최신 값을 사용했습니다" });
            return "server";
          }
          return null;
        }
      }
      async function submit(event) {
        event.preventDefault();
        if (submitting) return;
        const values = readValues();
        values_ = values;
        try {
          validateTask(values);
        } catch (err) {
          if (err instanceof ValidationError) return showErrors(err.errors);
          throw err;
        }
        showErrors({});
        submitting = true;
        saveButton.disabled = true;
        try {
          let result;
          if (isEdit) {
            const changes = diff(values);
            if (!Object.keys(changes).length) return handle.close("cancel");
            result = await saveEdit(changes);
            if (result === null) return;
            if (result === "server") return handle.close("server");
          } else {
            result = await taskApi.createTask(values);
          }
          saved = result;
          await reloadTasks();
          showToast({ message: isEdit ? "저장했습니다" : "할일을 등록했습니다" });
          handle.close("saved");
        } catch (err) {
          if (err instanceof ValidationError) return showErrors(err.errors);
          const message = err.code === "DELETED" ? "이미 삭제된 항목입니다." : `저장하지 못했습니다. 잠시 후 다시 시도하세요. (${err.message})`;
          summary.show(message);
          if (err.code === "DELETED") saveButton.disabled = true;
        } finally {
          submitting = false;
          if (!deleted) saveButton.disabled = false;
        }
      }
      let deleted = false;
      const notice = h("p", { class: "form-notice", role: "status", hidden: true });
      function syncNotice() {
        if (!isEdit || submitting) return;
        const current = getState().tasks.find((t) => t.id === task.id);
        if (!current) {
          deleted = true;
          notice.hidden = false;
          notice.textContent = "이미 삭제된 항목입니다. 저장할 수 없습니다.";
          saveButton.disabled = true;
        } else if (current.updated_at !== initial.updated_at) {
          const by = memberName(memberById(current.updated_by)) || "다른 사람";
          notice.hidden = false;
          notice.textContent = `${by}님이 수정했습니다. 입력한 내용은 그대로 유지됩니다.`;
        }
      }
      const unsubscribe = subscribeStore(syncNotice);
      const saveButton = h("button", { type: "submit", class: "btn btn--primary" }, isEdit ? "저장" : "등록");
      const form = h(
        "form",
        { class: "stack", novalidate: true, onSubmit: submit },
        notice,
        summary.el,
        f.title.el,
        f.description.el,
        h("div", { class: "form-grid" }, f.status.el, f.priority.el, f.assignee_id.el, f.category.el, f.due_date.el),
        h(
          "div",
          { class: "row dialog__actions" },
          saveButton,
          h("button", { type: "button", class: "btn btn--secondary", onClick: () => handle.close("cancel") }, "취소")
        )
      );
      const handle = openDialog({
        title: isEdit ? "할일 수정" : "새 할일",
        body: form,
        onClosed: () => {
          unsubscribe();
          resolve(saved);
        }
      });
    });
  }

  // js/views/calendarView.js
  init_date();

  // js/ui/taskDetail.js
  init_date();
  init_validation();
  function openTaskDetail(taskId) {
    const findTask = () => getState().tasks.find((t) => t.id === taskId);
    if (!findTask()) return;
    const fieldsEl = h("dl", { class: "detail-fields" });
    const actionsEl = h("div", { class: "row dialog__actions" });
    const commentsEl = h("ol", { class: "comment-list" });
    const eventsEl = h("ul", { class: "event-list" });
    const titleHeading = h("h3", { class: "detail-title" });
    function renderFields() {
      const task = findTask();
      if (!task) return handle.close("gone");
      const row2 = (term, ...value) => [h("dt", null, term), h("dd", null, ...value)];
      titleHeading.textContent = task.title;
      fieldsEl.replaceChildren(
        ...row2("상태", statusBadge(task.status)),
        ...row2("우선순위", priorityBadge(task.priority)),
        ...row2("담당자", memberName(memberById(task.assignee_id)) || "미배정"),
        ...row2("카테고리", task.category ?? ""),
        ...row2("마감일", task.due_date ?? "없음", " ", urgencyBadge(getUrgency(task, todayKst()))),
        ...task.completed_at ? row2("완료", formatDateTime(task.completed_at)) : [],
        ...row2("설명", task.description ? h("span", { class: "preserve-lines" }, task.description) : "없음"),
        ...row2("작성", `${memberName(memberById(task.created_by))} · ${formatDateTime(task.created_at)}`),
        ...row2("최종 수정", `${memberName(memberById(task.updated_by))} · ${formatDateTime(task.updated_at)}`)
      );
    }
    async function renderComments() {
      const comments = await taskApi.listComments(taskId);
      commentsEl.replaceChildren(
        ...comments.length ? comments.map(
          (c) => h(
            "li",
            { class: "comment" },
            h("p", { class: "comment__meta" }, `${memberName(memberById(c.author_id))} · ${formatDateTime(c.created_at)}`),
            h("p", { class: "preserve-lines" }, c.body)
          )
        ) : [h("li", { class: "muted" }, "댓글이 없습니다")]
      );
    }
    async function renderEvents() {
      const events = await taskApi.listEvents(taskId);
      eventsEl.replaceChildren(
        ...events.length ? events.map(
          (e) => h(
            "li",
            null,
            `${formatDateTime(e.created_at)} · ${memberName(memberById(e.actor_id))}: ${FIELD_LABEL[e.field]} ${formatFieldValue(e.field, e.from_value)} → ${formatFieldValue(e.field, e.to_value)}`
          )
        ) : [h("li", { class: "muted" }, "변경 이력이 없습니다")]
      );
    }
    const commentField = field({
      label: "댓글 작성",
      hint: "1000자 이하, 일반 텍스트",
      control: h("textarea", { rows: 3 })
    });
    const commentSummary = errorSummary();
    const commentForm = h(
      "form",
      {
        class: "stack",
        novalidate: true,
        onSubmit: async (event) => {
          event.preventDefault();
          commentField.setError(null);
          commentSummary.show(null);
          try {
            validateComment(commentField.control.value);
            await taskApi.addComment(taskId, commentField.control.value);
          } catch (err) {
            if (err instanceof ValidationError) {
              commentField.setError(err.errors.body);
              commentSummary.show("입력 내용을 확인하세요 (오류 1개)");
              commentField.control.focus();
            } else {
              showError(`댓글을 등록하지 못했습니다. (${err.message})`);
            }
            return;
          }
          commentField.control.value = "";
          await renderComments();
          commentField.control.focus();
        }
      },
      commentSummary.el,
      commentField.el,
      h("div", { class: "row" }, h("button", { type: "submit", class: "btn btn--primary" }, "댓글 등록"))
    );
    actionsEl.append(
      h("button", {
        type: "button",
        class: "btn btn--primary",
        onClick: async () => {
          await openTaskForm({ task: findTask() });
          await renderEvents();
        }
      }, "수정"),
      h("button", {
        type: "button",
        class: "btn btn--secondary",
        onClick: async () => {
          const task = findTask();
          const ok = await confirmDialog({
            title: "할일 삭제",
            message: `「${task.title}」을(를) 삭제할까요? 삭제 직후 5초 동안 되돌릴 수 있습니다.`,
            confirmLabel: "삭제"
          });
          if (ok && await deleteTask(task)) handle.close("deleted");
        }
      }, "삭제"),
      h("button", { type: "button", class: "btn btn--secondary", onClick: () => handle.close("close") }, "닫기")
    );
    const body = [
      titleHeading,
      fieldsEl,
      actionsEl,
      h(
        "section",
        { class: "stack", "aria-labelledby": "detail-comments-heading" },
        h("h3", { id: "detail-comments-heading" }, "댓글"),
        commentsEl,
        commentForm
      ),
      h(
        "section",
        { class: "stack", "aria-labelledby": "detail-events-heading" },
        h("h3", { id: "detail-events-heading" }, "변경 이력"),
        eventsEl
      )
    ];
    const unsubscribe = subscribeStore(() => {
      renderFields();
      renderEvents();
    });
    const handle = openDialog({ title: "할일 상세", body, wide: true, onClosed: unsubscribe });
    renderFields();
    renderComments();
    renderEvents();
  }

  // js/views/calendarView.js
  var MAX_PER_CELL = 3;
  var WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  var mobileQuery = window.matchMedia("(max-width: 639px)");
  var selectedDay = null;
  var dayLabel = (key) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;
  var dayNumber = (key) => Number(key.slice(8, 10));
  var monthNumber = (key) => Number(key.slice(5, 7));
  var newTaskOn = (dateKey) => openTaskForm({ defaults: { due_date: dateKey } });
  function taskButton(task, today, keyPrefix) {
    return h(
      "button",
      {
        type: "button",
        class: `cal-task cal-task--${task.status}`,
        "data-focus-key": `${keyPrefix}-${task.id}`,
        onClick: (event) => {
          event.stopPropagation();
          openTaskDetail(task.id);
        }
      },
      h("span", { class: "cal-task__title" }, task.title),
      urgencyBadge(getUrgency(task, today))
    );
  }
  function openDayDialog(dateKey, tasks, today) {
    const handle = openDialog({
      title: `${dayLabel(dateKey)} 할일 ${tasks.length}건`,
      body: [
        h("ul", { class: "day-list" }, ...tasks.map((t) => h("li", { class: "row" }, statusBadge(t.status), taskButton(t, today, "day")))),
        h(
          "div",
          { class: "row dialog__actions" },
          h("button", { type: "button", class: "btn btn--primary", onClick: () => {
            handle.close();
            newTaskOn(dateKey);
          } }, "이 날짜로 새 할일"),
          h("button", { type: "button", class: "btn btn--secondary", onClick: () => handle.close() }, "닫기")
        )
      ]
    });
  }
  function desktopCell(dateKey, tasks, { month, today }) {
    const shown = tasks.slice(0, MAX_PER_CELL);
    const more = tasks.length - shown.length;
    return h(
      "td",
      {
        class: `cal-cell${monthOf(dateKey) !== month ? " cal-cell--other" : ""}${dateKey === today ? " cal-cell--today" : ""}`,
        onClick: (event) => {
          if (event.target === event.currentTarget) newTaskOn(dateKey);
        }
      },
      h("button", {
        type: "button",
        class: "cal-date",
        "data-focus-key": `cal-date-${dateKey}`,
        // 접근 가능한 이름은 눈에 보이는 날짜 숫자로 시작해야 한다(WCAG 2.5.3 Label in Name).
        "aria-label": `${dayNumber(dateKey)}, ${monthNumber(dateKey)}월 새 할일 등록${dateKey === today ? " (오늘)" : ""}`,
        onClick: (event) => {
          event.stopPropagation();
          newTaskOn(dateKey);
        }
      }, String(Number(dateKey.slice(8, 10)))),
      ...shown.map((t) => taskButton(t, today, "cal")),
      more > 0 && h("button", {
        type: "button",
        class: "cal-more",
        "data-focus-key": `cal-more-${dateKey}`,
        "aria-label": `+${more}개 더 보기, ${dayLabel(dateKey)}`,
        onClick: (event) => {
          event.stopPropagation();
          openDayDialog(dateKey, tasks, today);
        }
      }, `+${more}개`)
    );
  }
  function mobileCell(dateKey, tasks, { month, today }) {
    return h(
      "td",
      { class: `cal-cell${monthOf(dateKey) !== month ? " cal-cell--other" : ""}${dateKey === today ? " cal-cell--today" : ""}` },
      h("button", {
        type: "button",
        class: "cal-date",
        "data-focus-key": `cal-date-${dateKey}`,
        "aria-pressed": String(dateKey === selectedDay),
        "data-count": tasks.length > 0 ? String(tasks.length) : null,
        "aria-label": `${dayNumber(dateKey)}, ${monthNumber(dateKey)}월, 할일 ${tasks.length}건${dateKey === today ? " (오늘)" : ""}`,
        onClick: () => {
          selectedDay = dateKey;
          renderCalendarView(document.getElementById("view-root"));
        }
      }, String(Number(dateKey.slice(8, 10))))
    );
  }
  function renderCalendarView(root) {
    const { month } = getState();
    const today = todayKst();
    const { byDate, noDue } = groupByDue(getVisibleTasks());
    const grid = buildMonthGrid(month);
    const mobile = mobileQuery.matches;
    const { year, month: monthNumber2 } = parseMonthKey(month);
    const context = { month, today };
    if (mobile && (!selectedDay || monthOf(selectedDay) !== month)) {
      selectedDay = monthOf(today) === month ? today : `${month}-01`;
    }
    preserveFocus(() => {
      const nav = h(
        "div",
        { class: "cal-nav row" },
        h("button", { type: "button", class: "btn btn--secondary", "aria-label": "이전 달", onClick: () => setMonth(addMonths(month, -1)) }, "‹"),
        h("h2", { class: "cal-title", "aria-live": "polite" }, `${year}년 ${monthNumber2}월`),
        h("button", { type: "button", class: "btn btn--secondary", "aria-label": "다음 달", onClick: () => setMonth(addMonths(month, 1)) }, "›"),
        h("button", { type: "button", class: "btn btn--secondary", onClick: () => setMonth(monthOf(today)) }, "오늘")
      );
      const table = h(
        "table",
        { class: `cal-grid${mobile ? " cal-grid--mobile" : ""}` },
        h("caption", { class: "visually-hidden" }, `${year}년 ${monthNumber2}월 마감일 캘린더`),
        h("thead", null, h("tr", null, ...WEEKDAYS.map((d) => h("th", { scope: "col" }, d)))),
        h("tbody", null, ...grid.map((week) => h("tr", null, ...week.map((key) => (mobile ? mobileCell : desktopCell)(key, byDate.get(key) ?? [], context)))))
      );
      const selectedTasks = mobile ? byDate.get(selectedDay) ?? [] : [];
      const dayPanel = mobile && h(
        "section",
        { class: "card stack", "aria-labelledby": "cal-day-heading" },
        h("h3", { id: "cal-day-heading" }, `${dayLabel(selectedDay)} 할일 ${selectedTasks.length}건`),
        selectedTasks.length ? h("ul", { class: "day-list" }, ...selectedTasks.map((t) => h("li", { class: "row" }, statusBadge(t.status), taskButton(t, today, "day")))) : h("p", { class: "muted" }, "이 날짜에 마감인 할일이 없습니다."),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn btn--primary", onClick: () => newTaskOn(selectedDay) }, "이 날짜로 새 할일"))
      );
      const noDueSection = h(
        "section",
        { class: "card stack", "aria-labelledby": "cal-nodue-heading" },
        h("h3", { id: "cal-nodue-heading" }, `마감일 없음 (${noDue.length}건)`),
        noDue.length ? h("ul", { class: "day-list" }, ...noDue.map((t) => h(
          "li",
          { class: "row" },
          statusBadge(t.status),
          taskButton(t, today, "nodue"),
          h("span", { class: "muted" }, memberName(memberById(t.assignee_id)) || "미배정")
        ))) : h("p", { class: "muted" }, "마감일이 없는 할일이 없습니다.")
      );
      root.replaceChildren(h("div", { class: "stack" }, nav, table, dayPanel || "", noDueSection));
    });
  }
  mobileQuery.addEventListener("change", () => {
    if (getState().view === "calendar") setState({});
  });

  // js/views/dashboardView.js
  init_date();

  // js/domain/stats.js
  init_date();
  var INCOMPLETE = ["todo", "in_progress"];
  var HISTORY_LIMIT = 20;
  var round1 = (n) => Math.round(n * 10) / 10;
  function computeStats(tasks, members, today, { overloadThreshold = 8 } = {}) {
    const live = tasks.filter((t) => !t.deleted_at);
    const incomplete = live.filter((t) => INCOMPLETE.includes(t.status));
    const counts = { todo: 0, in_progress: 0, done: 0 };
    for (const t of live) counts[t.status] += 1;
    const completionRate = live.length ? round1(counts.done / live.length * 100) : null;
    const load = /* @__PURE__ */ new Map();
    for (const t of incomplete) load.set(t.assignee_id ?? null, (load.get(t.assignee_id ?? null) ?? 0) + 1);
    const nameOf = new Map(members.map((m) => [m.id, m]));
    const workload = [...load.entries()].map(([id, count]) => ({
      assigneeId: id,
      member: id ? nameOf.get(id) ?? null : null,
      count,
      overload: count >= overloadThreshold
    })).sort((a, b) => b.count - a.count || (a.assigneeId === null) - (b.assigneeId === null));
    let soon = 0;
    let overdue = 0;
    for (const t of incomplete) {
      const u = getUrgency(t, today);
      if (u?.kind === "soon") soon += 1;
      else if (u?.kind === "overdue") overdue += 1;
    }
    const overdueRate = incomplete.length ? round1(overdue / incomplete.length * 100) : null;
    const completed = live.filter((t) => t.status === "done" && t.completed_at);
    const history2 = [...completed].sort((a, b) => a.completed_at < b.completed_at ? 1 : -1).slice(0, HISTORY_LIMIT);
    const since = addDays(today, -6);
    const keyOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(iso));
    const completedLast7Days = completed.filter((t) => keyOf(t.completed_at) >= since).length;
    return {
      total: live.length,
      incompleteCount: incomplete.length,
      counts,
      completionRate,
      workload,
      soon,
      overdue,
      overdueRate,
      history: history2,
      completedLast7Days
    };
  }

  // js/views/dashboardView.js
  var BAR_WIDTH = 100;
  var BAR_HEIGHT = 8;
  var INCOMPLETE2 = ["todo", "in_progress"];
  function goToList(patch) {
    const { filters } = getState();
    setState({ view: "list", filters: { ...filters, ...patch }, page: 0 });
  }
  var percent = (value) => value === null ? "–" : `${value}%`;
  function bar(ratio, modifier = "") {
    const width = Math.max(0, Math.min(1, ratio)) * BAR_WIDTH;
    return svg(
      "svg",
      { class: "bar", viewBox: `0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
      svg("rect", { class: "bar__track", x: 0, y: 0, width: BAR_WIDTH, height: BAR_HEIGHT, rx: 2 }),
      width > 0 && svg("rect", { class: `bar__fill ${modifier}`, x: 0, y: 0, width, height: BAR_HEIGHT, rx: 2 })
    );
  }
  function stackedBar(counts, total) {
    let x = 0;
    const segments = ["todo", "in_progress", "done"].map((status) => {
      const width = total ? counts[status] / total * BAR_WIDTH : 0;
      const rect = width > 0 && svg("rect", { class: `bar__fill bar__fill--${status}`, x, y: 0, width, height: BAR_HEIGHT });
      x += width;
      return rect;
    });
    return svg(
      "svg",
      { class: "bar", viewBox: `0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" },
      svg("rect", { class: "bar__track", x: 0, y: 0, width: BAR_WIDTH, height: BAR_HEIGHT, rx: 2 }),
      ...segments
    );
  }
  function metricCard({ id, title, value, note, onClick, disabled }) {
    const label = h("span", { class: "metric__label" }, title);
    const number = h("span", { class: "metric__value", "data-metric": id }, value);
    const body = [label, number, note && h("span", { class: "metric__note" }, note)];
    if (onClick) body.push(h("span", { class: "visually-hidden" }, " 눌러서 리스트에서 보기"));
    return onClick ? h("button", {
      type: "button",
      class: "metric metric--action card",
      "data-focus-key": `metric-${id}`,
      disabled,
      onClick
    }, ...body) : h("div", { class: "metric card" }, ...body);
  }
  function workloadRow(row2, threshold) {
    const name = row2.assigneeId ? memberName(row2.member) || "알 수 없음" : "미배정";
    const target = row2.assigneeId ?? UNASSIGNED;
    const max = Math.max(threshold, row2.count);
    return h(
      "li",
      { class: "workload__row" },
      h(
        "button",
        {
          type: "button",
          class: "workload__name link-btn",
          "data-focus-key": `workload-${target}`,
          "aria-label": `${name} 미완료 ${row2.count}건${row2.overload ? " 과부하" : ""}. 눌러서 리스트에서 보기`,
          onClick: () => {
            const current = getState().filters.status.filter((s) => INCOMPLETE2.includes(s));
            goToList({ assignee: [target], status: current.length ? current : INCOMPLETE2 });
          }
        },
        name
      ),
      bar(row2.count / max, row2.overload ? "bar__fill--overload" : ""),
      h("span", { class: "workload__count" }, `${row2.count}건`),
      row2.overload && h("span", { class: "badge badge--priority-high" }, "과부하")
    );
  }
  function renderDashboardView(root) {
    const { config, loading } = getState();
    const stats = computeStats(getVisibleTasks(), getState().members, todayKst(), {
      overloadThreshold: config?.overloadThreshold ?? 8
    });
    const threshold = config?.overloadThreshold ?? 8;
    const statusCard = (status) => metricCard({
      id: status,
      title: STATUS_LABEL[status],
      value: String(stats.counts[status]),
      disabled: stats.counts[status] === 0,
      onClick: () => goToList({ status: [status] })
    });
    preserveFocus(() => {
      if (loading) return root.replaceChildren(h("div", { class: "skeleton-list", "aria-busy": "true" }, h("div", { class: "skeleton" })));
      root.replaceChildren(
        h(
          "div",
          { class: "dashboard stack" },
          h(
            "section",
            { class: "stack", "aria-labelledby": "dash-status" },
            h("h2", { id: "dash-status", class: "section-title" }, "상태별 현황"),
            h("div", { class: "metric-grid" }, statusCard("todo"), statusCard("in_progress"), statusCard("done")),
            h(
              "div",
              { class: "card stack" },
              stackedBar(stats.counts, stats.total),
              h("p", { class: "muted" }, `전체 ${stats.total}건 — 할 일 ${stats.counts.todo} · 진행 중 ${stats.counts.in_progress} · 완료 ${stats.counts.done}`)
            )
          ),
          h(
            "div",
            { class: "metric-grid" },
            h(
              "div",
              { class: "metric card stack" },
              h("span", { class: "metric__label" }, "완료율"),
              h("span", { class: "metric__value", "data-metric": "completion" }, percent(stats.completionRate)),
              bar((stats.completionRate ?? 0) / 100, "bar__fill--done")
            ),
            metricCard({
              id: "soon",
              title: "마감 임박",
              value: String(stats.soon),
              note: "D-3 ~ D-day",
              disabled: stats.soon === 0,
              onClick: () => goToList({ urgency: ["soon"] })
            }),
            metricCard({
              id: "overdue",
              title: "지연",
              value: String(stats.overdue),
              note: `지연 비율 ${percent(stats.overdueRate)}`,
              disabled: stats.overdue === 0,
              onClick: () => goToList({ urgency: ["overdue"] })
            })
          ),
          h(
            "section",
            { class: "card stack", "aria-labelledby": "dash-load" },
            h("h2", { id: "dash-load", class: "section-title" }, "담당자별 부하(미완료)"),
            stats.workload.length ? h("ul", { class: "workload" }, ...stats.workload.map((row2) => workloadRow(row2, threshold))) : h("p", { class: "muted" }, "미완료 할일이 없습니다."),
            h("p", { class: "muted" }, `${threshold}건 이상이면 「과부하」로 표시합니다.`)
          ),
          h(
            "section",
            { class: "card stack", "aria-labelledby": "dash-history" },
            h("h2", { id: "dash-history", class: "section-title" }, "완료 이력"),
            h("p", { "data-metric": "last7" }, `최근 7일 완료 ${stats.completedLast7Days}건`),
            stats.history.length ? h("ol", { class: "history" }, ...stats.history.map((t) => h(
              "li",
              { class: "row" },
              h("button", { type: "button", class: "link-btn", "data-focus-key": `history-${t.id}`, onClick: () => openTaskDetail(t.id) }, t.title),
              h("span", { class: "muted" }, `${memberName(memberById(t.assignee_id)) || "미배정"} · ${formatDateTime(t.completed_at)}`)
            ))) : h("p", { class: "muted" }, "완료된 할일이 없습니다.")
          )
        )
      );
    });
  }

  // js/views/kanbanView.js
  init_date();
  init_validation();

  // js/ui/taskParts.js
  function statusSelect(task, keyPrefix = "status") {
    return h(
      "select",
      {
        class: "field__input field__input--compact",
        "aria-label": `상태 변경: ${task.title}`,
        "data-focus-key": `${keyPrefix}-${task.id}`,
        value: task.status,
        onChange: (event) => changeStatus(task, event.target.value)
      },
      ...Object.entries(STATUS_LABEL).map(([value, text]) => option(value, text))
    );
  }
  function remoteMark(task) {
    const mark = getState().remoteMarks[task.id];
    return mark ? h("span", { class: "remote-mark", role: "status" }, `${mark.by}님이 수정함`) : null;
  }

  // js/views/kanbanView.js
  var COLUMN_LIMIT = 100;
  var expanded = /* @__PURE__ */ new Set();
  function card(task, today) {
    const assignee = memberName(memberById(task.assignee_id)) || "미배정";
    return h(
      "li",
      {
        class: "kanban-card card",
        draggable: "true",
        "data-task-id": task.id,
        onDragstart: (event) => {
          event.dataTransfer.setData("text/plain", task.id);
          event.dataTransfer.effectAllowed = "move";
          event.currentTarget.classList.add("is-dragging");
        },
        onDragend: (event) => event.currentTarget.classList.remove("is-dragging")
      },
      h("div", { class: "row" }, priorityBadge(task.priority), urgencyBadge(getUrgency(task, today))),
      h("button", {
        type: "button",
        class: "link-btn",
        "data-focus-key": `open-${task.id}`,
        onClick: () => openTaskDetail(task.id)
      }, task.title),
      h("p", { class: "muted kanban-card__meta" }, `${assignee} · ${task.due_date ?? "마감일 없음"}`),
      remoteMark(task),
      statusSelect(task, "kanban-status")
    );
  }
  function column(status, tasks, today, onColumnDone) {
    const headingId = `kanban-heading-${status}`;
    const shown = expanded.has(status) ? tasks : tasks.slice(0, COLUMN_LIMIT);
    const hidden = tasks.length - shown.length;
    const body = h("ul", { class: "kanban-col__body" });
    const moreButton = hidden > 0 && h(
      "li",
      null,
      h("button", {
        type: "button",
        class: "btn btn--secondary",
        "data-focus-key": `kanban-more-${status}`,
        onClick: () => {
          expanded.add(status);
          renderKanbanView(document.getElementById("view-root"));
        }
      }, `${hidden}건 더 보기`)
    );
    const section = h(
      "section",
      {
        class: "kanban-col",
        "data-status": status,
        "aria-labelledby": headingId,
        onDragover: (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          section.classList.add("is-over");
        },
        onDragleave: (event) => {
          if (!section.contains(event.relatedTarget)) section.classList.remove("is-over");
        },
        onDrop: (event) => {
          event.preventDefault();
          section.classList.remove("is-over");
          const task = getState().tasks.find((t) => t.id === event.dataTransfer.getData("text/plain"));
          if (task) changeStatus(task, status);
        }
      },
      h(
        "h3",
        { class: "kanban-col__head", id: headingId },
        STATUS_LABEL[status],
        " ",
        h("span", { class: `badge badge--status-${status}`, "aria-label": `${tasks.length}건` }, String(tasks.length))
      ),
      body
    );
    if (!tasks.length) body.append(h("li", { class: "muted kanban-empty" }, "항목 없음"));
    else renderProgressive(body, shown, (t) => card(t, today), { first: 15, chunk: 30, onDone: () => {
      if (moreButton) body.append(moreButton);
      onColumnDone?.();
    } });
    return section;
  }
  function renderKanbanView(root) {
    const visible = getVisibleTasks();
    const today = todayKst();
    const sorted = sortTasks(visible, { key: "priority", dir: "asc" }, (id) => memberById(id)?.name ?? null);
    const restoreFocus = captureFocus();
    root.replaceChildren(
      h("div", { class: "kanban" }, ...STATUSES.map((s) => column(s, sorted.filter((t) => t.status === s), today, restoreFocus)))
    );
    restoreFocus();
  }

  // js/views/listView.js
  init_date();
  var PAGE_SIZE = 200;
  var COLUMNS = [
    { key: "title", label: "제목" },
    { key: "status", label: "상태" },
    { key: "priority", label: "우선순위" },
    { key: "assignee", label: "담당자" },
    { key: "category", label: "카테고리" },
    { key: "due_date", label: "마감일" }
  ];
  function setSort(key) {
    const { sort } = getState();
    setState({
      sort: { key, dir: sort.key === key && sort.dir === "asc" ? "desc" : "asc" },
      page: 0
    });
  }
  function skeleton() {
    return h(
      "div",
      { class: "skeleton-list", "aria-busy": "true", "aria-label": "목록을 불러오는 중" },
      ...Array.from({ length: 5 }, () => h("div", { class: "skeleton" }))
    );
  }
  function emptyState() {
    if (hasActiveCriteria()) {
      return h(
        "div",
        { class: "empty-state card stack" },
        h("p", null, "조건에 맞는 할일이 없습니다."),
        h("div", { class: "row" }, h("button", { type: "button", class: "btn btn--secondary", onClick: clearAll }, "모두 해제"))
      );
    }
    return h(
      "div",
      { class: "empty-state card stack" },
      h("p", null, "등록된 할일이 없습니다."),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn btn--primary", onClick: () => openTaskForm() }, "새 할일"))
    );
  }
  function sortControls(sort) {
    return h(
      "div",
      { class: "sort-mobile field" },
      h("label", { class: "field__label", for: "sort-select" }, "정렬"),
      h(
        "div",
        { class: "row" },
        h(
          "select",
          { id: "sort-select", class: "field__input", value: sort.key, onChange: (e) => setState({ sort: { key: e.target.value, dir: "asc" }, page: 0 }) },
          ...COLUMNS.map((c) => option(c.key, c.label))
        ),
        h("button", {
          type: "button",
          class: "btn btn--secondary",
          "aria-label": sort.dir === "asc" ? "오름차순 (눌러서 내림차순으로 변경)" : "내림차순 (눌러서 오름차순으로 변경)",
          onClick: () => setState({ sort: { ...sort, dir: sort.dir === "asc" ? "desc" : "asc" } })
        }, sort.dir === "asc" ? "↑" : "↓")
      )
    );
  }
  function row(task, today) {
    const assignee = memberName(memberById(task.assignee_id));
    return h(
      "tr",
      { class: "task-row", onClick: (e) => {
        if (!e.target.closest("select, button")) openTaskDetail(task.id);
      } },
      h(
        "td",
        { "data-label": "제목", class: "task-row__title" },
        h("button", { type: "button", class: "link-btn", "data-focus-key": `open-${task.id}`, onClick: () => openTaskDetail(task.id) }, task.title),
        remoteMark(task)
      ),
      h("td", { "data-label": "상태" }, statusSelect(task)),
      h("td", { "data-label": "우선순위" }, priorityBadge(task.priority)),
      h("td", { "data-label": "담당자" }, assignee || "미배정"),
      h("td", { "data-label": "카테고리" }, task.category ?? ""),
      h("td", { "data-label": "마감일" }, task.due_date ?? "없음", " ", urgencyBadge(getUrgency(task, today)))
    );
  }
  function renderListView(root) {
    const { loading, sort, page } = getState();
    const tasks = getVisibleTasks();
    const restoreFocus = captureFocus();
    const draw = () => {
      if (loading) return root.replaceChildren(skeleton());
      if (!tasks.length) return root.replaceChildren(emptyState());
      const today = todayKst();
      const sorted = sortTasks(tasks, sort, (id) => memberById(id)?.name ?? null);
      const pages = Math.ceil(sorted.length / PAGE_SIZE);
      const current = Math.min(page, pages - 1);
      const visible = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
      const ariaSort = (key) => sort.key === key ? sort.dir === "asc" ? "ascending" : "descending" : "none";
      const tbody = h("tbody");
      const table = h(
        "table",
        { class: "task-table" },
        h("caption", { class: "visually-hidden" }, `할일 ${sorted.length}건`),
        h("thead", null, h("tr", null, ...COLUMNS.map((c) => h(
          "th",
          { scope: "col", "aria-sort": ariaSort(c.key) },
          h(
            "button",
            { type: "button", class: "sort-btn", "data-focus-key": `sort-${c.key}`, onClick: () => setSort(c.key) },
            c.label,
            sort.key === c.key ? sort.dir === "asc" ? " ▲" : " ▼" : ""
          )
        )))),
        tbody
      );
      const pager = pages > 1 && h(
        "nav",
        { class: "row pager", "aria-label": "페이지" },
        h("button", { type: "button", class: "btn btn--secondary", disabled: current === 0, onClick: () => setState({ page: current - 1 }) }, "이전"),
        h("span", null, `${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + visible.length} / ${sorted.length}건`),
        h("button", { type: "button", class: "btn btn--secondary", disabled: current >= pages - 1, onClick: () => setState({ page: current + 1 }) }, "다음")
      );
      root.replaceChildren(sortControls(sort), table, pager || "");
      renderProgressive(tbody, visible, (t) => row(t, today), { first: 40, chunk: 40, onDone: restoreFocus });
    };
    draw();
    restoreFocus();
  }

  // js/main.js
  var RENDERERS = {
    list: renderListView,
    kanban: renderKanbanView,
    calendar: renderCalendarView,
    dashboard: renderDashboardView
  };
  function loadConfig() {
    return { ...defaultConfig_default, ...window.TODO_CONFIG ?? {} };
  }
  function restoreFromUrl() {
    const { view, query, filters, month } = parseUrlState(location.search);
    setState({ view, query, filters, ...month && { month } });
  }
  function syncUrl() {
    const search = buildSearch(getState());
    if (search !== location.search) history.replaceState(null, "", `${location.pathname}${search}`);
  }
  function wireTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const panel = document.getElementById("view-root");
    tabs.forEach((tab) => tab.addEventListener("click", () => setView(tab.dataset.view)));
    document.querySelector('[role="tablist"]').addEventListener("keydown", (event) => {
      const enabled = tabs.filter((t) => !t.disabled);
      const index = enabled.indexOf(document.activeElement);
      const next = {
        ArrowRight: enabled[(index + 1) % enabled.length],
        ArrowLeft: enabled[(index - 1 + enabled.length) % enabled.length],
        Home: enabled[0],
        End: enabled[enabled.length - 1]
      }[event.key];
      if (!next || index < 0) return;
      event.preventDefault();
      next.focus();
      setView(next.dataset.view);
    });
    return () => {
      const { view } = getState();
      for (const tab of tabs) {
        const selected = tab.dataset.view === view;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected) {
          tab.setAttribute("aria-current", "page");
          panel.setAttribute("aria-labelledby", tab.id);
        } else {
          tab.removeAttribute("aria-current");
        }
      }
    };
  }
  function wireShell() {
    const viewRoot = document.getElementById("view-root");
    const userLabel = document.getElementById("current-user");
    const heading = document.getElementById("view-heading");
    document.getElementById("new-task").addEventListener("click", () => openTaskForm());
    document.getElementById("change-user").addEventListener("click", () => openIdentityDialog({ closable: true }));
    const syncTabs = wireTabs();
    initFilterBar({
      panel: document.getElementById("filter-panel"),
      toggle: document.getElementById("filter-toggle"),
      searchInput: document.getElementById("search"),
      chips: document.getElementById("filter-chips"),
      count: document.getElementById("result-count"),
      content: document.getElementById("content")
    });
    const render = () => {
      const { currentUser, view } = getState();
      userLabel.textContent = currentUser ? memberName(currentUser) : "";
      syncTabs();
      syncUrl();
      heading.textContent = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? "";
      (RENDERERS[view] ?? renderListView)(viewRoot);
    };
    subscribeStore(render);
    render();
  }
  async function start() {
    if (window.__unsupportedBrowser) return;
    const config = loadConfig();
    setState({ config });
    restoreFromUrl();
    await configureTaskApi(config);
    wireShell();
    await reloadMembers();
    await ensureCurrentUser();
    await reloadTasks();
    const realtime = startRealtime({
      banner: document.getElementById("connection-status"),
      pollMs: config.pollIntervalMs ?? 3e4
    });
    if (config.adapter === "local") {
      window.__todoTest = {
        setConnected: (online) => getAdapter().setConnected(online),
        setPollInterval: realtime.setPollInterval,
        criteria: { setQuery, toggleFilter, clearAll },
        taskApi
      };
    }
  }
  start().catch((err) => {
    console.error(err);
    setState({ loading: false });
    showError(`앱을 시작하지 못했습니다. (${err.message})`);
  });
})();
