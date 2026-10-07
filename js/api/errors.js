export class ApiError extends Error {
  /**
   * code: 'CONFLICT'(다른 사람이 먼저 수정) | 'DELETED'(이미 삭제됨) | 'NOT_FOUND' | 'NETWORK'
   * extra.current: 서버의 최신 레코드(알 수 있을 때)
   */
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    Object.assign(this, extra);
  }
}
