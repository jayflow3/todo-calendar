// local 어댑터 첫 실행용 샘플. 마감일이 오늘 기준 상대값이라 긴급 배지 확인에 쓸 수 있다.
import { addDays, todayKst } from '../../domain/date.js';

export function buildSeed(newId, now = new Date()) {
  const today = todayKst(now);
  const iso = now.toISOString();
  const members = ['김민준', '이서연', '박지호', '최유나', '정도윤', '한지우'].map((name) => ({
    id: newId(),
    name,
    label: null,
    active: true,
    created_at: iso,
  }));
  const [m1, m2, m3, m4, m5, m6] = members.map((m) => m.id);

  // [제목, 상태, 우선순위, 담당자, 카테고리, 마감일 오프셋(null=없음)]
  const rows = [
    ['분기 업무 계획서 작성', 'in_progress', 'high', m1, '기획', 3],
    ['신규 기능 API 설계', 'todo', 'high', m2, '개발', 4],
    ['메인 화면 시안 검토', 'todo', 'medium', m3, '디자인', 0],
    ['서버 로그 정리', 'in_progress', 'low', m4, '운영', -1],
    ['주간 회의 자료 준비', 'todo', 'medium', m1, '기획', 1],
    ['로그인 오류 수정', 'done', 'high', m2, '개발', -3],
    ['아이콘 세트 교체', 'todo', 'low', m3, '디자인', 10],
    ['백업 점검', 'in_progress', 'medium', m5, '운영', 2],
    ['사용자 인터뷰 정리', 'done', 'medium', m6, '기획', -5],
    ['성능 측정 스크립트', 'todo', 'medium', null, '개발', null],
    ['비품 구매 요청', 'todo', 'low', m4, '기타', -2],
    ['신입 온보딩 문서', 'in_progress', 'medium', m6, '기타', 7],
  ];

  const tasks = rows.map(([title, status, priority, assignee, category, offset], i) => {
    const created = new Date(now.getTime() - (rows.length - i) * 3600_000).toISOString();
    return {
      id: newId(),
      title,
      description: null,
      status,
      priority,
      assignee_id: assignee,
      category,
      due_date: offset === null ? null : addDays(today, offset),
      completed_at: status === 'done' ? created : null,
      created_by: m1,
      updated_by: m1,
      created_at: created,
      updated_at: created,
      deleted_at: null,
    };
  });

  return { members, tasks, comments: [], events: [] };
}
