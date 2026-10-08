// 라이트/다크 화면 전환 버튼. 첫 적용은 js/theme.js가 하고, 여기서는 버튼과 저장만 맡는다.
const STORAGE_KEY = 'todo.theme';

function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 저장소를 쓸 수 없으면 이번 방문에만 적용된다.
  }
}

export function initThemeToggle(button) {
  const root = document.documentElement;
  const render = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    button.textContent = dark ? '라이트 모드' : '다크 모드';
  };
  button.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    if (next === 'dark') root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    storeTheme(next);
    render();
  });
  render();
}
