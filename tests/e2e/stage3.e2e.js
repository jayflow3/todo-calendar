import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, todayKst } from '../../js/domain/date.js';
import { launch, openAsUser, startServer } from './helpers.js';

let server;
let browser;

before(async () => {
  server = await startServer(8792);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

const switchView = async (page, name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent === n, name);
};

/** 현재 뷰에 보이는 할일 id 집합(+ 리스트에서는 마감일). */
async function visibleIds(page, view) {
  return page.evaluate(
    ({ view, uuid }) => {
      const keys = [...document.querySelectorAll('[data-focus-key]')].map((e) => e.dataset.focusKey);
      const pick = (prefix) => keys.filter((k) => new RegExp(`^${prefix}-${uuid}$`).test(k)).map((k) => k.slice(prefix.length + 1));
      if (view === 'calendar') return [...new Set([...pick('cal'), ...pick('nodue')])].sort();
      return [...new Set(pick('open'))].sort();
    },
    { view, uuid: UUID },
  );
}

async function listRows(page) {
  return page.$$eval('tbody tr', (rows) =>
    rows.map((r) => ({
      id: r.querySelector('[data-focus-key^="open-"]').dataset.focusKey.slice(5),
      due: r.querySelector('td[data-label="마감일"]').textContent.trim().slice(0, 10),
    })),
  );
}

/** 사람처럼 단계적으로 움직이는 드래그(Playwright dragTo는 한 번에 점프해 다른 카드를 집는다). */
async function dragCard(page, source, target) {
  const s = await source.boundingBox();
  const t = await target.boundingBox();
  await page.mouse.move(s.x + s.width / 2, s.y + 20);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 + 6, s.y + 26, { steps: 3 });
  await page.mouse.move(t.x + t.width / 2, t.y + 60, { steps: 15 });
  await page.mouse.up();
}

async function addTask(page, title, { due, status } = {}) {
  await page.getByRole('button', { name: '새 할일' }).first().click();
  const form = page.getByRole('dialog', { name: '새 할일' });
  await form.getByLabel('제목').fill(title);
  if (due) await form.getByLabel('마감일').fill(due);
  if (status) await form.getByLabel('상태').selectOption(status);
  await form.getByRole('button', { name: '등록' }).click();
  await form.waitFor({ state: 'detached' });
}

