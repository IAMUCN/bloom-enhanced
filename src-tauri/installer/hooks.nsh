; LotusNotch installer hooks (Tauri NSIS, bundle.windows.nsis.installerHooks).

; The look: black like the notch, white text (the welcome / finish pages and
; the header strip; the plain Windows pages keep the system colours).
!define MUI_BGCOLOR "000000"
!define MUI_TEXTCOLOR "FFFFFF"

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
    ExecShell "runas" "$SYSDIR\cmd.exe" '/c netsh advfirewall firewall delete rule name=all program="$INSTDIR\${MAINBINARYNAME}.exe" & netsh advfirewall firewall add rule name="LotusNotch sharing" dir=in action=allow program="$INSTDIR\${MAINBINARYNAME}.exe" profile=any enable=yes' SW_HIDE
  ${EndIf}
!macroend
