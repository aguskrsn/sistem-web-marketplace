@echo off
echo ====================================================
echo MENGHUBUNGKAN KE GITHUB FABIEBSKY
echo ====================================================
echo.
echo Pastikan Anda sudah login ke akun Github Anda.
echo Jika muncul pop-up dari GitHub (Git Credential Manager), 
echo silakan klik "Sign in with your browser" dan berikan izin.
echo.
echo Sedang mengunggah (push) ke GitHub...

git remote set-url origin https://github.com/aguskrsn/sistem-web-marketplace.git
git push -u origin main

echo.
echo ====================================================
echo PROSES SELESAI
echo ====================================================
pause
