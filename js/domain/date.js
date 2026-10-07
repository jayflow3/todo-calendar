// 날짜는 한국 시간(Asia/Seoul) 달력일 'YYYY-MM-DD' 문자열로 다룬다.
// new Date('YYYY-MM-DD')는 UTC로 파싱되어 하루 어긋날 수 있으므로 쓰지 않는다.

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const kstFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 주어진 시각(기본 현재)의 한국 시간 달력일. */
export function todayKst(now = new Date()) {
  return kstFormatter.format(now);
}

/** 'YYYY-MM-DD' → {year, month, day}. 형식이나 실제 달력에 맞지 않으면 null. */
export function parseDateKey(key) {
  const match = KEY_PATTERN.exec(key ?? '');
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const valid =
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  return valid ? { year, month, day } : null;
}

/** a − b (일 수). 두 값 모두 유효한 날짜 키여야 한다. */
export function diffDays(a, b) {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  if (!pa || !pb) throw new RangeError(`잘못된 날짜: ${a}, ${b}`);
  const ms = Date.UTC(pa.year, pa.month - 1, pa.day) - Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round(ms / 86400000);
}

/** 날짜 키에 일 수를 더한다. */
export function addDays(key, days) {
  const p = parseDateKey(key);
  if (!p) throw new RangeError(`잘못된 날짜: ${key}`);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return d.toISOString().slice(0, 10);
}
