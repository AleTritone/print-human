@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1

call "%~dp0activate.bat"
if errorlevel 1 (
    popd
    exit /b 1
)

python -m streamlit run "%~dp0app.py" --server.address=localhost %*
set "PRINT_HUMAN_EXIT_CODE=%errorlevel%"
popd
exit /b %PRINT_HUMAN_EXIT_CODE%
