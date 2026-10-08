// 이 파일을 js/config.js로 복사해 값을 채운다(js/config.js는 git에 올리지 않는다).
// ES 모듈이 아니라 일반 스크립트다: index.html을 파일로 직접 열어도(file://) 읽히도록 window.TODO_CONFIG에 값을 둔다.
// 적은 항목만 바뀌고 나머지는 js/defaultConfig.js의 기본값을 쓴다.
// anon(공개) key만 사용한다. service role key는 절대 넣지 않는다.
window.TODO_CONFIG = {
  adapter: 'local', // 'local' | 'supabase'
  supabaseUrl: '',
  supabaseAnonKey: '',
  categories: ['기획', '개발', '디자인', '운영', '기타'],
  overloadThreshold: 8,
  pollIntervalMs: 30000, // 실시간 연결이 끊겼을 때 재조회 간격(ms)
  defaultUserName: '', // 시연용: 이름을 적으면 첫 방문에 이름 입력창을 건너뛰고 이 이름으로 시작한다(빈 값이면 입력창을 띄운다)
};
