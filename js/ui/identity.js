// 로그인 없는 작성자 식별(PRD 6.2). 이름은 본인 확인 수단이 아니다.
import { taskApi } from '../api/taskApi.js';
import { ValidationError } from '../domain/validation.js';
import { activeMembers, reloadMembers } from '../state/actions.js';
import { setState } from '../state/store.js';
import { openDialog } from './dialog.js';
import { h } from './dom.js';
import { errorSummary, field } from './form.js';
import { memberName } from './labels.js';

const STORAGE_KEY = 'todo.currentMemberId';

function readStoredId() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 저장소를 쓸 수 없으면 새로고침 때 다시 선택하게 된다.
  }
}

function adopt(member) {
  storeId(member.id);
  taskApi.setActor(member.id);
  setState({ currentUser: member });
}

/** 저장된 사용자가 유효하면 그대로 쓰고, 아니면 이름 입력 대화상자를 연다(닫을 수 없음). */
export async function ensureCurrentUser() {
  const stored = readStoredId();
  const found = stored && activeMembers().find((m) => m.id === stored);
  if (found) {
    adopt(found);
    return found;
  }
  return openIdentityDialog({ closable: false });
}

/** @returns {Promise<object|null>} 선택·등록된 부서원. 취소하면 null. */
export function openIdentityDialog({ closable }) {
  return new Promise((resolve) => {
    let chosen = null;
    const nameField = field({
      label: '이름',
      required: true,
      control: h('input', { type: 'text', autocomplete: 'off', list: 'member-names', maxlength: 40, 'data-autofocus': '' }),
    });
    const labelField = field({
      label: '구분용 라벨',
      hint: '동명이인이 있을 때만 팀·약칭을 입력하세요(최대 10자).',
      control: h('input', { type: 'text', autocomplete: 'off', maxlength: 20 }),
    });
    const summary = errorSummary();
    const datalist = h('datalist', { id: 'member-names' }, ...[...new Set(activeMembers().map((m) => m.name))].map((n) => h('option', { value: n })));

    async function submit(event) {
      event.preventDefault();
      nameField.setError(null);
      labelField.setError(null);
      summary.show(null);
      const name = nameField.control.value.trim();
      const label = labelField.control.value.trim() || null;
      if (!name) {
        nameField.setError('이름을 입력하세요');
        summary.show('입력 내용을 확인하세요 (오류 1개)');
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
        labelField.setError(`같은 이름이 ${sameName.length}명 있습니다. 라벨을 입력하세요 (${sameName.map(memberName).join(', ')})`);
        summary.show('입력 내용을 확인하세요 (오류 1개)');
        labelField.control.focus();
        return;
      }
      try {
        member ??= await taskApi.addMember({ name, label });
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
      handle.close('ok');
    }

    const form = h(
      'form',
      { class: 'stack', novalidate: true, onSubmit: submit },
      h('p', { class: 'notice' }, '이름은 본인 확인 수단이 아닙니다. 사내 구성원만 사용하세요.'),
      summary.el,
      nameField.el,
      labelField.el,
      datalist,
      h(
        'div',
        { class: 'row dialog__actions' },
        h('button', { type: 'submit', class: 'btn btn--primary' }, '확인'),
        closable && h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => handle.close('cancel') }, '취소'),
      ),
    );

    const handle = openDialog({
      title: closable ? '사용자 변경' : '이름을 입력하세요',
      body: form,
      closable,
      onClosed: () => resolve(chosen),
    });
  });
}
