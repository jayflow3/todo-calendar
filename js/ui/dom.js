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

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG 요소 생성. 숫자·문자열 속성만 받으며 사용자 입력을 마크업으로 해석하지 않는다. */
export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props ?? {})) if (value != null && value !== false) el.setAttribute(key, String(value));
  append(el, children);
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

/**
 * 다시 그리기 전에 포커스 위치(data-focus-key)를 기억하고, 호출하면 그 요소로 포커스를 되돌리는 함수를 돌려준다.
 * 포커스가 body로 빠진 경우에만 되돌린다(그 사이 사용자가 다른 곳으로 옮겼다면 건드리지 않는다).
 */
export function captureFocus() {
  const key = document.activeElement?.dataset?.focusKey;
  return () => {
    if (!key) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.dataset?.focusKey !== key && active.isConnected) return;
    document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();
  };
}

/** 다시 그리기 전후로 포커스를 유지한다. 포커스 대상 요소에는 data-focus-key를 붙인다. */
export function preserveFocus(render) {
  const restore = captureFocus();
  render();
  restore();
}

const progressiveTokens = new WeakMap();

/**
 * 항목이 많을 때 앞부분을 먼저 그려 화면에 빨리 보이고, 나머지는 다음 프레임들에 나눠 붙인다(1,000건에서도 반응성 유지).
 * 같은 container에 다시 호출하면 이전 작업은 중단된다. build(item)은 노드를 돌려준다.
 */
export function renderProgressive(container, items, build, { first = 40, chunk = 40, onDone } = {}) {
  const token = Symbol('render');
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
    if (progressiveTokens.get(container) !== token || !container.isConnected) return; // 새로 그려졌거나 화면에서 사라짐
    if (index >= items.length) return onDone?.();
    appendNext(chunk);
    requestAnimationFrame(frame);
  };
  appendNext(first);
  if (index >= items.length) onDone?.();
  // 첫 조각이 먼저 화면에 그려지도록, 다음 조각은 그 페인트가 끝난 뒤(다음 프레임의 매크로태스크)부터 시작한다.
  else requestAnimationFrame(() => setTimeout(frame, 0));
}

let counter = 0;
export const uid = (prefix) => `${prefix}-${++counter}`;
