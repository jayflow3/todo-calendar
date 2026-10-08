// 명도 대비 계산(WCAG 2.1). tokens.css에서 값을 읽어 사용 조합을 검증한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseTokens(css) {
  const tokens = {};
  for (const [, name, value] of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[name] = value.trim();
  return tokens;
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`6자리 hex만 지원합니다: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [이름, 전경 토큰, 배경 토큰, 최소 비율]. 4.5 = 본문 텍스트, 3 = UI 요소(테두리·아이콘·포커스). */
export const PAIRS = [
  ['본문 / 카드', '--color-text', '--color-surface', 4.5],
  ['본문 / 앱 배경', '--color-text', '--color-bg', 4.5],
  ['보조 텍스트 / 카드', '--color-text-muted', '--color-surface', 4.5],
  ['보조 텍스트 / 앱 배경', '--color-text-muted', '--color-bg', 4.5],
  ['헤더 흰 글자 / 보라', '--color-on-brand', '--color-brand-violet', 4.5],
  ['헤더 흰 글자 / 인디고', '--color-on-brand', '--color-brand-indigo', 4.5],
  ['링크·강조 / 카드', '--color-accent', '--color-surface', 4.5],
  ['링크·강조 / 앱 배경', '--color-accent', '--color-bg', 4.5],
  ['오류 텍스트 / 카드', '--color-error', '--color-surface', 4.5],
  ['토스트 글자 / 토스트 배경', '--color-toast-fg', '--color-toast-bg', 4.5],
  ['오류 토스트 글자 / 오류색', '--color-toast-fg', '--color-error', 4.5],
  ['배지 할 일', '--badge-status-todo-fg', '--badge-status-todo-bg', 4.5],
  ['배지 진행 중', '--badge-status-in-progress-fg', '--badge-status-in-progress-bg', 4.5],
  ['배지 완료', '--badge-status-done-fg', '--badge-status-done-bg', 4.5],
  ['배지 우선순위 높음', '--badge-priority-high-fg', '--badge-priority-high-bg', 4.5],
  ['배지 우선순위 보통', '--badge-priority-medium-fg', '--badge-priority-medium-bg', 4.5],
  ['배지 우선순위 낮음', '--badge-priority-low-fg', '--badge-priority-low-bg', 4.5],
  ['배지 긴급 임박', '--badge-urgent-soon-fg', '--badge-urgent-soon-bg', 4.5],
  ['배지 긴급 지연', '--badge-urgent-overdue-fg', '--badge-urgent-overdue-bg', 4.5],
  ['입력창 테두리 / 카드', '--color-border-strong', '--color-surface', 3],
  ['입력창 테두리 / 앱 배경', '--color-border-strong', '--color-bg', 3],
  ['포커스 링 / 카드', '--color-focus-ring', '--color-surface', 3],
  ['포커스 링 / 앱 배경', '--color-focus-ring', '--color-bg', 3],
  ['포커스 링 / 가라앉은 면', '--color-focus-ring', '--color-surface-sunken', 3],
  ['본문 / 가라앉은 면(칸반 열·표 머리)', '--color-text', '--color-surface-sunken', 4.5],
  ['보조 텍스트 / 가라앉은 면', '--color-text-muted', '--color-surface-sunken', 4.5],
  ['링크·강조 / 가라앉은 면', '--color-accent', '--color-surface-sunken', 4.5],
  ['입력창 테두리 / 가라앉은 면', '--color-border-strong', '--color-surface-sunken', 3],
  ['막대 기본 / 트랙', '--color-accent', '--color-border-subtle', 3],
  ['막대 할 일 / 트랙', '--color-border-strong', '--color-border-subtle', 3],
  ['막대 진행 중 / 트랙', '--badge-status-in-progress-fg', '--color-border-subtle', 3],
  ['막대 완료 / 트랙', '--badge-status-done-fg', '--color-border-subtle', 3],
  ['막대 과부하 / 트랙', '--badge-priority-high-fg', '--color-border-subtle', 3],
];

/** 라이트(기본) 토큰 위에 `:root[data-theme='dark']` 블록을 덮어쓴 것이 다크 토큰이다. 두 테마 모두 검사한다. */
export function checkAll(css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8')) {
  const darkAt = css.indexOf(":root[data-theme='dark']");
  const light = parseTokens(darkAt < 0 ? css : css.slice(0, darkAt));
  const themes = [['', light]];
  if (darkAt >= 0) themes.push(['(다크) ', { ...light, ...parseTokens(css.slice(darkAt)) }]);
  return themes.flatMap(([prefix, tokens]) =>
    PAIRS.map(([name, fg, bg, min]) => {
      const ratio = contrastRatio(tokens[fg], tokens[bg]);
      return { name: prefix + name, fg: tokens[fg], bg: tokens[bg], ratio, min, pass: ratio >= min };
    }),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log('| 조합 | 전경 | 배경 | 대비 | 기준 | 결과 |\n| --- | --- | --- | --- | --- | --- |');
  for (const r of checkAll()) console.log(`| ${r.name} | ${r.fg} | ${r.bg} | ${r.ratio.toFixed(2)}:1 | ${r.min}:1 | ${r.pass ? '통과' : '**미달**'} |`);
}
