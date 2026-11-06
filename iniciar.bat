@echo off
chcp 65001 >nul
title Mural Urutai
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org ^(versao LTS^) e tente de novo. & pause & exit /b)
start "" http://localhost:3000
node server.js
pause
