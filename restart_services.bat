@echo off
cd /d "C:\HomeSync\GlanceRF\V2\Project"
timeout /t 2 /nobreak >nul
net stop GlanceRF 2>nul
timeout /t 2 /nobreak >nul
net start GlanceRF 2>nul
if %errorlevel% neq 0 (
    start "" "C:\Users\ThomasSteel\AppData\Local\Programs\Python\Python313\python.exe" run.py
)
