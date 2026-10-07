import { h } from './dom.js';

/** 하단 알림. 실행 취소 같은 동작 버튼을 달 수 있다. aria-live 영역은 index.html에 있다. */
export function showToast({ message, actionLabel, onAction, kind = 'info', timeout = 5000 }) {
  const region = document.getElementById('toast-region');
  const toast = h('div', { class: `toast toast--${kind}` }, h('span', null, message));
  const remove = () => toast.remove();
  if (actionLabel) {
    toast.append(
      h('button', {
        type: 'button',
        class: 'btn btn--secondary toast__action',
        onClick: () => {
          remove();
          onAction?.();
        },
      }, actionLabel),
    );
  }
  region.append(toast);
  if (timeout) setTimeout(remove, timeout);
  return remove;
}

export const showError = (message) => showToast({ message, kind: 'error', timeout: 8000 });
