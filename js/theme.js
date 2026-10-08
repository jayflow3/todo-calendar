// 저장된 화면 테마(라이트/다크)를 첫 화면을 그리기 전에 적용한다. 앱 코드보다 먼저 실행되는 작은 일반 스크립트(ES5).
// 선택값은 개인 설정이라 localStorage에만 둔다(키 todo.theme). 없으면 라이트.
(function () {
  try {
    if (localStorage.getItem('todo.theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {
    // 저장소를 쓸 수 없으면 라이트로 시작한다.
  }
})();
