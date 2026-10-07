// 단계 5: 비기능 요구사항(PRD 7장) 점검 — 반응형·접근성·보안(CSP)·지원 브라우저.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, openAsUser, startServer } from './helpers.js';

let server;
let browser;
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const VIEWS = [['list', '리스트'], ['kanban', '칸반'], ['calendar', '캘린더'], ['dashboard', '대시보드']];

before(async () => {
  server = await startServer(8794);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const switchView = async (page, name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent === n, name);
  await page.waitForTimeout(100);
};

/** axe 실행(개발용 도구라 배포물에는 넣지 않는다). CSP를 우회하는 별도 컨텍스트에서만 쓴다. */
async function runAxe(page) {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
    return result.violations.map((v) => ({
      id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    }));
  });
}

const blocking = (violations) => violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
const report = (label, violations) => {
  const other = violations.filter((v) => !blocking([v]).length);
  if (other.length) console.log(`  · ${label} — 중간/경미: ${other.map((v) => `${v.id}(${v.impact}×${v.count})`).join(', ')}`);
};

// ============================================================ 접근성(axe)
describe('7.3 접근성: 자동 검사(axe) — critical/serious 위반 0건', () => {
  test('4개 뷰(1280px)와 필터 패널', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 900 }, '', { bypassCSP: true });
    for (const [, name] of VIEWS) {
      await switchView(page, name);
      const v = await runAxe(page);
      report(`${name} 1280`, v);
      assert.deepEqual(blocking(v), [], `${name}: ${JSON.stringify(blocking(v))}`);
    }
    await context.close();
  });

  test('대화상자: 새 할일 폼(오류 상태 포함)·상세·사용자 변경·삭제 확인', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 900 }, '', { bypassCSP: true });
    await page.getByRole('button', { name: '새 할일' }).first().click();
    const form = page.getByRole('dialog', { name: '새 할일' });
    await form.getByRole('button', { name: '등록' }).click(); // 빈 제목 → 오류 표시
    let v = await runAxe(page);
    report('새 할일 폼(오류)', v);
    assert.deepEqual(blocking(v), [], `폼: ${JSON.stringify(blocking(v))}`);
    await form.getByRole('button', { name: '취소' }).click();

    await page.getByRole('button', { name: '백업 점검', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '할일 상세' });
    await detail.getByLabel('댓글 작성').fill('접근성 점검 댓글');
    await detail.getByRole('button', { name: '댓글 등록' }).click();
    await detail.getByText('접근성 점검 댓글').waitFor();
    v = await runAxe(page);
    report('상세', v);
    assert.deepEqual(blocking(v), [], `상세: ${JSON.stringify(blocking(v))}`);

    await detail.getByRole('button', { name: '삭제', exact: true }).click();
    v = await runAxe(page);
    assert.deepEqual(blocking(v), [], `삭제 확인: ${JSON.stringify(blocking(v))}`);
    await page.getByRole('dialog', { name: '할일 삭제' }).getByRole('button', { name: '취소' }).click();
    await detail.getByRole('button', { name: '닫기' }).click();

    await page.getByRole('button', { name: '변경', exact: true }).click();
    v = await runAxe(page);
    assert.deepEqual(blocking(v), [], `사용자 변경: ${JSON.stringify(blocking(v))}`);
    await context.close();
  });

  test('모바일(375px): 3개 뷰와 필터 시트', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 375, height: 800 }, '', { bypassCSP: true });
    for (const [, name] of VIEWS) {
      await switchView(page, name);
      const v = await runAxe(page);
      report(`${name} 375`, v);
      assert.deepEqual(blocking(v), [], `${name} 375: ${JSON.stringify(blocking(v))}`);
    }
    await page.locator('#filter-toggle').click();
    const v = await runAxe(page);
    assert.deepEqual(blocking(v), [], `필터 시트: ${JSON.stringify(blocking(v))}`);
    await context.close();
  });
});

