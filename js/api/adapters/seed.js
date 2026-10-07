// local 어댑터 첫 실행용 샘플(할일 20건·댓글 4건). 마감일이 오늘 기준 상대값이라 긴급 배지·지연·캘린더 확인에 쓸 수 있다.
// 테스트가 일부 제목·마감일(오늘 마감 1건)에 의존하므로, 기존 12건은 바꾸지 말고 아래에 추가만 한다.
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

  // [제목, 상태, 우선순위, 담당자, 카테고리, 마감일 오프셋(null=없음), 설명]
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
    ['고객 문의 응대 매뉴얼 정리', 'in_progress', 'medium', m5, '운영', 5, '자주 오는 문의 20건을 유형별로 묶고 답변 예시를 붙인다.'],
    ['신규 입사자 계정 발급', 'todo', 'high', m4, '운영', 1, '메신저·공유 드라이브·그룹웨어 계정. 입사일 전날까지.'],
    ['모바일 화면 점검', 'todo', 'medium', m3, '디자인', 6, '375px 기준으로 목록·칸반·캘린더 레이아웃 확인.'],
    ['월간 보고서 초안 작성', 'in_progress', 'high', m1, '기획', -2, '지난달 완료율과 지연 사유 정리.'],
    ['로그 모니터링 알림 설정', 'done', 'medium', m4, '운영', -4],
    ['접근성 점검 항목 정리', 'done', 'low', m6, '기타', -1],
    ['데이터 백업 절차 문서화', 'todo', 'high', m5, '운영', 3, '주 1회 백업과 복원 연습 절차를 문서로 남긴다.'],
    ['디자인 시스템 컬러 검토', 'in_progress', 'medium', m3, '디자인', 8],
  ];

  const tasks = rows.map(([title, status, priority, assignee, category, offset, description], i) => {
    const created = new Date(now.getTime() - (rows.length - i) * 3600_000).toISOString();
    return {
      id: newId(),
      title,
      description: description ?? null,
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

  // 댓글 4건(작성자·시각이 보이도록 서로 다른 사람과 시간)
  const byTitle = (title) => tasks.find((t) => t.title === title).id;
  const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  const comments = [
    { task_id: byTitle('분기 업무 계획서 작성'), author_id: m2, body: '개발 일정은 2주 단위로 나눠서 적어 주세요.', created_at: at(95) },
    { task_id: byTitle('분기 업무 계획서 작성'), author_id: m1, body: '네, 오늘 오후까지 반영해서 공유하겠습니다.', created_at: at(70) },
    { task_id: byTitle('로그인 오류 수정'), author_id: m2, body: '원인은 세션 만료 처리였고 수정 후 확인했습니다.', created_at: at(300) },
    { task_id: byTitle('백업 점검'), author_id: m5, body: '복원 테스트까지 해 봐야 해서 마감을 이틀 잡았습니다.', created_at: at(40) },
  ].map((c) => ({ id: newId(), ...c }));

  return { members, tasks, comments, events: [] };
}
