@echo off
title Instalando dependencias - Controle de Brilho
cd /d "%~dp0"

echo ========================================
echo   Controle de Brilho - Instalacao
echo ========================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Python nao foi encontrado no seu PC.
    echo Instale o Python em https://www.python.org/downloads/
    echo e marque a opcao "Add Python to PATH" durante a instalacao.
    echo.
    pause
    exit /b 1
)

echo Instalando as bibliotecas necessarias, aguarde...
echo.
python -m pip install --upgrade pip
python -m pip install customtkinter monitorcontrol pystray Pillow

if errorlevel 1 (
    echo.
    echo [ERRO] Algo deu errado durante a instalacao.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Instalacao concluida com sucesso!
echo   Agora e so rodar o arquivo "abrir.bat"
echo ========================================
echo.
pause
