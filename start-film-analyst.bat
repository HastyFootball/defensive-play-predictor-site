@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8080/film-analyst.html"
  py -m http.server 8080
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8080/film-analyst.html"
  python -m http.server 8080
  exit /b
)
echo Python was not found. Install Python 3 from the Microsoft Store, then run this file again.
pause
