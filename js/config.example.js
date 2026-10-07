// 이 파일을 js/config.js로 복사해 값을 채운다(js/config.js는 git에 올리지 않는다).
// anon(공개) key만 사용한다. service role key는 절대 넣지 않는다.
export default {
  adapter: 'local', // 'local' | 'supabase'
  supabaseUrl: '',
  supabaseAnonKey: '',
  categories: ['기획', '개발', '디자인', '운영', '기타'],
  overloadThreshold: 8,
  pollIntervalMs: 30000, // 실시간 연결이 끊겼을 때 재조회 간격
};
