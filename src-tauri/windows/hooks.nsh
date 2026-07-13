!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec 'taskkill /F /IM controle-de-brilho.exe /T'
!macroend