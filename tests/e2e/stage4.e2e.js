import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openAsUser, startServer } from './helpers.js';

let server;
let browser;

before(async () => {
  server = await startServer(8793);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const switchView = async (page, name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent === n, name);
};

const metric = (page, id) => page.locator(`[data-metric="${id}"]`);
const metricNumber = async (page, id) => Number((await metric(page, id).textContent()).replace(/\D/g, ''));

/** 같은 브라우저 컨텍스트(= 같은 localStorage)에서 두 번째 사용자 화면을 연다. */
async function openSecondUser(context, url, name) {
  const page = await context.newPage();
  await page.goto(`${url}/index.html`);
  await page.locator('.task-table').waitFor();
  await switchUser(page, name);
  return page;
}

async function switchUser(page, name) {
  await page.getByRole('button', { name: '변경', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '사용자 변경' });
  await dialog.getByLabel('이름').fill(name);
  await dialog.getByRole('button', { name: '확인' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.waitForFunction((n) => document.getElementById('current-user').textContent === n, name);
}

async function openEdit(page, title) {
  const detail = page.getByRole('dialog', { name: '할일 상세' });
  // 이미 상세가 열려 있으면(모달이 목록을 가린다) 그대로 쓴다.
  if (!(await detail.isVisible())) await page.getByRole('button', { name: title, exact: true }).click();
  await detail.getByRole('button', { name: '수정', exact: true }).click();
  return { detail, edit: page.getByRole('dialog', { name: '할일 수정' }) };
}

/** localStorage의 local 어댑터 DB에 할일을 직접 추가한다(대량·부하 시나리오용). */
async function addRawTasks(page, count, over = {}) {
  await page.evaluate(
    ({ count, over }) => {
      const key = 'todo.local.db.v2';
      const db = JSON.parse(localStorage.getItem(key));
      const names = over.assigneeName ? db.members.filter((m) => m.name === over.assigneeName) : [];
      const now = new Date().toISOString();
      for (let i = 0; i < count; i++) {
        db.tasks.push({
          id: crypto.randomUUID(), title: `${over.prefix ?? '대량'} ${i + 1} 항목`, description: null,
          status: over.status ?? ['todo', 'in_progress', 'done'][i % 3], priority: ['high', 'medium', 'low'][i % 3],
          assignee_id: names[0]?.id ?? (i % 7 === 0 ? null : db.members[i % db.members.length].id),
          category: ['기획', '개발', '디자인', '운영', '기타'][i % 5],
          due_date: over.due ?? (i % 4 === 0 ? null : `2026-10-${String((i % 28) + 1).padStart(2, '0')}`),
          completed_at: (over.status ?? ['todo', 'in_progress', 'done'][i % 3]) === 'done' ? now : null,
          created_by: db.members[0].id, updated_by: db.members[0].id, created_at: now, updated_at: now, deleted_at: null,
        });
      }
      localStorage.setItem(key, JSON.stringify(db));
    },
    { count, over },
  );
  await page.reload();
  await page.locator('.task-table, .kanban, .cal-grid, .dashboard').first().waitFor();
}

describe('단계 4: 대시보드', () => {
  test('카드 숫자가 같은 조건의 리스트 건수와 일치한다(지연·임박·상태·담당자)', async () => {
    const { page, context, errors } = await openAsUser(browser, server.url);
    await switchView(page, '대시보드');
    await metric(page, 'overdue').waitFor();

    const overdue = await metricNumber(page, 'overdue');
    assert.ok(overdue > 0, '시드에 지연 항목이 있어야 한다');
    await page.getByRole('button', { name: /^지연 / }).click();
    await page.locator('.task-table').waitFor();
    assert.equal(await page.locator('tbody tr').count(), overdue);
    assert.equal(new URL(page.url()).searchParams.get('urgency'), 'overdue');
    assert.match(await page.locator('#result-count').textContent(), new RegExp(`${overdue}건`));
    // 리스트의 각 행에 지연 배지(D+n)가 있다
    assert.equal(await page.locator('tbody .badge--urgent-overdue').count(), overdue);

    await page.getByRole('button', { name: '모두 해제' }).first().click();
    await switchView(page, '대시보드');
    const soon = await metricNumber(page, 'soon');
    await page.getByRole('button', { name: /^마감 임박/ }).click();
    await page.locator('.task-table').waitFor();
    assert.equal(await page.locator('tbody tr').count(), soon);

    await page.getByRole('button', { name: '모두 해제' }).first().click();
    await switchView(page, '대시보드');
    const inProgress = await metricNumber(page, 'in_progress');
    await page.getByRole('button', { name: /^진행 중 / }).click();
    await page.locator('.task-table').waitFor();
    assert.equal(await page.locator('tbody tr').count(), inProgress);

    // 필터가 걸린 상태에서도 대시보드는 같은 필터를 적용한다.
    await switchView(page, '대시보드');
    const withFilter = await metricNumber(page, 'in_progress');
    assert.equal(withFilter, inProgress);
    assert.equal(await metricNumber(page, 'todo'), 0);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('담당자별 부하: 막대는 숫자와 「과부하」 텍스트를 함께 표시하고, 클릭하면 해당 담당자의 미완료 리스트', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    await addRawTasks(page, 7, { assigneeName: '김민준', status: 'todo', prefix: '부하', due: null });
    await switchView(page, '대시보드');
    const row = page.locator('.workload__row', { hasText: '김민준' });
    const count = Number((await row.locator('.workload__count').textContent()).replace(/\D/g, ''));
    assert.ok(count >= 8);
    assert.equal(await row.getByText('과부하', { exact: true }).count(), 1);
    assert.equal(await page.locator('.workload__row', { hasText: '이서연' }).getByText('과부하').count(), 0);
    assert.equal(await row.locator('svg.bar').count(), 1);
    assert.equal(await page.locator('.workload__row .workload__name').first().textContent(), '김민준'); // 내림차순 1위

    await row.getByRole('button', { name: /김민준 미완료/ }).click();
    await page.locator('.task-table').waitFor();
    assert.equal(await page.locator('tbody tr').count(), count);
    await context.close();
  });

  test('완료율·완료 이력(M6): 완료하면 이력과 최근 7일 건수가 늘고, 빈 목록은 「–」', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    await switchView(page, '대시보드');
    const rate = (await metric(page, 'completion').textContent()).trim();
    assert.match(rate, /^\d+(\.\d)?%$/);
    const last7Before = Number((await metric(page, 'last7').textContent()).match(/(\d+)건/)[1]);

    await switchView(page, '리스트');
    await page.getByLabel('상태 변경: 서버 로그 정리').selectOption('done');
    await page.getByRole('row').filter({ hasText: '서버 로그 정리' }).locator('select').waitFor();
    await switchView(page, '대시보드');
    assert.equal(Number((await metric(page, 'last7').textContent()).match(/(\d+)건/)[1]), last7Before + 1);
    assert.equal(await page.locator('.history li').first().getByRole('button').textContent(), '서버 로그 정리'); // 최신순

    // 결과가 없는 검색 → 완료율은 「–」
    await page.locator('#search').fill('존재하지않는검색어');
    await page.waitForFunction(() => document.querySelector('[data-metric="completion"]')?.textContent.trim() === '–');
    await context.close();
  });
});

describe('단계 4: 실시간 반영과 충돌 처리(두 사용자)', () => {
  test('(a) 서로 다른 필드를 동시에 수정하면 둘 다 반영되고 충돌 창이 뜨지 않는다', async () => {
    const { page: a, context } = await openAsUser(browser, server.url, '김민준');
    const b = await openSecondUser(context, server.url, '이서연');

    const { detail, edit } = await openEdit(a, '백업 점검');
    await edit.getByLabel('마감일').fill('2026-12-24'); // 아직 저장하지 않음

    // B가 같은 항목의 우선순위만 바꿔 저장한다.
    const { edit: editB } = await openEdit(b, '백업 점검');
    await editB.getByLabel('우선순위').selectOption('high');
    await editB.getByRole('button', { name: '저장' }).click();
    await editB.waitFor({ state: 'detached' });

    // A의 편집창: 입력은 그대로, 「다른 사람이 수정했습니다」 안내만 뜬다.
    await edit.locator('.form-notice').waitFor({ state: 'visible' });
    assert.match(await edit.locator('.form-notice').textContent(), /이서연님이 수정했습니다/);
    assert.equal(await edit.getByLabel('마감일').inputValue(), '2026-12-24');
    // 카드 표시와 알림
    await a.locator('.toast', { hasText: '이서연님이 우선순위를 높음으로 변경했습니다' }).waitFor();

    await edit.getByRole('button', { name: '저장' }).click();
    await edit.waitFor({ state: 'detached' });
    assert.equal(await a.getByRole('dialog', { name: '다른 사람이 먼저 수정했습니다' }).count(), 0);
    const fields = await detail.locator('.detail-fields').textContent();
    assert.match(fields, /2026-12-24/); // A의 마감일
    assert.match(fields, /높음/); // B의 우선순위
    await context.close();
  });

  test('(b) 같은 필드를 동시에 수정하면 확인 후 나중 값이 최종이고, 먼저 저장한 쪽에 알림이 뜬다', async () => {
    const { page: a, context } = await openAsUser(browser, server.url, '김민준');
    const b = await openSecondUser(context, server.url, '이서연');

    const { detail, edit } = await openEdit(a, '신규 기능 API 설계');
    await edit.getByLabel('우선순위').selectOption('low');

    const { edit: editB } = await openEdit(b, '신규 기능 API 설계');
    await editB.getByLabel('우선순위').selectOption('medium');
    await editB.getByRole('button', { name: '저장' }).click();
    await editB.waitFor({ state: 'detached' });
    await edit.locator('.form-notice').waitFor({ state: 'visible' });

    // A 저장 → 같은 필드 충돌 확인창
    await edit.getByRole('button', { name: '저장' }).click();
    const conflict = a.getByRole('dialog', { name: '다른 사람이 먼저 수정했습니다' });
    await conflict.waitFor();
    assert.match(await conflict.textContent(), /우선순위: 서버 값 「보통」 \/ 내 값 「낮음」/);
    await conflict.getByRole('button', { name: '덮어쓰기' }).click();
    await edit.waitFor({ state: 'detached' });
    assert.match(await detail.locator('.detail-fields').textContent(), /낮음/); // 나중 저장이 최종값

    // 먼저 저장한 B에게 알림
    await b.locator('.toast', { hasText: '김민준님이 우선순위를 낮음으로 변경했습니다' }).waitFor();
    // 변경 전후가 task_events에 남아 되돌릴 수 있다
    await detail.getByText(/우선순위 보통 → 낮음/).waitFor();

    // 「서버 값 사용」: A가 다시 수정 중 B가 먼저 저장 → A는 서버 값을 택한다.
    const { edit: edit2 } = await openEdit(a, '신규 기능 API 설계');
    await edit2.getByLabel('우선순위').selectOption('medium');
    const { edit: editB2 } = await openEdit(b, '신규 기능 API 설계');
    await editB2.getByLabel('우선순위').selectOption('high');
    await editB2.getByRole('button', { name: '저장' }).click();
    await editB2.waitFor({ state: 'detached' });
    await edit2.locator('.form-notice').waitFor({ state: 'visible' });
    await edit2.getByRole('button', { name: '저장' }).click();
    await a.getByRole('dialog', { name: '다른 사람이 먼저 수정했습니다' }).getByRole('button', { name: '서버 값 사용' }).click();
    await edit2.waitFor({ state: 'detached' });
    assert.match(await detail.locator('.detail-fields').textContent(), /높음/);
    await context.close();
  });

  test('(c) 수정 중에 다른 사람이 삭제하면 삭제가 우선하고 「이미 삭제된 항목입니다」가 표시된다', async () => {
    const { page: a, context } = await openAsUser(browser, server.url, '김민준');
    const b = await openSecondUser(context, server.url, '이서연');

    const { edit } = await openEdit(a, '아이콘 세트 교체');
    await edit.getByLabel('제목').fill('아이콘 세트 교체(수정 중)');

    await b.getByRole('button', { name: '아이콘 세트 교체', exact: true }).click();
    const detailB = b.getByRole('dialog', { name: '할일 상세' });
    await detailB.getByRole('button', { name: '삭제', exact: true }).click();
    await b.getByRole('dialog', { name: '할일 삭제' }).getByRole('button', { name: '삭제' }).click();

    await edit.locator('.form-notice', { hasText: '이미 삭제된 항목입니다' }).waitFor({ state: 'visible' });
    assert.equal(await edit.getByRole('button', { name: '저장' }).isDisabled(), true);
    assert.equal(await edit.getByLabel('제목').inputValue(), '아이콘 세트 교체(수정 중)'); // 입력은 지우지 않는다
    await context.close();
  });

  test('다른 사람의 변경은 3초 안에 화면에 반영되고 카드에 「○○님이 수정함」이 표시된다', async () => {
    const { page: a, context } = await openAsUser(browser, server.url, '김민준');
    const b = await openSecondUser(context, server.url, '이서연');
    const started = Date.now();
    await b.getByLabel('상태 변경: 메인 화면 시안 검토').selectOption('done');
    const row = a.getByRole('row').filter({ hasText: '메인 화면 시안 검토' });
    await row.locator('.remote-mark', { hasText: '이서연님이 수정함' }).waitFor({ timeout: 3000 });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 3000, `반영까지 ${elapsed}ms`);
    assert.equal(await row.locator('select').inputValue(), 'done');
    await a.locator('.toast', { hasText: '이서연님이 상태를 완료로 변경했습니다' }).waitFor();
    console.log(`  · 실시간 반영 시간: ${elapsed}ms`);
    await context.close();
  });

  test('(회귀) 다른 사람이 새로 등록한 부서원의 이름이 열려 있던 화면에도 표시된다(담당자가 「미배정」으로 보이지 않는다)', async () => {
    const { page: a, context } = await openAsUser(browser, server.url, '김민준');
    const newcomer = `신입${Date.now().toString(36)}`;
    const b = await openSecondUser(context, server.url, newcomer); // 새 이름 → 부서원으로 등록된다
    // A는 이 부서원을 모른 채 열려 있다. B가 자신을 담당자로 지정해 저장한다.
    const { edit } = await openEdit(b, '성능 측정 스크립트');
    await edit.getByLabel('담당자').selectOption({ label: newcomer });
    await edit.getByRole('button', { name: '저장' }).click();
    await edit.waitFor({ state: 'detached' });

    const row = a.getByRole('row').filter({ hasText: '성능 측정 스크립트' });
    await row.locator('.remote-mark', { hasText: `${newcomer}님이 수정함` }).waitFor({ timeout: 5000 });
    assert.match(await row.textContent(), new RegExp(newcomer), '담당자 칸에 이름이 보여야 한다');
    assert.doesNotMatch(await row.textContent(), /미배정/);
    await a.locator('.toast', { hasText: `${newcomer}님이 담당자를 ${newcomer}` }).waitFor();
    await context.close();
  });

  test('연결 끊김: 배너가 뜨고 폴링으로 변경이 반영되며, 복구되면 배너가 사라진다', async () => {
    const { page: a, context } = await openAsUser(browser, server.url, '김민준');
    const b = await openSecondUser(context, server.url, '이서연');
    const banner = a.locator('#connection-status');
    assert.equal((await banner.textContent()).trim(), '');

    await a.evaluate(() => {
      window.__todoTest.setPollInterval(300);
      window.__todoTest.setConnected(false);
    });
    await banner.getByText('연결 끊김 — 최신이 아닐 수 있음').waitFor();

    // 끊긴 동안 B가 바꾸면 이벤트는 오지 않지만 폴링으로 따라잡는다.
    await b.getByLabel('상태 변경: 비품 구매 요청').selectOption('done');
    const row = a.getByRole('row').filter({ hasText: '비품 구매 요청' });
    await a.waitForFunction(() => [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('비품 구매 요청'))?.querySelector('select')?.value === 'done', null, { timeout: 3000 });
    assert.equal(await row.locator('select').inputValue(), 'done');

    // 복구: 배너 제거. 이후 변경은 다시 이벤트로 도착한다.
    await a.evaluate(() => window.__todoTest.setConnected(true));
    await a.waitForFunction(() => document.getElementById('connection-status').textContent.trim() === '');
    await b.getByLabel('상태 변경: 비품 구매 요청').selectOption('todo');
    await a.waitForFunction(() => [...document.querySelectorAll('tr')].find((r) => r.textContent.includes('비품 구매 요청'))?.querySelector('select')?.value === 'todo', null, { timeout: 3000 });
    await context.close();
  });
});
