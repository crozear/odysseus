@echo off
docker compose down --remove-orphans --rmi "all" -v
docker compose up --renew-anon-volumes --remove-orphans -d --force-recreate --build --always-recreate-deps
pause