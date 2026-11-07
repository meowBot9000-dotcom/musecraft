# MuseCraft — Windows viewing-station setup (optional).
#
# Run once, in an elevated PowerShell on the Windows PC you want to watch
# the stream on. It creates:
#   * a helper folder (default F:\mcview) with three tiny scripts:
#       focus.ps1    — bring the overlay window to the foreground
#       takeshot.ps1 — save a screenshot of the primary screen to viewshot.png
#       enumwins.ps1 — list titled windows (debugging the kiosk)
#   * four scheduled tasks you (or your Muse, over SSH) can trigger on demand:
#       MCBotView — open the stream overlay fullscreen in Edge kiosk mode
#       MCFocus   — run focus.ps1
#       MCShot    — run takeshot.ps1
#       MCWins    — run enumwins.ps1
#
# The overlay is expected at http://127.0.0.1:3008 — either because the bot
# runs on this PC, or because the reverse tunnel (scripts/tunnel-loop.sh)
# forwards the ports here. Change -OverlayUrl if you bound it elsewhere.
#
# Why scheduled tasks? Programs started over SSH land in a non-interactive
# session and cannot see or raise desktop windows. A scheduled task runs in
# the logged-on user's session, so it can. Trigger with:
#   Start-ScheduledTask -TaskName MCBotView
#
# Note: after the overlay page itself changes, restart Edge (kill msedge,
# re-run MCBotView) — Edge caches the page HTML.
param(
  [string]$HelperDir = 'F:\mcview',
  [string]$OverlayUrl = 'http://127.0.0.1:3008/',
  [string]$WindowTitle = 'MuseCraft - live'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $HelperDir | Out-Null

# --- focus.ps1: raise the overlay window -------------------------------
@"
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MuseCraftWin32 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
}
'@
`$p = Get-Process msedge | Where-Object { `$_.MainWindowTitle -like '$WindowTitle*' } | Select-Object -First 1
if (`$p) {
  [MuseCraftWin32]::ShowWindow(`$p.MainWindowHandle, 9) | Out-Null
  [MuseCraftWin32]::SetForegroundWindow(`$p.MainWindowHandle) | Out-Null
  'FOCUSED' | Set-Content '$HelperDir\focus.txt'
} else { 'NOT_FOUND' | Set-Content '$HelperDir\focus.txt' }
"@ | Set-Content "$HelperDir\focus.ps1"

# --- takeshot.ps1: primary screen -> viewshot.png -----------------------
@"
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
`$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
`$bmp = New-Object System.Drawing.Bitmap `$b.Width, `$b.Height
`$g = [System.Drawing.Graphics]::FromImage(`$bmp)
`$g.CopyFromScreen(`$b.Location, [System.Drawing.Point]::Empty, `$b.Size)
`$bmp.Save('$HelperDir\viewshot.png', [System.Drawing.Imaging.ImageFormat]::Png)
"@ | Set-Content "$HelperDir\takeshot.ps1"

# --- enumwins.ps1: list titled windows ----------------------------------
@"
`$lines = Get-Process | Where-Object { `$_.MainWindowHandle -ne 0 } | ForEach-Object { 'WIN ' + `$_.ProcessName + ' pid=' + `$_.Id + ' title="' + `$_.MainWindowTitle + '"' }
if (-not `$lines) { `$lines = 'NO_WINDOWS_FOUND' }
`$lines | Set-Content '$HelperDir\wins.txt'
"@ | Set-Content "$HelperDir\enumwins.ps1"

# --- scheduled tasks ------------------------------------------------------
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }

function Register-MuseTask($Name, $Exe, $Args) {
  $action = New-ScheduledTaskAction -Execute $Exe -Argument $Args
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $Name -Action $action -Principal $principal -Force | Out-Null
  Write-Host "registered $Name"
}

Register-MuseTask 'MCBotView' $edge "--kiosk $OverlayUrl --edge-kiosk-type=fullscreen --no-first-run"
Register-MuseTask 'MCFocus'   $ps "-NoProfile -ExecutionPolicy Bypass -File `"$HelperDir\focus.ps1`""
Register-MuseTask 'MCShot'    $ps "-NoProfile -ExecutionPolicy Bypass -File `"$HelperDir\takeshot.ps1`""
Register-MuseTask 'MCWins'    $ps "-NoProfile -ExecutionPolicy Bypass -File `"$HelperDir\enumwins.ps1`""

Write-Host "`nDone. Start the stream view with:  Start-ScheduledTask -TaskName MCBotView"