describe('7.3 접근성: 구조·동작', () => {
  test('문서 구조: lang=ko, 랜드마크, h1 하나, 제목 단계가 건너뛰지 않는다(뷰별)', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    assert.equal(await page.locator('html').getAttribute('lang'), 'ko');
    for (const sel of ['header', 'nav', 'main', 'aside']) assert.equal(await page.locator(sel).count() >= 1, true, sel);
    assert.equal(await page.locator('h1').count(), 1);
    for (const [, name] of VIEWS) {
      await switchView(page, name);
      const levels = await page.$$eval('h1, h2, h3, h4, h5, h6', (hs) => hs.filter((h) => !h.closest('dialog')).map((h) => Number(h.tagName[1])));
      for (let i = 1; i < levels.length; i++) assert.ok(levels[i] - levels[i - 1] <= 1, `${name}: 제목 단계 ${levels.join(',')}`);
    }
    await context.close();
  });

  test('대화상자 포커스 트랩: Tab/Shift+Tab을 반복해도 대화상자 밖으로 나가지 않고, 닫으면 원래 위치로 돌아온다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    await page.getByRole('button', { name: '새 할일' }).first().focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog', { name: '새 할일' }).waitFor();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press(key);
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), true, `${key} ${i}회: 대화상자 밖으로 포커스 이동`);
      }
    }
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-task');
    await context.close();
  });

  test('prefers-reduced-motion: 전환·애니메이션이 사라진다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    const read = () => page.evaluate(() => {
      const btn = document.querySelector('.btn');
      const card = document.createElement('div');
      card.className = 'card';
      document.body.append(card);
      const style = (el) => getComputedStyle(el);
      const out = { btnTransition: style(btn).transitionDuration, cardTransition: style(card).transitionDuration };
      card.remove();
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton';
      document.body.append(skeleton);
      out.skeletonAnimation = style(skeleton).animationName;
      skeleton.remove();
      return out;
    });
    const normal = await read();
    assert.notEqual(normal.btnTransition, '0s');
    assert.notEqual(normal.skeletonAnimation, 'none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await read();
    assert.equal(reduced.btnTransition, '0s');
    assert.equal(reduced.cardTransition, '0s');
    assert.equal(reduced.skeletonAnimation, 'none');
    await context.close();
  });

  test('200% 확대·글자 크기 증가·320px 리플로우에서도 가려지거나 가로 스크롤이 생기지 않는다', async () => {
    // 1280px 화면 200% 확대 = 640px 폭, 400% = 320px 폭(WCAG 1.4.10)
    for (const width of [640, 320]) {
      const { page, context } = await openAsUser(browser, server.url, '김민준', { width, height: 800 });
      for (const [, name] of VIEWS) {
        await switchView(page, name);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, `${width}px ${name}: 가로 스크롤 ${overflow}px`);
      }
      await page.getByRole('button', { name: '새 할일' }).first().click();
      const dialog = page.getByRole('dialog', { name: '새 할일' });
      const fits = await dialog.evaluate((d) => {
        const r = d.getBoundingClientRect();
        return { inView: r.left >= 0 && r.right <= window.innerWidth, noXScroll: d.scrollWidth <= d.clientWidth };
      });
      assert.deepEqual(fits, { inView: true, noXScroll: true }, `${width}px 새 할일 대화상자`);
      await dialog.getByRole('button', { name: '등록' }).scrollIntoViewIfNeeded();
      assert.equal(await dialog.getByRole('button', { name: '등록' }).isVisible(), true);
      await context.close();
    }
    // 글자 크기 200%
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 800 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    for (const [, name] of VIEWS) {
      await switchView(page, name);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `글자 200% ${name}: 가로 스크롤 ${overflow}px`);
    }
    await context.close();
  });
});

