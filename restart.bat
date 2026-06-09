@echo off
setlocal
docker compose down --remove-orphans
docker compose up -d chromadb
docker compose up -d --build
pause