// 진행 중 업무 보기: 전체 기간의 진행 중 업무를 마감 상황별로 보고, 공통 검색·필터와 함께 쓴다.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, todayKst } from '../../js/domain/date.js';
import { launch, openAsUser, startServer } from './helpers.js';

let server;
let browser;

before(async () => {
  server = await startServer(8797);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const TODAY = todayKst();
const IN_PROGRESS_TAB = /^진행 중 업무/;

const goActive = async (page) => {
  await page.getByRole('tab', { name: IN_PROGRESS_TAB }).click();
  await page.locator('.active-view').waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
};
const switchView = async (page, name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.startsWith(n), name);
};

/** local 어댑터의 taskApi로 할일을 만든다(UI 입력 대신 시나리오 준비용). */
const seed = async (page, tasks) => {
  await page.waitForFunction(() => window.__todoTest?.taskApi); // 앱 시작이 끝나야 생기는 테스트 훅
  return page.evaluate(async (list) => {
    const ids = [];
    for (const t of list) ids.push((await window.__todoTest.taskApi.createTask({ priority: 'medium', category: '기타', status: 'in_progress', ...t })).id);
    return ids;
  }, tasks);
};

/** 목록이 다 그려질 때까지(점진 렌더링) 기다린 뒤 화면의 업무 제목들. */
async function titles(page) {
  await page.waitForTimeout(150);
  return page.$$eval('.active-item__title', (els) => els.map((e) => e.textContent));
}
const toolbarCount = (page) => page.locator('#result-count').textContent();
const tabCount = async (page) => Number(await page.locator('#tab-active .tab-count').textContent());
const groupCounts = (page) =>
  page.$$eval('.active-summary__item', (els) => Object.fromEntries(els.map((e) => [e.querySelector('.active-summary__label').textContent, Number(e.querySelector('.active-summary__count').textContent.replace(/\D/g, ''))])));
const totalInProgress = (page) => page.evaluate(async () => (await window.__todoTest.taskApi.listTasks()).filter((t) => t.status === 'in_progress').length);

const PREV = `[T] 지난달 마감`;
const NEXT = `[T] 내달 마감`;
const NONE = `[T] 마감일 없음`;
const TODO = `[T] 할 일 상태`;
const DONE = `[T] 완료 상태`;

async function seedScenario(page) {
  return seed(page, [
    { title: PREV, due_date: addDays(TODAY, -40), priority: 'high' },
    { title: NEXT, due_date: addDays(TODAY, 45) },
    { title: NONE },
    { title: TODO, status: 'todo', due_date: addDays(TODAY, -5) },
    { title: DONE, status: 'done', due_date: addDays(TODAY, -5) },
  ]);
}

describe('진행 중 업무 보기', () => {
  test('탭 진입점: 건수와 함께 표시되고, 선택하면 URL·접근 가능한 이름·활성 표시가 맞다', async () => {
    const { page, context, errors } = await openAsUser(browser, server.url);
    await seedScenario(page);
    const tab = page.getByRole('tab', { name: IN_PROGRESS_TAB });
    await tab.waitFor();
    const expected = await totalInProgress(page);
    await page.waitForFunction((n) => document.querySelector('#tab-active .tab-count').textContent === String(n), expected);
    // 접근 가능한 이름은 눈에 보이는 글자에서 나온다(aria-label로 덮어쓰지 않는다: WCAG 2.5.3)
    assert.equal(await tab.getAttribute('aria-label'), null);
    assert.equal((await tab.textContent()).trim(), `진행 중 업무 ${expected}`);
    await goActive(page);
    assert.equal(await tab.getAttribute('aria-selected'), 'true');
    assert.equal(await tab.getAttribute('aria-current'), 'page');
    assert.ok(page.url().includes('view=active'));
    assert.equal(await page.locator('#view-heading').textContent(), '진행 중 업무');
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('이전 달·다음 달·마감일 없는 업무가 모두 보이고 할 일·완료는 빠지며, 달을 바꿔도 누락되지 않는다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=calendar');
    await seedScenario(page);
    await goActive(page);
    let shown = await titles(page);
    for (const t of [PREV, NEXT, NONE]) assert.ok(shown.includes(t), `${t} 표시`);
    for (const t of [TODO, DONE]) assert.ok(!shown.includes(t), `${t}는 진행 중이 아니므로 제외`);

    // 캘린더에서 월을 크게 이동한 뒤 돌아와도 같은 목록
    await switchView(page, '캘린더');
    await page.getByRole('button', { name: '다음 달', exact: true }).click();
    await page.getByRole('button', { name: '다음 달', exact: true }).click();
    await goActive(page);
    assert.deepEqual((await titles(page)).sort(), shown.sort());

    // 그룹: 건수 합 = 목록 수 = 툴바 건수 = 탭 건수 = 전체 진행 중
    const total = await totalInProgress(page);
    const counts = await groupCounts(page);
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), total);
    assert.equal(shown.length, total);
    assert.equal(await toolbarCount(page), `진행 중 ${total}건`);
    assert.equal(await tabCount(page), total);
    const headings = await page.$$eval('.active-group__title', (els) => els.map((e) => e.textContent));
    assert.match(headings[0], /^마감 지연 \d+건$/);
    assert.ok(headings.some((h) => /^마감 임박 \d+건 · 오늘부터 3일 이내$/.test(h)) || !counts['마감 임박']);
    assert.ok(headings.some((h) => /^마감일 없음 \d+건$/.test(h)));
    await context.close();
  });

  test('마감일 빠른 순으로 정렬되고, 지연 그룹에 이전 달 업무가 먼저 온다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=active');
    await seedScenario(page);
    await page.getByRole('button', { name: PREV, exact: true }).waitFor();
    await page.waitForTimeout(150);
    const overdue = await page.$$eval('.active-group:first-of-type .active-item', (items) =>
      items.map((i) => ({ title: i.querySelector('.active-item__title').textContent, due: i.querySelector('.active-item__due').textContent.replace('마감일 ', '') })));
    const dues = overdue.map((o) => o.due);
    assert.deepEqual(dues, [...dues].sort(), '마감일 오름차순');
    assert.equal(overdue[0].title, PREV);
    await context.close();
  });

  test('각 업무에 제목·담당자(또는 미배정)·마감일·우선순위·지연/남은 일수가 글자로 보이고, 클릭하면 상세가 열린다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=active');
    await seed(page, [
      { title: '[T] 지연 표시', due_date: addDays(TODAY, -2), priority: 'high' },
      { title: '[T] 임박 표시', due_date: addDays(TODAY, 2) },
      { title: '[T] 여유 표시', due_date: addDays(TODAY, 10), priority: 'low' },
    ]);
    const item = (title) => page.locator('.active-item', { has: page.getByRole('button', { name: title, exact: true }) });

    const overdue = await item('[T] 지연 표시').innerText();
    assert.match(overdue, /미배정/);
    assert.match(overdue, new RegExp(addDays(TODAY, -2)));
    assert.match(overdue, /D\+2/);
    assert.match(overdue, /2일 지연/);
    assert.match(overdue, /높음/);
    assert.match(await item('[T] 임박 표시').innerText(), /D-2[\s\S]*2일 남음/);
    const later = await item('[T] 여유 표시').innerText();
    assert.match(later, /10일 남음/);
    assert.doesNotMatch(later, /D-\d/); // 임박이 아니면 긴급 배지 없음
    // 담당자 표시: 제목 바로 아래(같은 블록)에 있다. 「담당자」 레이블은 스크린 리더용으로 숨겨져 있다.
    assert.match(await item('[T] 지연 표시').locator('.active-item__main').innerText(), /\[T\] 지연 표시\s+(담당자\s+)?미배정/);

    await page.getByRole('button', { name: '[T] 지연 표시', exact: true }).click();
    await page.getByRole('dialog', { name: '할일 상세' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    // 행의 빈 곳을 눌러도 상세가 열린다
    await item('[T] 임박 표시').locator('.active-item__due').click();
    await page.getByRole('dialog', { name: '할일 상세' }).waitFor();
    await context.close();
  });

  test('완료로 바꾸면 목록·그룹·툴바·탭 건수에서 바로 빠진다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=active');
    await seedScenario(page);
    const before = await totalInProgress(page);
    assert.ok((await titles(page)).includes(PREV));
    await page.getByLabel(`상태 변경: ${PREV}`).selectOption('done');
    await page.waitForFunction((t) => ![...document.querySelectorAll('.active-item__title')].some((e) => e.textContent === t), PREV);
    assert.equal(await toolbarCount(page), `진행 중 ${before - 1}건`);
    assert.equal(await tabCount(page), before - 1);
    assert.equal(Object.values(await groupCounts(page)).reduce((a, b) => a + b, 0), before - 1);
    await context.close();
  });

  test('다른 사용자의 변경(진행 중으로 변경·삭제)이 열려 있는 보기의 목록과 건수에 반영된다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=active');
    const [id] = await seed(page, [{ title: '[T] 다른 탭 업무', status: 'todo' }]);
    assert.ok(!(await titles(page)).includes('[T] 다른 탭 업무'));
    const before = await tabCount(page);

    const other = await context.newPage(); // 같은 localStorage를 쓰는 두 번째 화면(다른 사용자 역할)
    await other.goto(`${server.url}/index.html?view=active`);
    await other.locator('.active-view').waitFor();
    await other.evaluate((taskId) => window.__todoTest.taskApi.updateTask(taskId, { status: 'in_progress' }), id);

    await page.bringToFront();
    await page.waitForFunction(() => [...document.querySelectorAll('.active-item__title')].some((e) => e.textContent === '[T] 다른 탭 업무'), null, { timeout: 15000 });
    assert.equal(await tabCount(page), before + 1);

    await other.evaluate((taskId) => window.__todoTest.taskApi.softDeleteTask(taskId), id);
    await page.bringToFront();
    await page.waitForFunction(() => ![...document.querySelectorAll('.active-item__title')].some((e) => e.textContent === '[T] 다른 탭 업무'), null, { timeout: 15000 });
    assert.equal(await tabCount(page), before);
    await context.close();
  });

  test('검색과 담당자 필터가 함께 동작하고, 건수는 결과와 일치하며, 초기화는 진행 중 조건을 유지한다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 900 }, '?view=active');
    await seed(page, [
      { title: '[T] 보고서 A', due_date: addDays(TODAY, 1) },
      { title: '[T] 보고서 B', due_date: addDays(TODAY, 2) },
      { title: '[T] 기획안 C', due_date: addDays(TODAY, 3) },
    ]);
    await page.evaluate(async () => {
      const api = window.__todoTest.taskApi;
      const members = await api.listMembers();
      const [kim, lee] = ['김민준', '이서연'].map((n) => members.find((m) => m.name === n));
      const tasks = await api.listTasks();
      const set = (title, member) => api.updateTask(tasks.find((t) => t.title === title).id, { assignee_id: member.id });
      await set('[T] 보고서 A', kim);
      await set('[T] 보고서 B', lee);
      await set('[T] 기획안 C', kim);
    });
    const total = await totalInProgress(page);
    await page.waitForFunction((n) => document.getElementById('result-count').textContent === `진행 중 ${n}건`, total);

    await page.getByLabel('검색').fill('[T] 보고서');
    await page.waitForFunction(() => document.getElementById('result-count').textContent.endsWith('건 중 2건'));
    assert.equal(await toolbarCount(page), `진행 중 ${total}건 중 2건`);
    assert.deepEqual((await titles(page)).sort(), ['[T] 보고서 A', '[T] 보고서 B']);

    await page.locator('#filter-panel').getByLabel('김민준').check(); // 담당자 필터
    await page.waitForFunction(() => document.getElementById('result-count').textContent.endsWith('건 중 1건'));
    assert.deepEqual(await titles(page), ['[T] 보고서 A']);
    assert.equal(await toolbarCount(page), `진행 중 ${total}건 중 1건`);
    assert.equal(Object.values(await groupCounts(page)).reduce((a, b) => a + b, 0), 1);

    // 적용 중인 조건이 칩으로 보인다: 고정 조건(해제 불가) + 검색 + 담당자
    const chips = await page.$$eval('#filter-chips .chip', (els) => els.map((e) => e.textContent.trim()));
    assert.deepEqual(chips, ['상태: 진행 중 (고정)', '검색: [T] 보고서 ✕', '담당자: 김민준 ✕']);
    assert.equal(await page.locator('#filter-chips .chip--fixed').evaluate((e) => e.tagName), 'SPAN'); // 버튼이 아님

    await page.locator('#filter-chips').getByRole('button', { name: '조건 초기화' }).click();
    await page.waitForFunction((n) => document.getElementById('result-count').textContent === `진행 중 ${n}건`, total);
    assert.equal(await page.getByLabel('검색').inputValue(), '');
    assert.deepEqual(await page.$$eval('#filter-chips .chip', (els) => els.map((e) => e.textContent.trim())), ['상태: 진행 중 (고정)']);
    assert.equal((await titles(page)).length, total);
    await context.close();
  });

  test('다른 보기에서 건 상태 필터와 충돌해도 빈 화면이 되지 않고, 돌아가면 기존 필터가 그대로다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 900 }, '?status=done&priority=high');
    const listBefore = await toolbarCount(page);
    assert.match(listBefore, /^전체 \d+건 중 \d+건$/);
    await goActive(page);
    assert.ok((await titles(page)).length > 0, '상태=완료 필터가 걸려 있어도 진행 중 업무가 보인다');
    // 상태 그룹은 고정 안내, 우선순위 필터는 그대로 적용된다
    assert.match(await page.locator('#filter-panel .filter-fixed').innerText(), /진행 중/);
    assert.equal(await page.locator('#filter-panel input[data-focus-key^="filter-status-"]').count(), 0);
    assert.ok((await page.$$eval('#filter-chips .chip', (els) => els.map((e) => e.textContent.trim()))).includes('우선순위: 높음 ✕'));
    assert.ok(!(await page.$$eval('#filter-chips .chip', (els) => els.map((e) => e.textContent))).some((t) => t.includes('완료')));

    // 이 보기에서 초기화해도 다른 보기의 상태 필터(완료)는 지워지지 않는다
    await page.locator('#filter-chips').getByRole('button', { name: '조건 초기화' }).click();
    await switchView(page, '리스트');
    assert.ok(page.url().includes('status=done'));
    assert.ok(!page.url().includes('priority='));
    assert.ok((await page.$$eval('#filter-chips .chip', (els) => els.map((e) => e.textContent.trim()))).includes('상태: 완료 ✕'));
    // 캘린더·칸반으로 가도 마찬가지
    await switchView(page, '칸반');
    assert.ok(page.url().includes('status=done'));
    await context.close();
  });

  test('빈 상태: 진행 중 업무가 없을 때와 검색 결과가 없을 때 안내 문구가 다르다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=active');
    await page.getByLabel('검색').fill('절대없는검색어xyz');
    await page.locator('.empty-state').waitFor();
    assert.match(await page.locator('.empty-state').innerText(), /조건에 맞는 진행 중 업무가 없습니다/);
    await page.locator('.empty-state').getByRole('button', { name: '조건 초기화' }).click();
    await page.locator('.active-item').first().waitFor();

    // 진행 중 업무를 모두 완료로 바꾼다
    await page.evaluate(async () => {
      const api = window.__todoTest.taskApi;
      for (const t of (await api.listTasks()).filter((x) => x.status === 'in_progress')) await api.updateTask(t.id, { status: 'done' });
    });
    await page.locator('.empty-state').waitFor();
    const text = await page.locator('.empty-state').innerText();
    assert.match(text, /진행 중인 업무가 없습니다/);
    assert.doesNotMatch(text, /조건에 맞는/);
    assert.equal(await page.locator('.empty-state').getByRole('button', { name: '조건 초기화' }).count(), 0);
    assert.equal(await tabCount(page), 0);
    assert.equal(await toolbarCount(page), '진행 중 0건');
    await context.close();
  });

  test('캘린더 바로가기: 전체 기간 기준 건수를 보여 주고, 달을 바꿔도 같으며, 누르면 이 보기로 이동한다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=calendar');
    await seedScenario(page);
    const total = await totalInProgress(page);
    const shortcut = page.getByRole('button', { name: `진행 중 업무 ${total}건 보기` });
    await shortcut.waitFor();
    assert.equal(await page.locator('#cal-active-note').textContent(), '전체 기간 기준');
    assert.equal(await shortcut.getAttribute('aria-describedby'), 'cal-active-note');
    const month = await page.locator('.cal-title').textContent();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '다음 달', exact: true }).click();
    assert.notEqual(await page.locator('.cal-title').textContent(), month);
    await page.getByRole('button', { name: `진행 중 업무 ${total}건 보기` }).waitFor(); // 달과 상관없이 같은 건수
    // 검색 결과가 달라도 건수는 전체 진행 중 기준
    await page.getByLabel('검색').fill('[T] 지난달');
    await page.waitForFunction(() => document.getElementById('result-count').textContent.includes('건 중')); // 검색 디바운스 후 반영
    await page.getByRole('button', { name: `진행 중 업무 ${total}건 보기` }).waitFor();

    await page.getByRole('button', { name: `진행 중 업무 ${total}건 보기` }).click();
    await page.locator('.active-view').waitFor();
    assert.ok(page.url().includes('view=active'));
    assert.equal(await toolbarCount(page), `진행 중 ${total}건 중 1건`); // 분모는 같은 전체 건수
    // 캘린더로 돌아가도 월 이동·검색 상태는 이 보기 때문에 바뀌지 않는다
    await switchView(page, '캘린더');
    assert.equal(await page.locator('#search').inputValue(), '[T] 지난달');
    await context.close();
  });

  test('모바일(375px): 정보가 세로로 쌓이고 가로 스크롤·잘림이 없으며 터치 대상이 44px 이상이다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 375, height: 800 }, '?view=active');
    await seed(page, [{ title: '[T] 아주 긴 제목의 진행 중 업무가 모바일 화면에서도 잘리지 않고 줄바꿈되어 모두 읽혀야 합니다 12345678901234567890', due_date: addDays(TODAY, -3), priority: 'high' }]);
    await page.waitForFunction(() => document.querySelector('.active-item'));
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, '가로 스크롤 없음');

    const layout = await page.$$eval('.active-item', (items) =>
      items.map((item) => {
        const box = (sel) => item.querySelector(sel).getBoundingClientRect();
        const [main, meta, actions, card] = [box('.active-item__main'), box('.active-item__meta'), box('.active-item__actions'), item.getBoundingClientRect()];
        return {
          stacked: main.bottom <= meta.top + 1 && meta.bottom <= actions.top + 1, // 제목·담당자 → 마감 정보 → 상태 변경 순으로 세로 배치
          inside: [main, meta, actions].every((r) => r.left >= card.left - 1 && r.right <= card.right + 1),
        };
      }));
    assert.ok(layout.length > 0);
    assert.ok(layout.every((l) => l.stacked && l.inside), JSON.stringify(layout));

    const small = await page.$$eval('.active-item button, .active-item select', (els) =>
      els.map((e) => ({ name: e.getAttribute('aria-label') ?? e.textContent.slice(0, 20), h: e.getBoundingClientRect().height })).filter((e) => e.h < 43.5));
    assert.deepEqual(small, []);
    await context.close();
  });

  test('키보드: 탭으로 이동하고 업무 제목에 포커스가 가며 Enter로 상세가 열리고 닫으면 포커스가 돌아온다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준');
    await page.getByRole('tab', { name: '대시보드' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.locator('.active-view').waitFor();
    assert.equal(await page.getByRole('tab', { selected: true }).getAttribute('data-view'), 'active');
    const first = page.locator('.active-item__title').first();
    await first.focus();
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('active-item__title')), true);
    const key = await first.getAttribute('data-focus-key');
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: '할일 상세' }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.focusKey), key);
    await context.close();
  });
});
