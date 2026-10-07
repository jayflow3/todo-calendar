// DB 제약(0001_init.sql)과 같은 규칙. 클라이언트 검증과 local 어댑터가 함께 쓴다.
import { parseDateKey } from './date.js';

export const STATUSES = ['todo', 'in_progress', 'done'];
export const PRIORITIES = ['high', 'medium', 'low'];

export class ValidationError extends Error {
  constructor(errors) {
    super('입력값이 올바르지 않습니다');
    this.name = 'ValidationError';
    this.code = 'VALIDATION';
    /** @type {Record<string, string>} 필드명 → 오류 메시지 */
    this.errors = errors;
  }
}

function checkLength(errors, field, value, min, max, label) {
  const len = [...value].length;
  if (len < min) errors[field] = `${label}을(를) 입력하세요`;
  else if (len > max) errors[field] = `${label}은(는) ${max}자 이하로 입력하세요`;
}

/** 부분 수정이면 전달된 필드만 검사한다. 통과하면 공백을 정리한 값을 반환한다. */
export function validateTask(input, { partial = false } = {}) {
  const errors = {};
  const out = { ...input };

  if (!partial || 'title' in input) {
    out.title = String(input.title ?? '').trim();
    checkLength(errors, 'title', out.title, 1, 100, '제목');
  }
  if ('description' in input) {
    out.description = input.description == null ? null : String(input.description).trim() || null;
    if (out.description && [...out.description].length > 2000) {
      errors.description = '설명은 2000자 이하로 입력하세요';
    }
  }
  if ('status' in input && !STATUSES.includes(input.status)) errors.status = '상태 값이 올바르지 않습니다';
  if ('priority' in input && !PRIORITIES.includes(input.priority)) errors.priority = '우선순위 값이 올바르지 않습니다';
  if ('due_date' in input && input.due_date != null && !parseDateKey(input.due_date)) {
    errors.due_date = '마감일은 YYYY-MM-DD 형식이어야 합니다';
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

export function validateComment(body) {
  const text = String(body ?? '').trim();
  const errors = {};
  checkLength(errors, 'body', text, 1, 1000, '댓글');
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return text;
}

export function validateMember({ name, label }) {
  const errors = {};
  const out = { name: String(name ?? '').trim(), label: label ? String(label).trim() || null : null };
  checkLength(errors, 'name', out.name, 1, 20, '이름');
  if (out.label && [...out.label].length > 10) errors.label = '라벨은 10자 이하로 입력하세요';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}
