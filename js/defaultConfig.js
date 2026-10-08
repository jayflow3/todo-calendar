// 기본 설정(local 어댑터). js/config.js(일반 스크립트)가 window.TODO_CONFIG로 덮어쓴다. 형식은 js/config.example.js를 보라.
export default {
  adapter: 'local', // 'local' | 'supabase'
  supabaseUrl: '',
  supabaseAnonKey: '',
  categories: ['기획', '개발', '디자인', '운영', '기타'],
  overloadThreshold: 8,
  pollIntervalMs: 30000, // 실시간 연결이 끊겼을 때 재조회 간격
  defaultUserName: '', // 시연용: 이름을 적으면 첫 방문에 이름 입력창을 건너뛰고 이 이름으로 시작한다(빈 값이면 입력창을 띄운다)
};
