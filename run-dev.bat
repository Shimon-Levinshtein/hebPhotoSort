@echo off
setlocal

echo Starting HebPhotoSort server...
start "server" cmd /k "cd /d %~dp0server && npm install && npm run dev"

echo Starting HebPhotoSort client...
start "client" cmd /k "cd /d %~dp0client && npm install && npm run dev"

echo Done. Two terminals were opened: server (port 4000) and client (port 5173).
endlocal

