// 네이티브 <dialog>.showModal()을 쓴다: 배경 비활성화(포커스 트랩)와 Esc 닫기를 브라우저가 처리한다.
// 닫을 때 열기 전에 포커스가 있던 요소로 돌려준다.
import { h, uid } from './dom.js';

/**
 * @param {{title: string, body: Node|Node[], closable?: boolean, onClosed?: Function, wide?: boolean}} opts
 * closable=false이면 Esc로도 닫히지 않는다(첫 방문 이름 입력).
 */
export function openDialog({ title, body, closable = true, onClosed, wide = false }) {
  const opener = document.activeElement;
  const openerKey = opener?.dataset?.focusKey;
  const titleId = uid('dialog-title');
  const dialog = h(
    'dialog',
    { class: `dialog${wide ? ' dialog--wide' : ''}`, 'aria-labelledby': titleId },
    h('div', { class: 'dialog__body stack' }, h('h2', { id: titleId, class: 'dialog__title' }, title), body),
  );

  dialog.addEventListener('cancel', (event) => {
    if (!closable) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    // 목록이 다시 그려져 원래 요소가 사라졌다면 data-focus-key로 다시 찾는다.
    const target = opener?.isConnected
      ? opener
      : openerKey && document.querySelector(`[data-focus-key="${CSS.escape(openerKey)}"]`);
    (target || document.getElementById('main'))?.focus();
    onClosed?.(dialog.returnValue);
  });

  document.body.append(dialog);
  dialog.showModal();
  // 첫 입력 요소(없으면 첫 버튼)로 포커스
  (dialog.querySelector('[data-autofocus]') ?? dialog.querySelector('input, select, textarea, button'))?.focus();

  return { dialog, close: (value = '') => dialog.close(value) };
}

/** 확인 대화상자. 확인하면 true. */
export function confirmDialog({ title, message, confirmLabel = '확인' }) {
  return new Promise((resolve) => {
    const body = [
      h('p', null, message),
      h(
        'div',
        { class: 'row dialog__actions' },
        h('button', { type: 'button', class: 'btn btn--primary', 'data-autofocus': '', onClick: () => handle.close('ok') }, confirmLabel),
        h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => handle.close('cancel') }, '취소'),
      ),
    ];
    const handle = openDialog({ title, body, onClosed: (value) => resolve(value === 'ok') });
  });
}
