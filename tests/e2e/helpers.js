// Playwright(playwright-core) + 설치된 Edge로 실행한다. 브라우저를 따로 내려받지 않는다.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

export async function startServer(port) {
  const proc = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/index.html`)).ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return { url: `http://localhost:${port}`, stop: () => proc.kill() };
}

export async function launch() {
  return chromium.launch({ channel: 'msedge', headless: true });
}

/** 첫 방문 이름 입력까지 마친 페이지. */
export async function openAsUser(browser, url, name = '김민준', viewport = { width: 1280, height: 800 }, search = '') {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // js/config.js(없으면 예시 설정으로 대체)와 favicon 404는 정상 동작이므로 제외한다.
  page.on('response', (r) => {
    const expected = /\/(config\.js|favicon\.ico)$/;
    if (r.status() >= 400 && !expected.test(r.url())) errors.push(`${r.status()} ${r.url()}`);
  });
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  await page.goto(`${url}/index.html${search}`);
  const dialog = page.getByRole('dialog', { name: '이름을 입력하세요' });
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '확인' }).click();
  await page.locator('.task-table, .kanban, .cal-grid, .empty-state').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  return { page, context, errors };
}
