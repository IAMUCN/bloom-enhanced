; LotusNotch installer hooks (Tauri NSIS, bundle.windows.nsis.installerHooks).

; The look: black like the notch, white text (the welcome / finish pages and
; the header strip; the plain Windows pages keep the system colours).
!define MUI_BGCOLOR "000000"
!define MUI_TEXTCOLOR "FFFFFF"

; Stop the running app before files are replaced or removed. The stock check
; kills every LotusNotch.exe by name, the taskbar watchdog included, so the
; Windows taskbar stayed hidden with nobody left to bring it back. Ask first
; (not when silent), stop it, then restore the taskbar from the marker.
!macro LOTUS_STOP_APP
  nsExec::Exec 'cmd /c tasklist /NH /FI "IMAGENAME eq ${MAINBINARYNAME}.exe" | find /I "${MAINBINARYNAME}.exe"'
  Pop $0
  ${If} $0 = 0
    ${IfNot} ${Silent}
      MessageBox MB_OKCANCEL|MB_ICONINFORMATION "${PRODUCTNAME} is running.$\r$\n$\r$\nPress OK to close it and continue." IDOK +2
      Abort
    ${EndIf}
    nsExec::Exec 'taskkill /F /T /IM "${MAINBINARYNAME}.exe"'
    Pop $0
    Sleep 600
    ${If} ${FileExists} "$APPDATA\${BUNDLEID}\taskbar_hidden.flag"
      ExecWait '"$INSTDIR\${MAINBINARYNAME}.exe" --restore-taskbar "$APPDATA\${BUNDLEID}\taskbar_hidden.flag"'
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro LOTUS_STOP_APP
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro LOTUS_STOP_APP
!macroend

; A manual (re)install, not an automatic update: leave a marker so the next
; start opens the first-run setup again (notch size with its live preview,
; open size, your name). The app deletes the marker (take_setup_marker).
!macro NSIS_HOOK_POSTINSTALL
  ${If} $UpdateMode <> 1
    CreateDirectory "$APPDATA\com.ucnindustries.lotusnotch"
    FileOpen $0 "$APPDATA\com.ucnindustries.lotusnotch\setup-again" w
    FileClose $0
    ; Shelf sharing needs incoming LAN traffic. Windows' own first-run prompt
    ; is easy to miss (or answer for Public only, or Cancel = a Block rule that
    ; wins over any Allow), so replace this app's rules with one Allow for
    ; every network type (home Wi-Fi, a phone hotspot, Bluetooth).
    ; Needs admin: one UAC prompt; declining only leaves
    ; sharing to Windows' prompt.
    ; An option, not a surprise: the installer asks first.
    MessageBox MB_YESNO|MB_ICONQUESTION "Add LotusNotch to the Windows Firewall exceptions?$\r$\n$\r$\nThis lets nearby PCs find this one and pair for sharing. Windows will ask for permission (administrator)." /SD IDYES IDNO lotus_skip_firewall
    ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name=all program="$INSTDIR\${MAINBINARYNAME}.exe" & netsh advfirewall firewall add rule name="LotusNotch sharing" dir=in action=allow program="$INSTDIR\${MAINBINARYNAME}.exe" profile=any enable=yes' SW_HIDE
    ; Say so if it did not take (UAC declined, rule refused): looking the rule up
    ; needs no administrator rights.
    nsExec::Exec 'netsh advfirewall firewall show rule name="LotusNotch sharing"'
    Pop $0
    ${If} $0 <> 0
      MessageBox MB_OK|MB_ICONINFORMATION "The firewall exception was not added.$\r$\n$\r$\nLotusNotch works without it. To share with nearby PCs later, open the Shelf's sharing and choose Allow in Windows Firewall." /SD IDOK
    ${EndIf}
    lotus_skip_firewall:
  ${EndIf}
!macroend

; Uninstall (not an update, which keeps the same path and so the same rule):
; remove this app's firewall rule. Administrator rights are only asked for when
; there is a rule to remove.
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    nsExec::Exec 'netsh advfirewall firewall show rule name="LotusNotch sharing"'
    Pop $0
    ${If} $0 = 0
      ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name=all program="$INSTDIR\${MAINBINARYNAME}.exe"' SW_HIDE
    ${EndIf}
  ${EndIf}
!macroend
