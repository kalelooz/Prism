param([ValidateSet('Inspect','Launch','Verify','Show','Settings','Fonts','TaskManager')] [string]$Action = 'Inspect')
function Test-PrismProfile([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine) -or $CommandLine.Length -gt 32767) { throw 'The wallpaper session command line is unavailable.' }
  if (-not ('Prism.CommandLine' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace Prism {
  public static class CommandLine {
    [DllImport("shell32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CommandLineToArgvW(string commandLine, out int count);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    public static string[] Parse(string commandLine) {
      int count;
      IntPtr memory = CommandLineToArgvW(commandLine, out count);
      if (memory == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
      try {
        string[] args = new string[count];
        for (int i = 0; i < count; i++) args[i] = Marshal.PtrToStringUni(Marshal.ReadIntPtr(memory, i * IntPtr.Size));
        return args;
      } finally { LocalFree(memory); }
    }
  }
}
'@
  }
  $arguments = @([Prism.CommandLine]::Parse($CommandLine) | Select-Object -Skip 1)
  $end = [Array]::IndexOf($arguments, '--')
  if ($end -ge 0) { $arguments = @($arguments | Select-Object -First $end) }
  $expected = Join-Path $env:LOCALAPPDATA 'Prism\wallpaper-codex-profile'
  $profiles = @($arguments | Where-Object { $_ -eq '--user-data-dir' -or $_ -like '--user-data-dir=*' })
  $ports = @($arguments | Where-Object { $_ -eq '--remote-debugging-port' -or $_ -like '--remote-debugging-port=*' })
  if ($profiles.Count -ne 1 -or $profiles[0] -cnotlike '--user-data-dir=*') { throw 'The wallpaper session has no unique dedicated profile. Open Codex through Prism.' }
  if ($ports.Count -ne 1 -or $ports[0] -cne '--remote-debugging-port=9339') { throw 'The wallpaper session has no unique expected debugging port. Open Codex through Prism.' }
  $actual = $profiles[0].Substring('--user-data-dir='.Length)
  if (![string]::Equals($actual.TrimEnd('\'), $expected.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'The wallpaper session uses a different profile. Open Codex through Prism.' }
}
try {
$ErrorActionPreference = 'Stop'
$prismCode = 'helper-unavailable'
if ($Action -eq 'TaskManager') {
  Start-Process -FilePath (Join-Path ([Environment]::GetFolderPath('System')) 'Taskmgr.exe') | Out-Null
  @{ opened = $true } | ConvertTo-Json -Compress
  exit
}
if ($Action -eq 'Fonts') {
  Add-Type -AssemblyName System.Drawing
  $prismFonts = New-Object System.Drawing.Text.InstalledFontCollection
  try { @{ families = @($prismFonts.Families | ForEach-Object { $_.Name } | Sort-Object -Unique) } | ConvertTo-Json -Compress }
  finally { $prismFonts.Dispose() }
  exit
}
# Resolve the registered package; Windows replaces its versioned directory on update.
$prismPackages = @(Get-AppxPackage -Name OpenAI.Codex)
if (!$prismPackages.Count) { $prismCode = 'codex-missing'; throw 'The official Codex Windows app is not installed for this Windows user.' }
if ($prismPackages.Count -ne 1 -or $prismPackages[0].PackageFamilyName -ne 'OpenAI.Codex_2p2nqsd0c76g0') { $prismCode = 'unsafe-install'; throw 'The installed official Codex package could not be identified.' }
$prismPackage = $prismPackages[0]
$prismVersion = [string]$prismPackage.Version
# Keep the version for diagnosis; the shared wallpaper adapter checks the live layout before applying.
$prismExecutable = Join-Path $prismPackage.InstallLocation 'app\ChatGPT.exe'
if (!(Test-Path -LiteralPath $prismExecutable)) { $prismCode = 'codex-missing'; throw 'The installed official Codex executable could not be found.' }
$prismSignature = Get-AuthenticodeSignature -LiteralPath $prismExecutable
if ($prismSignature.Status -ne 'Valid' -or $prismSignature.SignerCertificate.Subject -notmatch 'O="?OpenAI OpCo, LLC') { $prismCode = 'unsafe-install'; throw 'The expected signed OpenAI application could not be verified.' }
# Older installed Codex processes must also close before opening a new session.
$prismPackagePattern = Join-Path (Split-Path -Parent $prismPackage.InstallLocation) 'OpenAI.Codex_*\app\ChatGPT.exe'
$prismProcesses = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $prismExecutable -or $_.ExecutablePath -like $prismPackagePattern })
if ($Action -eq 'Launch') {
  if ($prismProcesses.Count) { $prismCode = 'codex-open'; throw 'Codex is still running as ChatGPT.exe. Save your work and choose Quit from its Windows tray icon. Prism will never force-close it.' }
  if (Get-NetTCPConnection -State Listen -LocalPort 9339 -ErrorAction SilentlyContinue) { $prismCode = 'port-in-use'; throw 'Wallpaper port 9339 is occupied. Nothing was started.' }
  $prismProfile = Join-Path $env:LOCALAPPDATA 'Prism\wallpaper-codex-profile'
  New-Item -ItemType Directory -Path $prismProfile -Force | Out-Null
  Start-Process -FilePath $prismExecutable -ArgumentList @('--remote-debugging-address=127.0.0.1','--remote-debugging-port=9339',('--user-data-dir="' + $prismProfile + '"')) | Out-Null
  @{ launched = $true; port = 9339 } | ConvertTo-Json -Compress
  exit
}
if ($Action -in @('Inspect','Verify','Show','Settings')) {
  $prismListeners = @(Get-NetTCPConnection -State Listen -LocalPort 9339 -ErrorAction SilentlyContinue)
  if (!$prismListeners.Count) {
    $prismCode = if ($prismProcesses.Count) { 'codex-open' } else { 'codex-closed' }
    if ($Action -eq 'Inspect') {
      $prismIds = @($prismProcesses | ForEach-Object { [int]$_.ProcessId })
      $prismMainIds = @($prismProcesses | Where-Object { $_.CommandLine -notmatch '(?:^|\s)--type=' } | ForEach-Object { [int]$_.ProcessId })
      $prismBackgroundOnly = $false
      if ($prismIds.Count) {
        try { $prismBackgroundOnly = @(Get-Process -Id $prismIds -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 }).Count -eq 0 } catch {}
      }
      @{ code = $prismCode; detail = ''; version = $prismVersion; processIds = $prismIds; mainProcessIds = $prismMainIds; backgroundOnly = $prismBackgroundOnly } | ConvertTo-Json -Compress
      exit
    }
    throw 'No exclusively loopback wallpaper endpoint is available. Start a wallpaper session first.'
  }
  $prismCode = 'unsafe-session'
  if (@($prismListeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }).Count) { throw 'No exclusively loopback wallpaper endpoint is available. Start a wallpaper session first.' }
  foreach ($prismListener in $prismListeners) {
    $prismOwner = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $prismListener.OwningProcess)
    if ($prismOwner.ExecutablePath -ne $prismExecutable) { $prismCode = 'port-in-use'; throw 'The wallpaper endpoint is not owned by the expected official Codex process.' }
    Test-PrismProfile $prismOwner.CommandLine
  }
  if ($Action -eq 'Inspect') { @{ code = 'ready'; detail = ''; version = $prismVersion } | ConvertTo-Json -Compress; exit }
  if ($Action -in @('Show','Settings')) {
    $prismProfile = Join-Path $env:LOCALAPPDATA 'Prism\wallpaper-codex-profile'
    $prismArguments = @(('--user-data-dir="' + $prismProfile + '"'))
    if ($Action -eq 'Settings') { $prismArguments += 'codex://settings' }
    # The verified existing session handles this second-instance request and opens its window.
    Start-Process -FilePath $prismExecutable -WindowStyle Hidden -ArgumentList $prismArguments | Out-Null
    @{ opened = $true } | ConvertTo-Json -Compress
    exit
  }
  @{ verified = $true; version = $prismVersion; port = 9339 } | ConvertTo-Json -Compress
  exit
}
@{ version = $prismVersion; running = ($prismProcesses.Count -gt 0); signed = $true } | ConvertTo-Json -Compress
} catch {
  if ($Action -eq 'Inspect') { @{ code = $prismCode; detail = $_.Exception.Message } | ConvertTo-Json -Compress; exit }
  @{ error = $_.Exception.Message; code = $prismCode } | ConvertTo-Json -Compress; exit 1
}