describe('단계 3: 필터·칸반·캘린더·긴급 배지', () => {
  test('같은 검색어·필터를 건 상태에서 리스트·칸반·캘린더의 항목 id 집합이 동일하다', async () => {
    const { page, context, errors } = await openAsUser(browser, server.url, '김민준', undefined, '?status=todo,in_progress&category=개발,기획');
    const monthNow = todayKst().slice(0, 7);

    async function compare(label) {
      await switchView(page, '리스트');
      const rows = await listRows(page);
      const listIds = rows.map((r) => r.id).sort();
      assert.ok(listIds.length > 0, `${label}: 결과가 비어 있으면 비교가 무의미하다`);

      await switchView(page, '칸반');
      assert.deepEqual(await visibleIds(page, 'kanban'), listIds, `${label}: 칸반`);

      await switchView(page, '캘린더');
      assert.equal(await page.locator('.cal-more').count(), 0, '비교를 위해 +N개가 없어야 한다');
      const expected = rows.filter((r) => r.due === '없음' || r.due.slice(0, 7) === monthNow || monthOf(r.due) === monthNow).map((r) => r.id).sort();
      assert.deepEqual(await visibleIds(page, 'calendar'), expected, `${label}: 캘린더`);
      return listIds;
    }
    const monthOf = (d) => d.slice(0, 7);

    const base = await compare('URL 필터');
    // 검색어를 더해도 세 뷰가 같아야 한다.
    await switchView(page, '리스트');
    await page.locator('#search').fill('서');
    await page.waitForFunction((n) => document.querySelectorAll('tbody tr').length < n, base.length);
    const narrowed = await compare('검색+필터');
    assert.ok(narrowed.length < base.length);

    // 필터 칩과 결과 건수
    await switchView(page, '리스트');
    assert.match(await page.locator('#result-count').textContent(), /전체 \d+건 중 \d+건/);
    assert.ok((await page.locator('.chips .chip').count()) >= 4);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('필터를 걸고 새로고침하면 URL에서 복원되고 모든 뷰에 적용된다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    await page.getByRole('checkbox', { name: '진행 중' }).check();
    await page.getByRole('checkbox', { name: '높음' }).check();
    await page.locator('#search').fill('계획');
    await switchView(page, '칸반');
    await page.waitForFunction(() => location.search.includes('view=kanban') && location.search.includes('q='));
    const url = new URL(page.url());
    assert.equal(url.searchParams.get('view'), 'kanban');
    assert.equal(url.searchParams.get('status'), 'in_progress');
    assert.equal(url.searchParams.get('priority'), 'high');
    assert.equal(url.searchParams.get('q'), '계획');
    const before = await visibleIds(page, 'kanban');
    assert.ok(before.length >= 1);

    await page.reload();
    await page.locator('.kanban').waitFor();
    assert.equal(await page.getByRole('tab', { selected: true }).textContent(), '칸반');
    assert.equal(await page.locator('#search').inputValue(), '계획');
    assert.equal(await page.getByRole('checkbox', { name: '진행 중' }).isChecked(), true);
    assert.equal(await page.getByRole('checkbox', { name: '높음' }).isChecked(), true);
    assert.deepEqual(await visibleIds(page, 'kanban'), before);
    await switchView(page, '리스트');
    assert.deepEqual((await listRows(page)).map((r) => r.id).sort(), before);

    // 뷰를 바꿔도 필터가 유지되고, 「모두 해제」로 URL도 비워진다.
    await page.getByRole('button', { name: '모두 해제' }).first().click();
    await page.waitForFunction(() => !location.search.includes('status') && !location.search.includes('q='));
    await context.close();
  });

  test('칸반: 드래그와 키보드(카드 메뉴) 모두 상태가 바뀌고 새로고침 후에도 유지된다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 1800 });
    await addTask(page, 'DnD 카드');
    await switchView(page, '칸반');
    const col = (s) => page.locator(`.kanban-col[data-status="${s}"]`);
    const card = (s, t) => col(s).locator('.kanban-card', { hasText: t });
    await card('todo', 'DnD 카드').waitFor();
    const headCount = async (s) => Number(await col(s).locator('.kanban-col__head .badge').textContent());
    const [todoBefore, progBefore] = [await headCount('todo'), await headCount('in_progress')];

    await dragCard(page, card('todo', 'DnD 카드'), col('in_progress'));
    await card('in_progress', 'DnD 카드').waitFor();
    assert.equal(await headCount('todo'), todoBefore - 1);
    assert.equal(await headCount('in_progress'), progBefore + 1);

    await page.reload();
    await card('in_progress', 'DnD 카드').waitFor(); // 새로고침 후에도 유지(view=kanban은 URL에서 복원)

    // 키보드: 카드 메뉴 「상태 변경」에서 방향키로 선택
    const menu = page.getByLabel('상태 변경: DnD 카드');
    await menu.focus();
    await page.keyboard.press('ArrowDown'); // 진행 중 → 완료
    await card('done', 'DnD 카드').waitFor();
    await page.reload();
    await card('done', 'DnD 카드').waitFor();
    await context.close();
  });

  test('칸반: 저장 실패 시 카드가 원래 열로 돌아오고 오류 토스트가 뜬다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 1800 });
    await addTask(page, '실패 카드');
    await switchView(page, '칸반');
    const col = (s) => page.locator(`.kanban-col[data-status="${s}"]`);
    await col('todo').locator('.kanban-card', { hasText: '실패 카드' }).waitFor();

    await page.evaluate(() => {
      Storage.prototype.setItem = () => { throw new Error('저장소 오류(테스트)'); };
    });
    await dragCard(page, col('todo').locator('.kanban-card', { hasText: '실패 카드' }), col('done'));
    await page.locator('.toast--error').waitFor();
    assert.match(await page.locator('.toast--error').textContent(), /상태를 바꾸지 못했습니다/);
    assert.equal(await col('todo').locator('.kanban-card', { hasText: '실패 카드' }).count(), 1);
    assert.equal(await col('done').locator('.kanban-card', { hasText: '실패 카드' }).count(), 0);
    await context.close();
  });

  test('긴급 배지: +3/+4/오늘/어제 마감이 규칙대로 나오고 완료하면 사라진다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    const today = todayKst();
    const cases = [
      ['긴급P3', addDays(today, 3), 'D-3'],
      ['긴급P4', addDays(today, 4), null],
      ['긴급P0', today, 'D-day'],
      ['긴급M1', addDays(today, -1), 'D+1'],
    ];
    for (const [title, due] of cases) await addTask(page, title, { due });
    await page.locator('#search').fill('긴급');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4);

    const badgeOf = async (title) => {
      const cell = page.getByRole('row').filter({ hasText: title }).locator('td[data-label="마감일"] .badge');
      return (await cell.count()) ? (await cell.textContent()).replace(/마감 (임박|지연)/, '').trim() : null;
    };
    for (const [title, , expected] of cases) assert.equal(await badgeOf(title), expected, title);

    // 칸반·캘린더에서도 같은 배지가 보인다.
    await switchView(page, '칸반');
    assert.match(await page.locator('.kanban-card', { hasText: '긴급M1' }).textContent(), /D\+1/);
    await switchView(page, '리스트');

    // 완료하면 배지가 즉시 사라진다.
    await page.getByLabel('상태 변경: 긴급M1').selectOption('done');
    await page.waitForFunction(() => ![...document.querySelectorAll('tr')].find((r) => r.textContent.includes('긴급M1'))?.querySelector('.badge--urgent-overdue'));
    assert.equal(await badgeOf('긴급M1'), null);
    await page.screenshot({ path: process.env.SHOT_DIR && `${process.env.SHOT_DIR}/urgency.png` });
    await context.close();
  });

  test('캘린더: +N개, 일자 목록, 날짜 칸 클릭으로 마감일이 채워진 새 할일, 마감일 없음 목록, 월 이동', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', undefined, '?view=calendar');
    await page.locator('.cal-grid').waitFor();
    const today = todayKst();
    const [, m, d] = today.split('-').map(Number);

    // 오늘 칸을 클릭해 오늘 마감으로 3건 더 등록 → 시드 1건과 합쳐 4건
    for (const title of ['캘린더1', '캘린더2', '캘린더3']) {
      await page.getByRole('button', { name: new RegExp(`^${m}월 ${d}일 새 할일 등록`) }).click();
      const form = page.getByRole('dialog', { name: '새 할일' });
      assert.equal(await form.getByLabel('마감일').inputValue(), today); // 클릭한 날짜가 채워진다
      await form.getByLabel('제목').fill(title);
      await form.getByRole('button', { name: '등록' }).click();
      await form.waitFor({ state: 'detached' });
    }
    const more = page.getByRole('button', { name: new RegExp(`${m}월 ${d}일 할일 \\d+개 더 보기`) });
    assert.equal((await more.textContent()).trim(), '+1개');
    const cell = page.locator('td.cal-cell--today');
    assert.equal(await cell.locator('.cal-task').count(), 3); // 칸 안에는 3개까지

    await more.click();
    const dayDialog = page.getByRole('dialog', { name: new RegExp(`${m}월 ${d}일 할일 4건`) });
    assert.equal(await dayDialog.locator('.cal-task').count(), 4);
    await dayDialog.getByRole('button', { name: '닫기' }).click();

    // 마감일 없음 목록
    const noDue = page.locator('section', { has: page.getByRole('heading', { name: /마감일 없음/ }) });
    await noDue.getByRole('button', { name: /성능 측정 스크립트/ }).waitFor();

    // 월 이동과 오늘
    const title = page.locator('.cal-title');
    const before = await title.textContent();
    await page.getByRole('button', { name: '다음 달' }).click();
    assert.notEqual(await title.textContent(), before);
    assert.match(page.url(), /month=/);
    await page.getByRole('button', { name: '이전 달' }).click();
    assert.equal(await title.textContent(), before);
    await page.getByRole('button', { name: '다음 달' }).click();
    await page.getByRole('button', { name: '오늘' }).click();
    assert.equal(await title.textContent(), before);
    await context.close();
  });

  test('뷰 탭 접근성: tablist/tab/aria-selected, 화살표 키 이동', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    assert.equal(await page.getByRole('tablist').count(), 1);
    assert.equal(await page.getByRole('tab', { selected: true }).textContent(), '리스트');
    await page.getByRole('tab', { name: '리스트' }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { selected: true }).textContent(), '칸반');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { selected: true }).textContent(), '캘린더');
    await page.keyboard.press('ArrowRight'); // 대시보드는 비활성이므로 건너뛴다
    assert.equal(await page.getByRole('tab', { selected: true }).textContent(), '리스트');
    assert.equal(await page.getByRole('tabpanel').getAttribute('aria-labelledby'), 'tab-list');
    await context.close();
  });

  test('모바일 필터 시트: 열면 배경이 비활성화되고 Esc로 닫으면 포커스가 돌아온다', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 375, height: 800 });
    const toggle = page.locator('#filter-toggle');
    await toggle.click();
    const panel = page.locator('#filter-panel');
    const box = await panel.boundingBox();
    assert.ok(box.width >= 370 && box.height >= 790, '전체 화면 시트여야 한다');
    assert.equal(await page.evaluate(() => document.getElementById('content').inert), true);
    await page.getByRole('checkbox', { name: '높음' }).check();
    await page.keyboard.press('Escape');
    assert.equal(await panel.getAttribute('data-open'), 'false');
    assert.equal(await page.evaluate(() => document.getElementById('content').inert), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'filter-toggle');
    assert.match(await toggle.textContent(), /필터 \(1\)/);
    await context.close();
  });

  test('반응형: 375/768/1280px에서 세 뷰가 가로 스크롤 없이 그려지고 스크린샷을 남긴다', async () => {
    const out = process.env.SHOT_DIR;
    for (const width of [375, 768, 1280]) {
      const { page, context, errors } = await openAsUser(browser, server.url, '김민준', { width, height: 800 });
      for (const [view, name] of [['list', '리스트'], ['kanban', '칸반'], ['calendar', '캘린더']]) {
        await switchView(page, name);
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `${width}px ${view}: 가로 스크롤 ${overflow}px`);
        if (out) await page.screenshot({ path: `${out}/s3-${view}-${width}.png` });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  });
});
