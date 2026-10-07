// 지원하지 않는 브라우저 안내(PRD 7.6). 앱 코드(ES 모듈)보다 먼저 실행되는 작은 일반 스크립트이므로
// 오래된 문법을 해석하지 못하는 브라우저에서도 동작하도록 ES5로만 작성한다.
(function () {
  var missing = [];
  if (typeof window.HTMLDialogElement !== 'function') missing.push('dialog');
  if (!('inert' in HTMLElement.prototype)) missing.push('inert');
  if (!(window.CSS && CSS.supports && CSS.supports('selector(:focus-visible)'))) missing.push(':focus-visible');
  if (!(window.CSS && CSS.supports && CSS.supports('display', 'grid'))) missing.push('CSS Grid');
  if (typeof window.WebSocket !== 'function' || typeof window.fetch !== 'function') missing.push('fetch/WebSocket');

  if (!missing.length) return;
  window.__unsupportedBrowser = true;
  var box = document.getElementById('unsupported');
  if (!box) return;
  box.textContent = '지원하지 않는 브라우저입니다. Chrome·Edge·Firefox 최신 버전 또는 Safari 16.4 이상으로 접속해 주세요. (필요 기능: ' + missing.join(', ') + ')';
  box.hidden = false;
  var main = document.getElementById('main');
  var header = document.querySelector('.app-header');
  if (main) main.hidden = true;
  if (header) header.hidden = true;
})();
