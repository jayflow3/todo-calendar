// 할일 작성·수정 폼(대화상자). 수정 시에는 바뀐 필드만 전송한다(PRD 6.3).
import { taskApi } from '../api/taskApi.js';
import { conflictingFields } from '../domain/diff.js';
import { validateTask, ValidationError } from '../domain/validation.js';
import { activeMembers, reloadTasks } from '../state/actions.js';
import { FIELD_LABEL, formatFieldValue } from '../state/remote.js';
import { getState, memberById, subscribeStore } from '../state/store.js';
import { openDialog } from './dialog.js';
import { memberName } from './labels.js';
import { h } from './dom.js';
import { errorSummary, field, option } from './form.js';
import { PRIORITY_LABEL, STATUS_LABEL } from './labels.js';
import { showToast } from './toast.js';

const FIELD_ORDER = ['title', 'description', 'status', 'priority', 'assignee_id', 'category', 'due_date'];

/**
 * @param {{task?: object, defaults?: object}} opts  task가 있으면 수정, 없으면 등록(defaults로 초기값 지정)
 * @returns {Promise<object|null>} 저장된 할일. 취소하면 null.
 */
export function openTaskForm({ task = null, defaults = {} } = {}) {
  return new Promise((resolve) => {
    const isEdit = Boolean(task);
    const initial = {
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      assignee_id: null,
      category: '기타',
      due_date: null,
      ...defaults,
      ...(task ?? {}),
    };
    let saved = null;
    let submitting = false;

    const categories = getState().config.categories;
    // 이미 저장된 카테고리가 목록에 없어도 값이 사라지지 않게 한다.
    const categoryOptions = categories.includes(initial.category) ? categories : [initial.category, ...categories];
    const assignees = activeMembers();
    if (initial.assignee_id && !assignees.some((m) => m.id === initial.assignee_id)) {
      const gone = getState().members.find((m) => m.id === initial.assignee_id);
      if (gone) assignees.push(gone);
    }

    const f = {
      title: field({
        label: '제목',
        required: true,
        hint: '100자 이하',
        control: h('input', { type: 'text', value: initial.title, maxlength: 200, 'data-autofocus': '' }),
      }),
      description: field({
        label: '설명',
        hint: '2000자 이하, 일반 텍스트',
        control: h('textarea', { rows: 4, value: initial.description ?? '' }),
      }),
      status: field({
        label: '상태',
        control: h('select', { value: initial.status }, ...Object.entries(STATUS_LABEL).map(([v, t]) => option(v, t))),
      }),
      priority: field({
        label: '우선순위',
        control: h('select', { value: initial.priority }, ...Object.entries(PRIORITY_LABEL).map(([v, t]) => option(v, t))),
      }),
      assignee_id: field({
        label: '담당자',
        control: h(
          'select',
          { value: initial.assignee_id ?? '' },
          option('', '미배정'),
          ...assignees.map((m) => option(m.id, memberName(m))),
        ),
      }),
      category: field({
        label: '카테고리',
        control: h('select', { value: initial.category }, ...categoryOptions.map((c) => option(c, c))),
      }),
      due_date: field({
        label: '마감일',
        control: h('input', { type: 'date', value: initial.due_date ?? '' }),
      }),
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
        due_date: f.due_date.control.value || null,
      };
    }

    function showErrors(errors) {
      const names = Object.keys(errors);
      for (const name of FIELD_ORDER) f[name]?.setError(errors[name] ?? null);
      summary.show(names.length ? `입력 내용을 확인하세요 (오류 ${names.length}개)` : null);
      const first = FIELD_ORDER.find((n) => errors[n]);
      if (first) f[first].control.focus();
    }

    /** 수정이면 바뀐 필드만 골라낸다. */
    function diff(values) {
      const normalize = (name, value) => {
        if (name === 'title') return String(value ?? '').trim();
        if (name === 'description') return String(value ?? '').trim() || null;
        return value || null;
      };
      const changes = {};
      for (const name of FIELD_ORDER) {
        if (normalize(name, initial[name]) !== normalize(name, values[name])) changes[name] = values[name];
      }
      return changes;
    }

    /** 같은 필드를 동시에 수정했을 때 덮어쓰기 / 서버 값 사용을 고르게 한다. null이면 취소. */
    function askConflict(current, fields) {
      return new Promise((resolve) => {
        let choice = null;
        const rows = fields.map((name) =>
          h('li', null, `${FIELD_LABEL[name]}: 서버 값 「${formatFieldValue(name, current[name])}」 / 내 값 「${formatFieldValue(name, values_[name])}」`));
        const by = memberName(memberById(current.updated_by)) || '다른 사람';
        const pick = (value) => () => { choice = value; ask.close(value); };
        const ask = openDialog({
          title: '다른 사람이 먼저 수정했습니다',
          body: [
            h('p', null, `${by}님이 같은 항목을 먼저 수정했습니다.`),
            h('ul', null, ...rows),
            h('div', { class: 'row dialog__actions' },
              h('button', { type: 'button', class: 'btn btn--primary', 'data-autofocus': '', onClick: pick('overwrite') }, '덮어쓰기'),
              h('button', { type: 'button', class: 'btn btn--secondary', onClick: pick('server') }, '서버 값 사용'),
              h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => ask.close('cancel') }, '취소')),
          ],
          onClosed: () => resolve(choice),
        });
      });
    }

    let values_ = {};

    /**
     * 수정 저장. 서버의 updated_at이 편집창을 연 뒤 달라졌어도, 내가 바꾼 필드를 다른 사람이 건드리지 않았다면
     * 충돌이 아니므로 그대로 병합한다(필드 단위 last-write-wins). 같은 필드를 바꿨을 때만 사용자에게 묻는다.
     */
    async function saveEdit(changes) {
      try {
        return await taskApi.updateTask(task.id, changes, { expectedUpdatedAt: initial.updated_at });
      } catch (err) {
        if (err.code !== 'CONFLICT') throw err;
        const clash = conflictingFields(initial, err.current, changes);
        if (!clash.length) return taskApi.updateTask(task.id, changes);
        const decision = await askConflict(err.current, clash);
        if (decision === 'overwrite') return taskApi.updateTask(task.id, changes);
        if (decision === 'server') {
          await reloadTasks();
          showToast({ message: '서버의 최신 값을 사용했습니다' });
          return 'server';
        }
        return null; // 취소: 편집창을 그대로 둔다
      }
    }

    async function submit(event) {
      event.preventDefault();
      if (submitting) return;
      const values = readValues();
      values_ = values;
      try {
        validateTask(values); // 같은 규칙을 DB도 강제한다. 여기서는 빠른 피드백용
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
          if (!Object.keys(changes).length) return handle.close('cancel');
          result = await saveEdit(changes);
          if (result === null) return; // 충돌 확인에서 취소
          if (result === 'server') return handle.close('server');
        } else {
          result = await taskApi.createTask(values);
        }
        saved = result;
        await reloadTasks();
        showToast({ message: isEdit ? '저장했습니다' : '할일을 등록했습니다' });
        handle.close('saved');
      } catch (err) {
        if (err instanceof ValidationError) return showErrors(err.errors);
        const message =
          err.code === 'DELETED' ? '이미 삭제된 항목입니다.' // 수정과 삭제가 겹치면 삭제가 우선한다
          : `저장하지 못했습니다. 잠시 후 다시 시도하세요. (${err.message})`;
        summary.show(message);
        if (err.code === 'DELETED') saveButton.disabled = true;
      } finally {
        submitting = false;
        if (!deleted) saveButton.disabled = false;
      }
    }

    // 편집창이 열려 있는 동안 다른 사람이 바꾸거나 삭제하면 입력은 지우지 않고 안내만 띄운다.
    let deleted = false;
    const notice = h('p', { class: 'form-notice', role: 'status', hidden: true });
    function syncNotice() {
      if (!isEdit || submitting) return;
      const current = getState().tasks.find((t) => t.id === task.id);
      if (!current) {
        deleted = true;
        notice.hidden = false;
        notice.textContent = '이미 삭제된 항목입니다. 저장할 수 없습니다.';
        saveButton.disabled = true;
      } else if (current.updated_at !== initial.updated_at) {
        const by = memberName(memberById(current.updated_by)) || '다른 사람';
        notice.hidden = false;
        notice.textContent = `${by}님이 수정했습니다. 입력한 내용은 그대로 유지됩니다.`;
      }
    }
    const unsubscribe = subscribeStore(syncNotice);

    const saveButton = h('button', { type: 'submit', class: 'btn btn--primary' }, isEdit ? '저장' : '등록');
    const form = h(
      'form',
      { class: 'stack', novalidate: true, onSubmit: submit },
      notice,
      summary.el,
      f.title.el,
      f.description.el,
      h('div', { class: 'form-grid' }, f.status.el, f.priority.el, f.assignee_id.el, f.category.el, f.due_date.el),
      h(
        'div',
        { class: 'row dialog__actions' },
        saveButton,
        h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => handle.close('cancel') }, '취소'),
      ),
    );

    const handle = openDialog({
      title: isEdit ? '할일 수정' : '새 할일',
      body: form,
      onClosed: () => {
        unsubscribe();
        resolve(saved);
      },
    });
  });
}
