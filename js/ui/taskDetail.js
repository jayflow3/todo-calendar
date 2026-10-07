// 할일 상세: 필드 보기, 수정·삭제, 댓글, 변경 이력. 모든 사용자 입력은 텍스트 노드로만 출력한다.
import { taskApi } from '../api/taskApi.js';
import { todayKst } from '../domain/date.js';
import { getUrgency } from '../domain/urgency.js';
import { validateComment, ValidationError } from '../domain/validation.js';
import { deleteTask } from '../state/actions.js';
import { formatFieldValue, FIELD_LABEL } from '../state/remote.js';
import { getState, memberById, subscribeStore } from '../state/store.js';
import { confirmDialog, openDialog } from './dialog.js';
import { h } from './dom.js';
import { errorSummary, field } from './form.js';
import { formatDateTime, memberName, priorityBadge, statusBadge, urgencyBadge } from './labels.js';
import { openTaskForm } from './taskForm.js';
import { showError } from './toast.js';


export function openTaskDetail(taskId) {
  const findTask = () => getState().tasks.find((t) => t.id === taskId);
  if (!findTask()) return;

  const fieldsEl = h('dl', { class: 'detail-fields' });
  const actionsEl = h('div', { class: 'row dialog__actions' });
  const commentsEl = h('ol', { class: 'comment-list' });
  const eventsEl = h('ul', { class: 'event-list' });
  const titleHeading = h('h3', { class: 'detail-title' });

  function renderFields() {
    const task = findTask();
    if (!task) return handle.close('gone'); // 다른 곳에서 삭제됨
    const row = (term, ...value) => [h('dt', null, term), h('dd', null, ...value)];
    titleHeading.textContent = task.title;
    fieldsEl.replaceChildren(
      ...row('상태', statusBadge(task.status)),
      ...row('우선순위', priorityBadge(task.priority)),
      ...row('담당자', memberName(memberById(task.assignee_id)) || '미배정'),
      ...row('카테고리', task.category ?? ''),
      ...row('마감일', task.due_date ?? '없음', ' ', urgencyBadge(getUrgency(task, todayKst()))),
      ...(task.completed_at ? row('완료', formatDateTime(task.completed_at)) : []),
      ...row('설명', task.description ? h('span', { class: 'preserve-lines' }, task.description) : '없음'),
      ...row('작성', `${memberName(memberById(task.created_by))} · ${formatDateTime(task.created_at)}`),
      ...row('최종 수정', `${memberName(memberById(task.updated_by))} · ${formatDateTime(task.updated_at)}`),
    );
  }

  async function renderComments() {
    const comments = await taskApi.listComments(taskId);
    commentsEl.replaceChildren(
      ...(comments.length
        ? comments.map((c) =>
            h(
              'li',
              { class: 'comment' },
              h('p', { class: 'comment__meta' }, `${memberName(memberById(c.author_id))} · ${formatDateTime(c.created_at)}`),
              h('p', { class: 'preserve-lines' }, c.body),
            ),
          )
        : [h('li', { class: 'muted' }, '댓글이 없습니다')]),
    );
  }

  async function renderEvents() {
    const events = await taskApi.listEvents(taskId);
    eventsEl.replaceChildren(
      ...(events.length
        ? events.map((e) =>
            h(
              'li',
              null,
              `${formatDateTime(e.created_at)} · ${memberName(memberById(e.actor_id))}: ${FIELD_LABEL[e.field]} ${formatFieldValue(e.field, e.from_value)} → ${formatFieldValue(e.field, e.to_value)}`,
            ),
          )
        : [h('li', { class: 'muted' }, '변경 이력이 없습니다')]),
    );
  }

  // 댓글 작성 폼은 다시 그려지지 않는 영역에 둔다(입력 중인 내용 보호).
  const commentField = field({
    label: '댓글 작성',
    hint: '1000자 이하, 일반 텍스트',
    control: h('textarea', { rows: 3 }),
  });
  const commentSummary = errorSummary();
  const commentForm = h(
    'form',
    {
      class: 'stack',
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
            commentSummary.show('입력 내용을 확인하세요 (오류 1개)');
            commentField.control.focus();
          } else {
            showError(`댓글을 등록하지 못했습니다. (${err.message})`);
          }
          return;
        }
        commentField.control.value = '';
        await renderComments();
        commentField.control.focus();
      },
    },
    commentSummary.el,
    commentField.el,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn--primary' }, '댓글 등록')),
  );

  actionsEl.append(
    h('button', {
      type: 'button',
      class: 'btn btn--primary',
      onClick: async () => {
        await openTaskForm({ task: findTask() });
        await renderEvents();
      },
    }, '수정'),
    h('button', {
      type: 'button',
      class: 'btn btn--secondary',
      onClick: async () => {
        const task = findTask();
        const ok = await confirmDialog({
          title: '할일 삭제',
          message: `「${task.title}」을(를) 삭제할까요? 삭제 직후 5초 동안 되돌릴 수 있습니다.`,
          confirmLabel: '삭제',
        });
        if (ok && (await deleteTask(task))) handle.close('deleted');
      },
    }, '삭제'),
    h('button', { type: 'button', class: 'btn btn--secondary', onClick: () => handle.close('close') }, '닫기'),
  );

  const body = [
    titleHeading,
    fieldsEl,
    actionsEl,
    h('section', { class: 'stack', 'aria-labelledby': 'detail-comments-heading' },
      h('h3', { id: 'detail-comments-heading' }, '댓글'),
      commentsEl,
      commentForm,
    ),
    h('section', { class: 'stack', 'aria-labelledby': 'detail-events-heading' },
      h('h3', { id: 'detail-events-heading' }, '변경 이력'),
      eventsEl,
    ),
  ];

  const unsubscribe = subscribeStore(() => {
    renderFields();
    renderEvents();
  });
  const handle = openDialog({ title: '할일 상세', body, wide: true, onClosed: unsubscribe });

  renderFields();
  renderComments();
  renderEvents();
}
