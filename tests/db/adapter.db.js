// 실제 supabase 어댑터(supabase-js → PostgREST) 브라우저 검증. local 어댑터와 같은 동작을 하는지 확인한다.
// 실제 Supabase 프로젝트에도 그대로 쓸 수 있다(테스트용 프로젝트 권장: 만든 데이터는 소프트 삭제만 가능).
//
//   SUPABASE_URL=https://<ref>.supabase.co  SUPABASE_ANON_KEY=<anon key>  npm run test:db
//
// js/config.js 파일을 만들지 않고, 브라우저가 요청하는 config.js만 가로채 supabase 설정을 돌려준다.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, startServer } from '../e2e/helpers.js';

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_ANON_KEY;
const skip = !URL_BASE || !KEY ? 'SUPABASE_URL / SUPABASE_ANON_KEY가 없어 건너뜀' : false;
const stamp = Date.now().toString(36);

let server;
let browser;
before(async () => {
  if (skip) return;
  server = await startServer(8796);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const CONFIG = () => `export default ${JSON.stringify({
  adapter: 'supabase', supabaseUrl: URL_BASE, supabaseAnonKey: KEY,
  categories: ['기획', '개발', '디자인', '운영', '기타'], overloadThreshold: 8, pollIntervalMs: 30000,
})};`;

/** 새 컨텍스트에서 앱을 열고 이름을 입력해 로그인한 상태로 만든다. 저장소(부서원 선택)를 공유할 두 번째 페이지도 만들 수 있다. */
async function openApp(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, bypassCSP: true });
  await context.route('**/js/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG() }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/index.html`);
  const dialog = page.getByRole('dialog', { name: '이름을 입력하세요' });
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '확인' }).click();
  await page.locator('.task-table, .empty-state').first().waitFor();
  return { context, page, errors };
}

async function addTask(page, title) {
  await page.getByRole('button', { name: '새 할일' }).first().click();
  const form = page.getByRole('dialog', { name: '새 할일' });
  await form.getByLabel('제목').fill(title);
  await form.getByRole('button', { name: '등록' }).click();
  await form.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: title, exact: true }).waitFor();
}

/** 두 번째 사용자 화면: 같은 컨텍스트라 저장된 사용자가 같으므로 「사용자 변경」으로 다른 사람이 된다. */
async function secondUser(context, name) {
  const page = await context.newPage();
  await page.goto(`${server.url}/index.html`);
  await page.locator('.task-table, .empty-state').first().waitFor();
  await page.getByRole('button', { name: '변경', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '사용자 변경' });
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '확인' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction((n) => document.getElementById('current-user').textContent === n, name);
  return page;
}

/** Realtime이 없는 환경에서도 다른 사람의 변경을 받도록 포커스 재조회를 일으킨다(PRD 6.3 보강 1). */
const refetch = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));

async function openEdit(page, title) {
  const detail = page.getByRole('dialog', { name: '할일 상세' });
  if (!(await detail.isVisible())) await page.getByRole('button', { name: title, exact: true }).click();
  await detail.getByRole('button', { name: '수정', exact: true }).click();
  return { detail, edit: page.getByRole('dialog', { name: '할일 수정' }) };
}

