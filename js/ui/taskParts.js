// 리스트·칸반이 함께 쓰는 조각.
import { changeStatus } from '../state/actions.js';
import { getState } from '../state/store.js';
import { h } from './dom.js';
import { option } from './form.js';
import { STATUS_LABEL } from './labels.js';

/** 키보드·모바일에서도 쓸 수 있는 「상태 변경」 메뉴(드래그의 대체 수단). */
export function statusSelect(task, keyPrefix = 'status') {
  return h(
    'select',
    {
      class: 'field__input field__input--compact',
      'aria-label': `상태 변경: ${task.title}`,
      'data-focus-key': `${keyPrefix}-${task.id}`,
      value: task.status,
      onChange: (event) => changeStatus(task, event.target.value),
    },
    ...Object.entries(STATUS_LABEL).map(([value, text]) => option(value, text)),
  );
}

/** 다른 사람이 방금 수정한 카드에 「○○님이 수정함」을 표시한다. */
export function remoteMark(task) {
  const mark = getState().remoteMarks[task.id];
  return mark ? h('span', { class: 'remote-mark', role: 'status' }, `${mark.by}님이 수정함`) : null;
}
