// DOM 생성 헬퍼. 문자열 자식은 항상 텍스트 노드로 넣는다(innerHTML 사용 금지: 사용자 입력 XSS 방지).

const BOOLEAN_ATTRS = new Set(['disabled', 'required', 'hidden', 'readonly', 'open', 'multiple']);
const PROPERTY_ATTRS = new Set(['value', 'checked', 'selected']);

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  const deferred = [];
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = value;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (PROPERTY_ATTRS.has(key)) {
      deferred.push([key, value]); // select의 value는 option이 붙은 뒤에 지정해야 한다
    } else if (BOOLEAN_ATTRS.has(key)) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  for (const [key, value] of deferred) el[key] = value;
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** 다시 그리기 전후로 포커스를 유지한다. 포커스 대상 요소에는 data-focus-key를 붙인다. */
export function preserveFocus(render) {
  const key = document.activeElement?.dataset?.focusKey;
  render();
  if (key) document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
}

let counter = 0;
export const uid = (prefix) => `${prefix}-${++counter}`;
