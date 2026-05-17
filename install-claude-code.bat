@echo off
REM ============================================================
REM Claude Code - Install Only (Windows)
REM Installs Claude Code configured for Bedrock.
REM To connect: paste your AWS lab credentials in CMD, then run claude.
REM ============================================================

cls
echo ===========================================
echo   Claude Code - Install
echo ===========================================
echo.

REM Step 0: Check for Git for Windows
where git >nul 2>&1
if %errorlevel%==0 goto git_done
echo [0/2] Git for Windows not found - required by Claude Code.
echo        Downloading Git for Windows installer...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe' -OutFile $env:TEMP\GitInstaller.exe"
echo        Installing Git for Windows - follow the prompts...
"%TEMP%\GitInstaller.exe"
set "PATH=%PATH%;C:\Program Files\Git\bin"
echo        Git for Windows installed
echo.
:git_done

REM Step 1: Install Claude Code
echo [1/2] Checking for Claude Code...
where claude >nul 2>&1
if %errorlevel%==0 (
    echo        Claude Code is already installed
    goto claude_done
)
if exist "%USERPROFILE%\.local\bin\claude.exe" (
    echo        Claude Code found but not in PATH. Adding to PATH...
    set "PATH=%PATH%;%USERPROFILE%\.local\bin"
    setx PATH "%PATH%;%USERPROFILE%\.local\bin" >nul 2>&1
    goto claude_done
)
echo        Installing Claude Code...
powershell -Command "irm https://claude.ai/install.ps1 | iex"
if exist "%USERPROFILE%\.local\bin\claude.exe" (
    echo        Claude Code installed successfully
    set "PATH=%PATH%;%USERPROFILE%\.local\bin"
    setx PATH "%PATH%;%USERPROFILE%\.local\bin" >nul 2>&1
    goto claude_done
)
echo.
echo    ERROR: Installation failed.
echo    Try manually in PowerShell: irm https://claude.ai/install.ps1 ^| iex
pause
exit /b 1
:claude_done

REM Step 2: Configure for Bedrock
echo.
echo [2/2] Configuring for Amazon Bedrock...
if not exist "%USERPROFILE%\.claude" mkdir "%USERPROFILE%\.claude"
echo {"model": "us.anthropic.claude-opus-4-6-v1[1m]"} > "%USERPROFILE%\.claude\settings.json"
echo        Bedrock model configured

set CLAUDE_CODE_USE_BEDROCK=1
setx CLAUDE_CODE_USE_BEDROCK 1 >nul 2>&1

echo.
echo ===========================================
echo   Done! Claude Code is installed.
echo.
echo   To connect to your lab account:
echo   1. Paste your AWS credentials in this window
echo      (the "set" commands from Workshop Studio)
echo   2. Then run: claude
echo ===========================================
echo.
pause
