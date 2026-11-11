@echo off
if not exist "%~dp0..\print-human-env\python.exe" (
    echo Ambiente Python non trovato: "%~dp0..\print-human-env"
    exit /b 1
)
if not exist "%LOCALAPPDATA%\anaconda3\Scripts\activate.bat" (
    echo Attivazione Conda non trovata: "%LOCALAPPDATA%\anaconda3\Scripts\activate.bat"
    exit /b 1
)
call "%LOCALAPPDATA%\anaconda3\Scripts\activate.bat" "%~dp0..\print-human-env"
exit /b %errorlevel%
