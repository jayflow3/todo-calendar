// 한국어 조사 선택(받침 유무). 알림 문구 「○○님이 [필드]를 [값]으로 변경했습니다」에 쓴다.
const DIGIT_HAS_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };

/** 마지막 글자의 받침 종류: 'none' | 'rieul' | 'other' */
export function batchim(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return 'none';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  if (/[0-9]/.test(ch)) {
    if (ch === '1' || ch === '7' || ch === '8') return 'rieul'; // 일·칠·팔
    return DIGIT_HAS_BATCHIM[ch] ? 'other' : 'none';
  }
  return 'none';
}

export const eulReul = (word) => `${word}${batchim(word) === 'none' ? '를' : '을'}`;
export const euro = (word) => `${word}${batchim(word) === 'other' ? '으로' : '로'}`;
