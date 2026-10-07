// 성능 측정(PRD 7.2). 다른 작업이 없는 상태에서 `npm run test:perf`로 따로 실행한다(CPU 부하에 민감해 일반 e2e와 섞으면 흔들린다). 가정: 동시 사용자 ≤ 20명, 활성 할일 1,000건. 측정값은 콘솔에 표로 출력한다.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { launch, openAsUser, startServer } from '../e2e/helpers.js';

let server;
let browser;

before(async () => {
  server = await startServer(8795);
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const NETWORKS = {
  // Chrome DevTools 프로필: 「Fast 4G」(일반 4G에 해당)와 「Slow 4G」
  'Fast 4G': { latency: 165, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
  'Slow 4G': { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
};

const switchView = async (page, name) => {
  await page.getByRole('tab', { name }).click();
  await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent === n, name);
};

/** 1,000건이 들어 있고 사용자가 선택된 상태의 컨텍스트(저장소만 공유하도록 storageState로 복제). */
async function seededState() {
  const { page, context } = await openAsUser(browser, server.url);
  await page.evaluate(() => {
    const key = 'todo.local.db.v2';
    const db = JSON.parse(localStorage.getItem(key));
    const now = new Date().toISOString();
    for (let i = 0; i < 1000; i++) {
      const status = ['todo', 'in_progress', 'done'][i % 3];
      db.tasks.push({
        id: crypto.randomUUID(), title: `성능 ${i + 1} 항목`, description: null, status, priority: ['high', 'medium', 'low'][i % 3],
        assignee_id: i % 7 === 0 ? null : db.members[i % db.members.length].id, category: ['기획', '개발', '디자인', '운영', '기타'][i % 5],
        due_date: i % 4 === 0 ? null : `2026-10-${String((i % 28) + 1).padStart(2, '0')}`, completed_at: status === 'done' ? now : null,
        created_by: db.members[0].id, updated_by: db.members[0].id, created_at: now, updated_at: now, deleted_at: null,
      });
    }
    localStorage.setItem(key, JSON.stringify(db));
  });
  const state = await context.storageState();
  await context.close();
  return state;
}

const row = (label, value, target, pass) => ({ 항목: label, 측정값: value, 목표: target, 결과: pass ? '통과' : '**미달**' });

describe('7.2 성능(1,000건)', () => {
  test('초기 로드: LCP·첫 데이터 표시·첫 화면 JS/CSS 전송 용량(gzip)', async () => {
    const state = await seededState();
    const table = [];

    for (const [name, network] of Object.entries(NETWORKS)) {
      const context = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await context.addInitScript(() => {
        window.__lcp = 0;
        new PerformanceObserver((list) => { window.__lcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        window.__firstRow = null;
        new MutationObserver(() => {
          if (window.__firstRow === null && document.querySelector('tbody tr')) window.__firstRow = performance.now();
        }).observe(document, { childList: true, subtree: true });
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }); // 첫 방문(콜드 캐시)
      await cdp.send('Network.emulateNetworkConditions', { offline: false, ...network });

      const started = Date.now();
      await page.goto(`${server.url}/index.html`, { waitUntil: 'load' });
      await page.waitForSelector('tbody tr');
      const loadMs = Date.now() - started;
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const res = performance.getEntriesByType('resource').filter((r) => /\.(js|css)(\?|$)/.test(r.name));
        const nav = performance.getEntriesByType('navigation')[0];
        return {
          lcp: window.__lcp,
          firstRow: window.__firstRow,
          requests: res.length + 1,
          encoded: res.reduce((n, r) => n + r.encodedBodySize, 0) + nav.encodedBodySize,
          decoded: res.reduce((n, r) => n + r.decodedBodySize, 0),
          domReady: nav.domContentLoadedEventEnd,
        };
      });
      table.push({ network: name, ...m, loadMs });
      await context.close();
    }

    // 용량: 실제로 불러온 JS·CSS를 gzip한 크기(local 어댑터)와 supabase 어댑터 사용 시 추가되는 vendor
    const vendorGz = gzipSync(readFileSync(new URL('../../vendor/supabase-js.umd.js', import.meta.url))).length;
    const fast = table[0];
    const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
    console.log('\n  === 초기 로드(콜드 캐시, 1,000건) ===');
    console.table(table.map((t) => ({
      네트워크: t.network, 'LCP(ms)': Math.round(t.lcp), '첫 행 표시(ms)': Math.round(t.firstRow), '요청 수': t.requests,
      '전송(gzip)': kb(t.encoded), '압축 해제 후': kb(t.decoded),
    })));
    console.log(`  supabase 어댑터 사용 시 vendor 추가(gzip): ${kb(vendorGz)} → 합계 ${kb(fast.encoded + vendorGz)}`);

    assert.ok(fast.encoded <= 300 * 1024, `첫 화면 JS·CSS(gzip) ${kb(fast.encoded)} > 300KB`);
    assert.ok(fast.encoded + vendorGz <= 300 * 1024, 'supabase 어댑터 포함 시 300KB 초과');
    for (const t of table) {
      assert.ok(t.lcp <= 2500, `${t.network} LCP ${Math.round(t.lcp)}ms > 2500ms`);
      assert.ok(t.firstRow <= 3000, `${t.network} 첫 데이터 표시 ${Math.round(t.firstRow)}ms > 3000ms`);
    }
  });

  test('상호작용 응답(INP 근사): 뷰 전환·필터·상태 변경·상세 열기의 최대 이벤트 지연', async () => {
    const state = await seededState();

    /** 새 페이지(콜드 스타트)에서 대표 상호작용을 하고, 그 중 가장 느린 상호작용의 지연(ms)을 돌려준다. */
    async function runOnce() {
      const context = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${server.url}/index.html`);
      await page.waitForSelector('tbody tr');
      await page.evaluate(() => {
        window.__events = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__events.push({ name: e.name, duration: e.duration, id: e.interactionId, target: (e.target?.textContent || e.target?.id || '').trim().slice(0, 10) });
        }).observe({ type: 'event', durationThreshold: 16, buffered: true });
      });
      for (const name of ['칸반', '캘린더', '대시보드', '리스트']) {
        await switchView(page, name);
        await page.waitForTimeout(150);
      }
      await page.getByRole('checkbox', { name: '진행 중' }).check();
      await page.waitForTimeout(150);
      await page.getByRole('checkbox', { name: '높음' }).check();
      await page.waitForTimeout(150);
      await page.getByRole('button', { name: '모두 해제' }).first().click();
      await page.waitForTimeout(150);
      await page.locator('#search').click();
      // 한글은 Playwright 합성 입력이 앱과 무관한 지연(long task 없이 300ms 대기)을 만들어 숫자로 측정한다.
      await page.keyboard.type('982', { delay: 40 });
      await page.waitForTimeout(400);
      await page.locator('#search').fill('');
      await page.waitForTimeout(300);
      await page.locator('select[aria-label^="상태 변경"]').first().selectOption('done');
      await page.waitForTimeout(300);
      await page.locator('.link-btn').first().click();
      await page.getByRole('dialog', { name: '할일 상세' }).waitFor();
      await page.waitForTimeout(300);
      const events = (await page.evaluate(() => window.__events)).filter((e) => e.id > 0);
      await context.close();
      const worst = [...events].sort((a, b) => b.duration - a.duration)[0];
      return { ms: worst.duration, what: worst.target || worst.name, count: new Set(events.map((e) => e.id)).size };
    }

    // 단일 실행의 최댓값은 「처음 한 번」의 콜드 스타트(첫 대화상자·첫 칸반 렌더)에 좌우되어 흔들리므로 3회 실행의 중앙값으로 판정하고 최악값도 함께 기록한다.
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await runOnce());
    const sorted = runs.map((r) => r.ms).sort((a, b) => a - b);
    const median = sorted[1];
    console.log(`
  INP 근사(3회 실행, 상호작용 ${runs[0].count}회씩): 실행별 최대 ${runs.map((r) => `${Math.round(r.ms)}ms(${r.what})`).join(', ')} → 중앙값 ${Math.round(median)}ms, 최악 ${Math.round(sorted[2])}ms`);
    assert.ok(median <= 200, `INP 근사 중앙값 ${Math.round(median)}ms > 200ms`);
  });

  test('필터·검색 갱신(1,000건): 입력부터 화면에 그려질 때까지 네 뷰 모두 p95 100ms 이내', async () => {
    const state = await seededState();
    const context = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${server.url}/index.html`);
    await page.waitForSelector('tbody tr');
    const result = {};
    for (const [view, name] of [['list', '리스트'], ['kanban', '칸반'], ['calendar', '캘린더'], ['dashboard', '대시보드']]) {
      await switchView(page, name);
      result[name] = await page.evaluate(async () => {
        const { setQuery, toggleFilter, clearAll } = window.__todoTest.criteria;
        // 상태 변경 → 렌더 → 스타일·레이아웃·첫 페인트까지 걸린 시간을 잰다(페인트 직후의 매크로태스크 시점).
        // 점진 렌더링의 나머지 조각은 이 시점 이후에 붙으므로 포함하지 않는다. 다음 측정 전에 조각이 끝나도록 잠시 쉰다.
        const paint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        const settle = () => new Promise((r) => setTimeout(r, 250));
        const time = async (fn) => { const t0 = performance.now(); fn(); const sync = performance.now() - t0; await paint(); const result = { sync, paint: performance.now() - t0 }; await settle(); return result; };
        const samples = [];
        for (let i = 0; i < 4; i++) {
          samples.push(await time(() => setQuery('성능 1')), await time(() => setQuery('성능')), await time(() => toggleFilter('status', 'todo')),
            await time(() => toggleFilter('priority', 'high')), await time(() => clearAll()));
        }
        const p = samples.map((s) => s.paint).sort((a, b) => a - b);
        const sync = samples.map((s) => s.sync).sort((a, b) => a - b);
        return { p50: p[Math.floor(p.length / 2)], p95: p[Math.ceil(p.length * 0.95) - 1], max: p[p.length - 1], syncMax: sync[sync.length - 1] };
      });
    }
    console.log('\n  === 필터·검색 갱신(1,000건, 20회) — 화면에 그려질 때까지 ===');
    console.table(Object.entries(result).map(([name, v]) => ({ 뷰: name, 'p50(ms)': v.p50.toFixed(1), 'p95(ms)': v.p95.toFixed(1), '최대(ms)': v.max.toFixed(1), 'JS만 최대(ms)': v.syncMax.toFixed(1) })));
    // 지연 목표는 백분위로 판정한다(p95). 이상치를 포함한 최댓값은 표에 그대로 남긴다.
    for (const [name, v] of Object.entries(result)) assert.ok(v.p95 <= 100, `${name} p95 ${v.p95.toFixed(1)}ms > 100ms (최대 ${v.max.toFixed(1)}ms)`);
    await context.close();
  });

  test('저장 요청 응답 시간(local 어댑터): 참고용 — Supabase 서버 응답 p95는 미검증', async () => {
    const { page, context } = await openAsUser(browser, server.url);
    const times = await page.evaluate(async () => {
      const { taskApi } = window.__todoTest;
      const [task] = await taskApi.listTasks();
      const out = [];
      for (let i = 0; i < 40; i++) {
        const t0 = performance.now();
        await taskApi.updateTask(task.id, { priority: ['high', 'medium', 'low'][i % 3] });
        out.push(performance.now() - t0);
      }
      return out.sort((a, b) => a - b);
    });
    console.log(`\n  local 어댑터 저장 응답: p50 ${times[20].toFixed(1)}ms / p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)}ms (네트워크 없음 — 서버 p95는 실제 Supabase로 측정해야 한다)`);
    await context.close();
  });
});
