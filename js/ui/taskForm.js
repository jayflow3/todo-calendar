// 할일 작성·수정 폼(대화상자). 수정 시에는 바뀐 필드만 전송한다(PRD 6.3).
import { taskApi } from '../api/taskApi.js';
import { validateTask, ValidationError } from '../domain/validation.js';
import { activeMembers, reloadTasks } from '../state/actions.js';
import { getState } from '../state/store.js';
import { openDialog } from './dialog.js';
import { h } from './dom.js';
import { errorSummary, field, option } from './form.js';
import { memberName, PRIORITY_LABEL, STATUS_LABEL } from './labels.js';
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

    async function submit(event) {
      event.preventDefault();
      if (submitting) return;
      const values = readValues();
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
        if (isEdit) {
          const changes = diff(values);
          if (!Object.keys(changes).length) return handle.close('cancel');
          saved = await taskApi.updateTask(task.id, changes, { expectedUpdatedAt: task.updated_at });
        } else {
          saved = await taskApi.createTask(values);
        }
        await reloadTasks();
        showToast({ message: isEdit ? '저장했습니다' : '할일을 등록했습니다' });
        handle.close('saved');
      } catch (err) {
        if (err instanceof ValidationError) return showErrors(err.errors);
        const message =
          err.code === 'CONFLICT' ? '다른 사람이 먼저 수정했습니다. 창을 닫고 최신 내용을 확인한 뒤 다시 수정하세요.'
          : err.code === 'DELETED' ? '이미 삭제된 항목입니다.'
          : `저장하지 못했습니다. 잠시 후 다시 시도하세요. (${err.message})`;
        summary.show(message);
      } finally {
        submitting = false;
        saveButton.disabled = false;
      }
    }

    const saveButton = h('button', { type: 'submit', class: 'btn btn--primary' }, isEdit ? '저장' : '등록');
    const form = h(
      'form',
      { class: 'stack', novalidate: true, onSubmit: submit },
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
      onClosed: () => resolve(saved),
    });
  });
}