// ============================================================ 키보드 시나리오(PRD 4장 S1·S2·S4) — 클릭·focus() 없이 키보드 입력만
describe('7.3 키보드: 핵심 흐름을 키보드만으로 완료', () => {
  /** 조건을 만족하는 요소에 포커스가 올 때까지 Tab(또는 Shift+Tab)을 누른다. */
  async function tabTo(page, predicate, { back = false, max = 200 } = {}) {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(predicate)) return;
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    }
    throw new Error(`Tab ${back ? '역방향 ' : ''}이동으로 대상에 도달하지 못했습니다: ${predicate}`);
  }
  const labelIs = (text) => `(() => { const e = document.activeElement; return (e?.getAttribute('aria-label') ?? '').includes(${JSON.stringify(text)}) || (e?.labels?.[0]?.textContent ?? '').includes(${JSON.stringify(text)}); })()`;

  test('S1 팀장이 업무 배분(등록) → S2 담당자가 상태 변경 → S4 댓글', async () => {
    // 대상 사용자 환경(한국어 로캘·한국 시간대): 날짜 입력칸이 yyyy.mm.dd 순서가 된다.
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
    const page = await context.newPage();
    const kb = page.keyboard;
    await page.goto(`${server.url}/index.html`);

    // 첫 방문 이름 입력(자동 포커스)
    await page.getByRole('dialog', { name: '이름을 입력하세요' }).waitFor();
    await kb.type('김민준');
    await kb.press('Enter');
    await page.getByRole('table').waitFor();

    // ---- S1: 「새 할일」로 제목·담당자·우선순위·마감일 입력 → 저장
    await tabTo(page, () => document.activeElement?.id === 'new-task', { back: true });
    await kb.press('Enter');
    await page.getByRole('dialog', { name: '새 할일' }).waitFor();
    await kb.type('키보드 배분 업무'); // 제목(자동 포커스)
    await tabTo(page, `(${labelIs('우선순위')})`);
    await kb.press('ArrowUp'); // 보통 → 높음
    await tabTo(page, `(${labelIs('담당자')})`);
    await kb.press('ArrowDown'); // 미배정 → 김민준
    await kb.press('ArrowDown'); // → 이서연
    await tabTo(page, `(${labelIs('마감일')})`);
    // 날짜 입력칸: 연도 칸은 6자리까지 받아 자동으로 넘어가지 않으므로 →로 월 칸으로 옮기고, 월·일은 두 자리를 치면 자동으로 넘어간다.
    await kb.type('2026');
    await kb.press('ArrowRight');
    await kb.type('1225');
    await tabTo(page, () => document.activeElement?.textContent === '등록');
    await kb.press('Enter');
    await page.getByRole('dialog', { name: '새 할일' }).waitFor({ state: 'detached' });
    const row = page.getByRole('row').filter({ hasText: '키보드 배분 업무' });
    await row.waitFor();
    const text = await row.textContent();
    assert.match(text, /이서연/);
    assert.match(text, /높음/);
    assert.match(text, /2026-12-25/);

    // ---- S2: 칸반으로 이동해 카드 메뉴(상태 변경)로 「진행 중」
    await tabTo(page, () => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.getAttribute('aria-selected') === 'true', { back: true });
    await kb.press('ArrowRight'); // 칸반
    await page.locator('.kanban').waitFor();
    await tabTo(page, `(() => document.activeElement?.getAttribute('aria-label') === '상태 변경: 키보드 배분 업무')()`);
    await kb.press('ArrowDown'); // 할 일 → 진행 중
    await page.locator('.kanban-col[data-status="in_progress"] .kanban-card', { hasText: '키보드 배분 업무' }).waitFor();

    // ---- S4: 카드 제목으로 상세를 열고 댓글 작성
    await tabTo(page, `(() => document.activeElement?.classList.contains('link-btn') && document.activeElement.textContent === '키보드 배분 업무')()`, { back: true });
    await kb.press('Enter');
    const detail = page.getByRole('dialog', { name: '할일 상세' });
    await detail.waitFor();
    await tabTo(page, () => document.activeElement?.tagName === 'TEXTAREA');
    await kb.type('키보드로 남긴 댓글');
    await kb.press('Tab');
    await kb.press('Enter');
    await detail.getByText('키보드로 남긴 댓글').waitFor();
    assert.match(await detail.locator('.comment__meta').last().textContent(), /김민준/);
    await context.close();
  });
});

