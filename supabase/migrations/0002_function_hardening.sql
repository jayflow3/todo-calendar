-- 보안 점검(advisors) 경고 정리. 동작은 바꾸지 않는다.
-- 1) 트리거 함수의 search_path 고정
-- 2) 이력 기록용 SECURITY DEFINER 함수를 /rest/v1/rpc로 직접 호출하지 못하게 EXECUTE 회수
--    (트리거는 CREATE TRIGGER 시점에만 EXECUTE를 검사하므로 이력 기록은 그대로 동작한다)

alter function public.tasks_server_fields() set search_path = public;
alter function public.trim_text_fields()    set search_path = public;

revoke execute on function public.tasks_log_events() from public, anon, authenticated;
