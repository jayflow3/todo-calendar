const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML을 조립해야 할 때만 사용한다. 가능하면 textContent로 출력한다. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}
