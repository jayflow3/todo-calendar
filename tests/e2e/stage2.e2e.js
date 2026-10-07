import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openAsUser, startServer } from './helpers.js';

let server;
let browser;

before(async () => {
  server = await startServer(8791);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const rowOf = (page, title) => page.getByRole('row').filter({ hasText: title });

describe('단계 2 스모크', () => {
  test('첫 방문 이름 입력 → 등록 → 수정 → 상태 변경 → 댓글 → 삭제 → 되돌리기', async () => {
    const { page, context, errors } = await openAsUser(browser, server.url, '김민준');
    assert.match(await page.locator('#current-user').textContent(), /김민준/);

    // 등록
    await page.getByRole('button', { name: '새 할일' }).click();
    const form = page.getByRole('dialog', { name: '새 할일' });
    await form.getByLabel('제목').fill('스모크 테스트 할일');
    await form.getByLabel('우선순위').selectOption('high');
    await form.getByRole('button', { name: '등록' }).click();
    await rowOf(page, '스모크 테스트 할일').waitFor();

    // 상세 → 수정
    await page.getByRole('button', { name: '스모크 테스트 할일' }).click();
    const detail = page.getByRole('dialog', { name: '할일 상세' });
    await detail.getByRole('button', { name: '수정' }).click();
    const edit = page.getByRole('dialog', { name: '할일 수정' });
    await edit.getByLabel('제목').fill('스모크 수정됨');
    await edit.getByLabel('마감일').fill('2026-12-25');
    await edit.getByRole('button', { name: '저장' }).click();
    await detail.getByRole('heading', { name: '스모크 수정됨' }).waitFor();

    // 댓글
    await detail.getByLabel('댓글 작성').fill('첫 댓글입니다');
    await detail.getByRole('button', { name: '댓글 등록' }).click();
    await detail.getByText('첫 댓글입니다').waitFor();
    assert.match(await detail.locator('.comment__meta').first().textContent(), /김민준/);

    // 변경 이력(마감일 변경)
    await detail.getByText(/마감일 없음 → 2026-12-25/).waitFor();

    // 삭제 → 되돌리기
    await detail.getByRole('button', { name: '삭제' }).click();
    await page.getByRole('dialog', { name: '할일 삭제' }).getByRole('button', { name: '삭제' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await rowOf(page, '스모크 수정됨').count(), 0);
    await page.getByRole('button', { name: '되돌리기' }).click();
    await rowOf(page, '스모크 수정됨').waitFor();

    // 상태 변경
    await page.getByLabel('상태 변경: 스모크 수정됨').selectOption('done');
    await page.getByRole('button', { name: '스모크 수정됨' }).click();
    await page.getByRole('dialog', { name: '할일 상세' }).getByText('완료', { exact: true }).first().waitFor();
    assert.match(await page.getByRole('dialog').locator('.detail-fields').textContent(), /완료\s*20\d\d/);

    assert.deepEqual(errors, []);
    await context.close();
  });

  test('XSS: 제목·설명·댓글·이름에 넣은 HTML은 문자 그대로 보인다', async () => {
    const payload = '<img src=x onerror=window.__x=1>';
    const { page, context } = await openAsUser(browser, server.url, '엑스에스에스');
    await page.getByRole('button', { name: '새 할일' }).click();
    const form = page.getByRole('dialog', { name: '새 할일' });
    await form.getByLabel('제목').fill(payload);
    await form.getByLabel('설명').fill(payload);
    await form.getByRole('button', { name: '등록' }).click();
    await page.getByRole('button', { name: payload }).click();
    const detail = page.getByRole('dialog', { name: '할일 상세' });
    await detail.getByLabel('댓글 작성').fill(payload);
    await detail.getByRole('button', { name: '댓글 등록' }).click();
    await detail.locator('.comment .preserve-lines', { hasText: payload }).waitFor();

    assert.equal(await page.evaluate(() => window.__x), undefined);
    assert.equal(await page.locator('img[src="x"]').count(), 0);
    await context.close();
  });

  test('XSS: 부서원 이름(20자 이내)도 문자 그대로 보인다', async () => {
    const payload = '<img src=x onerror=window.__y=1>'.slice(0, 20); // 잘린 태그도 텍스트여야 한다
    const { page, context } = await openAsUser(browser, server.url, '<b onclick=1>x</b>');
    assert.equal(await page.locator('#current-user').textContent(), '<b onclick=1>x</b>');
    assert.equal(await page.locator('#current-user b').count(), 0);
    assert.equal(await page.evaluate(() => window.__y), undefined);
    assert.ok(payload.length <= 20);
    await context.close();
  });

  test('검증: 제목 빈 값/공백/101자, 댓글 1001자가 막히고 오류가 필드에 연결된다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    await page.getByRole('button', { name: '새 할일' }).click();
    const form = page.getByRole('dialog', { name: '새 할일' });
    const title = form.getByLabel('제목');

    for (const value of ['', '   ', 'a'.repeat(101)]) {
      await title.fill(value);
      await form.getByRole('button', { name: '등록' }).click();
      assert.equal(await title.getAttribute('aria-invalid'), 'true');
      const describedBy = await title.getAttribute('aria-describedby');
      const errorId = describedBy.split(' ').find((id) => id.endsWith('-error'));
      assert.ok(errorId, '오류 메시지가 aria-describedby로 연결되어야 한다');
      assert.ok((await page.locator(`#${errorId}`).textContent()).length > 0);
      assert.match(await form.locator('[role=alert]').textContent(), /오류 1개/);
    }
    assert.equal(await page.getByRole('dialog', { name: '새 할일' }).count(), 1); // 저장되지 않음
    await title.fill('댓글 검증용');
    await form.getByRole('button', { name: '등록' }).click();

    await page.getByRole('button', { name: '댓글 검증용' }).click();
    const detail = page.getByRole('dialog', { name: '할일 상세' });
    for (const value of ['', 'a'.repeat(1001)]) {
      await detail.getByLabel('댓글 작성').fill(value);
      await detail.getByRole('button', { name: '댓글 등록' }).click();
      assert.equal(await detail.getByLabel('댓글 작성').getAttribute('aria-invalid'), 'true');
    }
    assert.equal(await detail.locator('.comment').count(), 0);
    await context.close();
  });

  test('이름 입력 대화상자는 Esc로 닫히지 않는다', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${server.url}/index.html`);
    const dialog = page.getByRole('dialog', { name: '이름을 입력하세요' });
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true);
    await context.close();
  });

  test('키보드만으로 등록·수정·삭제·댓글 흐름을 끝낼 수 있다', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${server.url}/index.html`);
    const kb = page.keyboard;

    // 이름 입력(자동 포커스) → Enter
    await page.getByRole('dialog', { name: '이름을 입력하세요' }).waitFor();
    await kb.type('키보드사용자');
    await kb.press('Enter');
    await page.getByRole('table').waitFor();

    // 「새 할일」 버튼까지 Tab 이동
    async function tabTo(predicate, max = 60) {
      for (let i = 0; i < max; i++) {
        await kb.press('Tab');
        if (await page.evaluate(predicate)) return;
      }
      throw new Error('Tab 이동으로 대상에 도달하지 못했습니다');
    }
    await page.evaluate(() => document.getElementById('main').focus());
    await kb.press('Shift+Tab');
    await tabTo(() => document.activeElement?.id === 'new-task'); // 이미 지나쳤다면 순환
    await kb.press('Enter');

    // 폼: 제목 자동 포커스
    await page.getByRole('dialog', { name: '새 할일' }).waitFor();
    await kb.type('키보드로 만든 할일');
    await kb.press('Enter'); // form submit
    await page.getByRole('button', { name: '키보드로 만든 할일' }).waitFor();

    // 목록의 제목 버튼으로 이동 → Enter → 상세
    await page.getByRole('button', { name: '키보드로 만든 할일' }).focus();
    await kb.press('Enter');
    const detail = page.getByRole('dialog', { name: '할일 상세' });
    await detail.waitFor();

    // 수정: 대화상자 안에서 Tab으로 「수정」 도달
    await tabTo(() => document.activeElement?.textContent === '수정');
    await kb.press('Enter');
    await page.getByRole('dialog', { name: '할일 수정' }).waitFor();
    await kb.press('Control+A');
    await kb.type('키보드로 수정한 할일');
    await kb.press('Enter');
    await detail.getByRole('heading', { name: '키보드로 수정한 할일' }).waitFor();

    // 댓글
    await tabTo(() => document.activeElement?.tagName === 'TEXTAREA');
    await kb.type('키보드 댓글');
    await kb.press('Tab');
    await kb.press('Enter');
    await detail.getByText('키보드 댓글').waitFor();

    // 삭제: 「삭제」 버튼으로 Shift+Tab 이동 → Enter → 확인(자동 포커스) Enter
    await tabTo(() => document.activeElement?.textContent === '삭제', 80);
    await kb.press('Enter');
    await page.getByRole('dialog', { name: '할일 삭제' }).waitFor();
    await kb.press('Enter');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: '키보드로 수정한 할일' }).count(), 0);

    // Esc 닫기와 포커스 복귀: 새 할일 대화상자를 열고 Esc
    await page.getByRole('button', { name: '새 할일' }).focus();
    await kb.press('Enter');
    await page.getByRole('dialog', { name: '새 할일' }).waitFor();
    await kb.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-task');
    await context.close();
  });

  test('반응형: 375/768/1280px에서 가로 스크롤이 없고 스크린샷을 남긴다', async () => {
    const out = process.env.SHOT_DIR;
    for (const width of [375, 768, 1280]) {
      const { page, context } = await openAsUser(browser, server.url, '김민준', { width, height: 800 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `${width}px에서 가로 스크롤 ${overflow}px`);
      if (out) await page.screenshot({ path: `${out}/list-${width}.png`, fullPage: false });
      await context.close();
    }
  });
});