// ============================================================ 반응형(7.1)
describe('7.1 반응형', () => {
  test('모바일 터치 대상 44×44px 이상(모든 뷰·필터·대화상자)', async () => {
    const { page, context } = await openAsUser(browser, server.url, '김민준', { width: 375, height: 800 });
    const measure = () => page.evaluate(() => {
      const bad = [];
      const targets = document.querySelectorAll('button, a[href], select, textarea, input, [role="tab"]');
      for (const el of targets) {
        if (el.closest('[hidden], [inert]') && !el.closest('dialog[open]')) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        // 체크박스는 라벨 전체가 눌리는 영역이다.
        const box = (el.type === 'checkbox' && el.closest('label') ? el.closest('label') : el).getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        if (el.closest('.visually-hidden') || el.classList.contains('skip-link')) continue;
        if (box.width < 43.5 || box.height < 43.5) bad.push(`${el.tagName}.${(el.className || el.type || '').toString().slice(0, 28)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
      return bad;
    });
    const all = {};
    for (const [, name] of VIEWS) {
      await switchView(page, name);
      all[name] = await measure();
    }
    await page.locator('#filter-toggle').click();
    all['필터 시트'] = await measure();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '새 할일' }).first().click();
    all['새 할일 폼'] = await measure();
    await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
    await switchView(page, '리스트');
    await page.getByRole('button', { name: '백업 점검', exact: true }).click();
    await page.getByRole('dialog', { name: '할일 상세' }).waitFor();
    all['상세'] = await measure();
    const failures = Object.fromEntries(Object.entries(all).filter(([, v]) => v.length));
    assert.deepEqual(failures, {});
    await context.close();
  });

  test('브레이크포인트별 레이아웃: 모바일(≤639)·태블릿(640~1023)·데스크탑(≥1024)·와이드(≥1440)', async () => {
    const layouts = {};
    for (const width of [375, 639, 640, 768, 1023, 1024, 1280, 1440, 1700]) {
      const { page, context } = await openAsUser(browser, server.url, '김민준', { width, height: 900 });
      const info = {};
      info.toggleVisible = await page.locator('#filter-toggle').isVisible();
      info.panelVisible = await page.locator('#filter-panel').isVisible();
      info.tableDisplay = await page.locator('tbody tr').first().evaluate((r) => getComputedStyle(r).display);
      info.pageWidth = Math.round((await page.locator('#main').boundingBox()).width);
      info.overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await switchView(page, '칸반');
      info.kanbanVisibleCols = await page.$$eval('.kanban-col', (cols) => cols.filter((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; }).length);
      info.kanbanOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      layouts[width] = info;
      await context.close();
    }
    console.log('  · 레이아웃:', JSON.stringify(layouts));
    for (const [w, i] of Object.entries(layouts)) {
      assert.ok(i.overflowX <= 0 && i.kanbanOverflowX <= 0, `${w}px 가로 스크롤`);
      const width = Number(w);
      if (width >= 1024) {
        assert.equal(i.panelVisible, true, `${w}: 사이드바`);
        assert.equal(i.toggleVisible, false, `${w}: 토글 숨김`);
        assert.equal(i.kanbanVisibleCols, 3, `${w}: 칸반 3열 동시 표시`);
        assert.equal(i.tableDisplay, 'table-row');
      } else {
        assert.equal(i.toggleVisible, true, `${w}: 필터 토글`);
        assert.equal(i.panelVisible, false, `${w}: 패널은 접힘`);
        if (width >= 640) assert.ok(i.kanbanVisibleCols >= 2 && i.kanbanVisibleCols <= 3, `${w}: 칸반 2~3열`);
        else assert.equal(i.kanbanVisibleCols, 1, `${w}: 칸반 열 하나씩`);
        assert.equal(i.tableDisplay, width >= 640 ? 'table-row' : 'block', `${w}: 표/카드`);
      }
    }
    assert.ok(layouts[1700].pageWidth <= 1440 + 2, `와이드: 본문 최대 폭 1440 (실제 ${layouts[1700].pageWidth})`);
    assert.ok(layouts[1700].pageWidth >= 1400);
  });
});

// ============================================================ 보안: CSP
describe('7.4 보안: CSP', () => {
  test('모든 화면·대화상자·드래그를 거쳐도 CSP 위반과 콘솔 오류가 0건이다', async () => {
    const { page, context, errors } = await openAsUser(browser, server.url, '김민준', { width: 1280, height: 1400 });
    await page.evaluate(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
    });
    for (const [, name] of VIEWS) await switchView(page, name);
    await switchView(page, '칸반');
    const col = (s) => page.locator(`.kanban-col[data-status="${s}"]`);
    const card = col('todo').locator('.kanban-card').first();
    const s = await card.boundingBox();
    const t = await col('in_progress').boundingBox();
    await page.mouse.move(s.x + s.width / 2, s.y + 20);
    await page.mouse.down();
    await page.mouse.move(s.x + s.width / 2 + 6, s.y + 26, { steps: 3 });
    await page.mouse.move(t.x + t.width / 2, t.y + 60, { steps: 12 });
    await page.mouse.up();
    await page.getByRole('button', { name: '새 할일' }).first().click();
    await page.getByRole('dialog', { name: '새 할일' }).getByLabel('제목').fill('CSP 점검');
    await page.getByRole('dialog', { name: '새 할일' }).getByRole('button', { name: '등록' }).click();
    await switchView(page, '대시보드');
    assert.deepEqual(await page.evaluate(() => window.__csp), []);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('CSP가 실제로 인라인 스크립트와 외부 도메인 요청을 막는다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    await page.evaluate(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
      const s = document.createElement('script');
      s.textContent = 'window.__inlineRan = true';
      document.head.append(s);
    });
    assert.equal(await page.evaluate(() => window.__inlineRan), undefined);
    const external = await page.evaluate(() => fetch('https://example.com/').then(() => 'allowed', () => 'blocked'));
    assert.equal(external, 'blocked');
    const violations = await page.evaluate(() => window.__csp);
    assert.ok(violations.some((v) => v.startsWith('script-src')), JSON.stringify(violations));
    assert.ok(violations.some((v) => v.startsWith('connect-src')), JSON.stringify(violations));
    await context.close();
  });
});

// ============================================================ 지원 브라우저(7.6)
describe('7.6 지원 브라우저', () => {
  test('필수 기능이 없는 브라우저에서는 안내 문구만 보이고 앱은 시작하지 않는다', async () => {
    const context = await browser.newContext();
    await context.addInitScript(() => { window.HTMLDialogElement = undefined; }); // dialog 미지원 흉내
    const page = await context.newPage();
    await page.goto(`${server.url}/index.html`);
    const notice = page.locator('#unsupported');
    await notice.waitFor({ state: 'visible' });
    assert.match(await notice.textContent(), /지원하지 않는 브라우저입니다.*Safari 16\.4/);
    assert.equal(await page.locator('#main').isVisible(), false);
    assert.equal(await page.locator('.app-header').isVisible(), false);
    assert.equal(await page.getByRole('dialog').count(), 0);
    await context.close();
  });

  test('index.html을 파일로 직접 열어도(file://) 동작한다: 사용자 식별·목록·칸반·새로고침 유지, CSP 위반 0건', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__csp = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective));
    });
    const fileUrl = new URL('../../index.html', import.meta.url).href;
    assert.match(fileUrl, /^file:/);
    await page.goto(fileUrl);
    const dialog = page.getByRole('dialog', { name: '이름을 입력하세요' });
    await dialog.getByLabel('이름').fill('파일사용자');
    await dialog.getByRole('button', { name: '확인' }).click();
    await page.locator('.task-table').waitFor();
    assert.equal(await page.locator('tbody tr').count(), 20); // 샘플 20건
    await page.getByRole('tab', { name: '칸반' }).click();
    assert.equal(await page.locator('.kanban-card').count(), 20);
    await page.reload();
    await page.locator('.kanban').waitFor();
    assert.equal((await page.locator('#current-user').textContent()).trim(), '파일사용자'); // 저장된 사용자 유지
    assert.equal(await page.locator('#unsupported').isVisible(), false);
    assert.deepEqual(await page.evaluate(() => window.__csp), []);
    assert.deepEqual(errors, []);
    await context.close();
  });

  test('지원 브라우저에서는 안내가 보이지 않는다', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    assert.equal(await page.locator('#unsupported').isVisible(), false);
    await context.close();
  });
});