describe('supabase 어댑터(브라우저)', { skip }, () => {
  test('부서원 등록·할일 등록·수정·상태 변경·댓글·이력·삭제 되돌리기가 DB에 저장되고 새로고침 후에도 남는다', async () => {
    const { context, page, errors } = await openApp(`어댑터${stamp}`);
    const title = `DB 등록 ${stamp}`;
    await addTask(page, title);

    // 수정(제목·우선순위)
    const { detail, edit } = await openEdit(page, title);
    await edit.getByLabel('우선순위').selectOption('high');
    await edit.getByLabel('마감일').fill('2026-12-24');
    await edit.getByRole('button', { name: '저장' }).click();
    await edit.waitFor({ state: 'detached' });
    await detail.getByText('2026-12-24').first().waitFor();

    // 댓글·변경 이력
    await detail.getByLabel('댓글 작성').fill(`댓글 ${stamp}`);
    await detail.getByRole('button', { name: '댓글 등록' }).click();
    await detail.getByText(`댓글 ${stamp}`).waitFor();
    await detail.getByText(/우선순위 보통 → 높음/).waitFor();
    await detail.getByText(/마감일 없음 → 2026-12-24/).waitFor();
    await detail.getByRole('button', { name: '닫기' }).click();

    // 상태 변경(낙관적 업데이트 후 서버 값으로 확정, completed_at은 서버가 기록)
    await page.getByLabel(`상태 변경: ${title}`).selectOption('done');
    await page.waitForFunction((t) => [...document.querySelectorAll('tr')].find((r) => r.textContent.includes(t))?.querySelector('select')?.value === 'done', title);

    // 새로고침해도 DB에서 다시 읽어 온다
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: title });
    await row.waitFor();
    assert.equal(await row.locator('select').inputValue(), 'done');
    assert.match(await row.textContent(), /2026-12-24/);
    await page.getByRole('button', { name: title, exact: true }).click();
    const detail2 = page.getByRole('dialog', { name: '할일 상세' });
    await detail2.getByText(/완료\s*20\d\d\./).waitFor(); // completed_at(서버 기록)
    await detail2.getByText(`댓글 ${stamp}`).waitFor();

    // 소프트 삭제 → 목록에서 사라짐 → 되돌리기
    await detail2.getByRole('button', { name: '삭제', exact: true }).click();
    await page.getByRole('dialog', { name: '할일 삭제' }).getByRole('button', { name: '삭제' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: title, exact: true }).count(), 0);
    await page.getByRole('button', { name: '되돌리기' }).click();
    await page.getByRole('button', { name: title, exact: true }).waitFor();

    assert.deepEqual(errors, []);
    await context.close();
  });

  test('동시 편집: (a) 다른 필드는 병합 (b) 같은 필드는 확인창 후 나중 값 (c) 삭제 우선 — 서버 시각(updated_at) 비교 포함', async () => {
    const { context, page: a } = await openApp(`동시A${stamp}`);
    const b = await secondUser(context, `동시B${stamp}`);
    const title = `충돌 ${stamp}`;
    await addTask(a, title);
    await refetch(b);
    await b.getByRole('button', { name: title, exact: true }).waitFor();

    // (a) A는 마감일, B는 우선순위만 수정 → 둘 다 반영, 확인창 없음
    const { detail, edit } = await openEdit(a, title);
    await edit.getByLabel('마감일').fill('2026-12-24');
    const { edit: editB } = await openEdit(b, title);
    await editB.getByLabel('우선순위').selectOption('high');
    await editB.getByRole('button', { name: '저장' }).click();
    await editB.waitFor({ state: 'detached' });
    await edit.getByRole('button', { name: '저장' }).click(); // A의 updated_at 기준값은 이제 낡았다 → 서버가 거부 → 병합 재시도
    await edit.waitFor({ state: 'detached' });
    assert.equal(await a.getByRole('dialog', { name: '다른 사람이 먼저 수정했습니다' }).count(), 0);
    const fields = await detail.locator('.detail-fields').textContent();
    assert.match(fields, /2026-12-24/);
    assert.match(fields, /높음/);

    // (b) 같은 필드(우선순위): A는 낮음, B는 보통으로 먼저 저장 → A 저장 시 확인창 → 덮어쓰기
    const { edit: edit2 } = await openEdit(a, title);
    await edit2.getByLabel('우선순위').selectOption('low');
    const { edit: editB2 } = await openEdit(b, title);
    await editB2.getByLabel('우선순위').selectOption('medium');
    await editB2.getByRole('button', { name: '저장' }).click();
    await editB2.waitFor({ state: 'detached' });
    await edit2.getByRole('button', { name: '저장' }).click();
    const conflict = a.getByRole('dialog', { name: '다른 사람이 먼저 수정했습니다' });
    await conflict.waitFor();
    assert.match(await conflict.textContent(), /우선순위: 서버 값 「보통」 \/ 내 값 「낮음」/);
    await conflict.getByRole('button', { name: '덮어쓰기' }).click();
    await edit2.waitFor({ state: 'detached' });
    assert.match(await detail.locator('.detail-fields').textContent(), /낮음/);

    // (c) A가 수정 중일 때 B가 삭제 → 삭제 우선
    const { edit: edit3 } = await openEdit(a, title);
    await edit3.getByLabel('제목').fill(`${title} 수정중`);
    await b.getByRole('dialog', { name: '할일 상세' }).getByRole('button', { name: '삭제', exact: true }).click().catch(async () => {
      await b.getByRole('button', { name: title, exact: true }).click();
      await b.getByRole('dialog', { name: '할일 상세' }).getByRole('button', { name: '삭제', exact: true }).click();
    });
    await b.getByRole('dialog', { name: '할일 삭제' }).getByRole('button', { name: '삭제' }).click();
    await b.getByRole('dialog').waitFor({ state: 'detached' });
    await edit3.getByRole('button', { name: '저장' }).click();
    await edit3.locator('.form-summary', { hasText: '이미 삭제된 항목입니다' }).waitFor();
    assert.equal(await edit3.getByLabel('제목').inputValue(), `${title} 수정중`);
    await context.close();
  });

  test('다른 사용자의 변경은 포커스 재조회로 반영되고 「○○님이 수정함」이 표시된다', async () => {
    const { context, page: a } = await openApp(`관찰A${stamp}`);
    const b = await secondUser(context, `관찰B${stamp}`);
    const title = `관찰 ${stamp}`;
    await addTask(a, title);
    await refetch(b);
    await b.getByRole('button', { name: title, exact: true }).waitFor();
    // B 화면은 낙관적 업데이트로 즉시 바뀌므로, 서버 저장(PATCH) 응답을 기다린 뒤 A가 재조회한다.
    const saved = b.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/tasks'));
    await b.getByLabel(`상태 변경: ${title}`).selectOption('in_progress');
    await saved;
    await refetch(a);
    await a.locator('.remote-mark', { hasText: `관찰B${stamp}님이 수정함` }).waitFor();
    await a.locator('.toast', { hasText: `관찰B${stamp}님이 상태를 진행 중으로 변경했습니다` }).waitFor();
    await context.close();
  });
});
