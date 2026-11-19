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
  ${EndIf}
!macroend
