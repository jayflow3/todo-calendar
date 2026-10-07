@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 필요합니다. https://nodejs.org 에서 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)
echo 서버를 시작합니다. 이 창을 닫으면 사이트도 멈춥니다. (종료: Ctrl+C)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"
node tools/serve.mjs 8080
pause
