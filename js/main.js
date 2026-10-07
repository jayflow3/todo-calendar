// 앱 진입점. 단계 1에서는 설정을 읽어 데이터 접근 계층만 연결한다(화면은 이후 단계).
import { configureTaskApi } from './api/taskApi.js';

async function loadConfig() {
  try {
    return (await import('./config.js')).default;
  } catch {
    // js/config.js가 없으면 예시 설정(local 어댑터)으로 동작한다.
    return (await import('./config.example.js')).default;
  }
}

const config = await loadConfig();
await configureTaskApi(config);
