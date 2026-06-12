; Tauri NSIS installer hooks for Kiro Chat.
; Adds a Start Menu shortcut that opens kiro-cli in a traditional PowerShell
; window, preserving the classic terminal workflow alongside the app.

!macro NSIS_HOOK_POSTINSTALL
  CreateShortcut "$SMPROGRAMS\Kiro Chat\Kiro CLI (Terminal).lnk" \
    "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" \
    `-NoExit -Command "if (Get-Command kiro-cli -ErrorAction SilentlyContinue) { kiro-cli } else { Write-Host 'Abra o Kiro Chat primeiro para concluir a instalacao do Kiro CLI.' }"` \
    "$INSTDIR\${MAINBINARYNAME}.exe" 0
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$SMPROGRAMS\Kiro Chat\Kiro CLI (Terminal).lnk"
!macroend
