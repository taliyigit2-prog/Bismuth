; Bismuth NSIS additions (Faz 13 madde 9): a Windows Defender Firewall rule so phones and other computers can reach
; the hotel's main computer in server mode. Only private networks (home / work; NetBird's adapter too), never public
; ones (cafe Wi-Fi), and only for Bismuth.exe. The installer is per-user (no administrator prompt): when Windows does
; not allow the rule from here, nothing breaks; Windows then asks once, the first time the server starts ("Allow
; access on private networks"), as docs/uzaktan-erisim.md describes. The uninstaller removes the rule.

!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Bismuth"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Bismuth" dir=in action=allow program="$INSTDIR\Bismuth.exe" enable=yes profile=private protocol=TCP'
  Pop $0
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Bismuth"'
  Pop $0
!macroend

; Faz 16 madde 3: the uninstaller's first page says that removing Bismuth keeps the records. electron-builder keeps the
; data folder (nsis.deleteAppDataOnUninstall: false); this only tells the owner, in the installer's language
; (1055 Turkish, 1033 English, 1049 Russian). An update runs the old uninstaller silently and never shows this page.
!ifdef BUILD_UNINSTALLER
  LangString bismuthUnWelcomeText 1055 "Bismuth bu bilgisayardan kaldırılacak.$\r$\n$\r$\nKayıtlarınız silinmez: veriler, ekler ve yedekler veri klasöründe ($APPDATA\Bismuth) kalır. Bismuth'u yeniden kurarsanız hepsi yerinde olur.$\r$\n$\r$\nDevam etmek için İleri'ye basın."
  LangString bismuthUnWelcomeText 1033 "Bismuth will be removed from this computer.$\r$\n$\r$\nYour records are not deleted: data, attachments and backups stay in the data folder ($APPDATA\Bismuth). If you install Bismuth again, everything will be there.$\r$\n$\r$\nClick Next to continue."
  LangString bismuthUnWelcomeText 1049 "Bismuth будет удалён с этого компьютера.$\r$\n$\r$\nВаши записи не удаляются: данные, вложения и резервные копии остаются в папке данных ($APPDATA\Bismuth). Если снова установить Bismuth, всё будет на месте.$\r$\n$\r$\nНажмите «Далее», чтобы продолжить."

  !macro customUnWelcomePage
    !define MUI_WELCOMEPAGE_TEXT "$(bismuthUnWelcomeText)"
    !insertmacro MUI_UNPAGE_WELCOME
  !macroend
!endif
