import { h, uid } from './dom.js';

/**
 * 보이는 <label>과 연결된 입력 한 칸. 오류는 aria-describedby로 입력에 연결한다.
 * 필수 항목은 색이 아닌 텍스트 「(필수)」로 표시한다. placeholder는 라벨 대신 쓰지 않는다.
 */
export function field({ label, required = false, hint, control }) {
  const id = control.id || (control.id = uid('field'));
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const error = h('p', { class: 'field__error', id: errorId, hidden: true });
  const describedBy = [hint && hintId].filter(Boolean);
  if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
  if (required) control.setAttribute('aria-required', 'true');
  control.classList.add('field__input');

  const el = h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', for: id }, label, required && h('span', { class: 'field__required' }, ' (필수)')),
    control,
    hint && h('p', { class: 'field__hint', id: hintId }, hint),
    error,
  );

  return {
    el,
    control,
    setError(message) {
      error.hidden = !message;
      error.textContent = message ?? '';
      const ids = [...describedBy, message && errorId].filter(Boolean);
      if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
      else control.removeAttribute('aria-describedby');
      if (message) control.setAttribute('aria-invalid', 'true');
      else control.removeAttribute('aria-invalid');
    },
  };
}

/** 오류 요약(aria-live). 폼 위에 두고 summarize()로 갱신한다. */
export function errorSummary() {
  const el = h('p', { class: 'form-summary', role: 'alert', 'aria-live': 'assertive', hidden: true });
  return {
    el,
    show(message) {
      el.hidden = !message;
      el.textContent = message ?? '';
    },
  };
}

export const option = (value, text, selected = false) => h('option', { value, selected }, text);
