$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Drawing
function Assert-Prism($Condition, [string]$Message) { if (!$Condition) { throw $Message } }
$version = (Get-Content -LiteralPath src-tauri/tauri.conf.json -Raw | ConvertFrom-Json).version
$portable = Join-Path (Get-Location) "dist-native/Prism-$version-win32-x64"
$package = Join-Path (Get-Location) "dist-msix/Prism-$version.0-x64.msix"
$zip = [IO.Compression.ZipFile]::OpenRead($package)
try {
  $expected = @('AppxManifest.xml','AppxBlockMap.xml','[Content_Types].xml','Prism.exe','Prism.Windows.exe','LICENSE','THIRD_PARTY_NOTICES.txt','DEPENDENCY_LICENSES.txt','RUST_STANDARD_LIBRARY_LICENSES.html','Assets/StoreLogo.png','Assets/Square150x150Logo.png','Assets/Square44x44Logo.png')
  $names = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
  Assert-Prism (($names.Count -eq $expected.Count) -and !(Compare-Object $names $expected)) 'Unexpected or missing MSIX content.'
  $content = @{}
  foreach ($entry in $zip.Entries) {
    $inputStream = $entry.Open(); $memory = New-Object IO.MemoryStream
    try { $inputStream.CopyTo($memory); $content[$entry.FullName.Replace('\','/')] = $memory.ToArray() }
    finally { $inputStream.Dispose(); $memory.Dispose() }
  }
  [xml]$manifest = [Text.Encoding]::UTF8.GetString($content['AppxManifest.xml'])
  Assert-Prism ($manifest.Package.Identity.Name -ceq 'Elkhalil.PrismforCodex') 'Wrong Store name.'
  Assert-Prism ($manifest.Package.Identity.Publisher -ceq 'CN=B65150B8-B748-4453-A47B-CE9096A6199C') 'Wrong Store publisher.'
  Assert-Prism ($manifest.Package.Identity.Version -eq "$version.0") 'Wrong Store version.'
  Assert-Prism ($manifest.Package.Identity.ProcessorArchitecture -eq 'x64') 'Wrong Store architecture.'
  Assert-Prism ($manifest.Package.Properties.DisplayName -eq 'Prism for Codex') 'Wrong Store display name.'
  Assert-Prism ($manifest.Package.Dependencies.TargetDeviceFamily.Name -eq 'Windows.Desktop') 'Unexpected target device family.'
  $capabilities = @($manifest.Package.Capabilities.ChildNodes | Where-Object NodeType -eq Element)
  Assert-Prism ($capabilities.Count -eq 1 -and $capabilities[0].Name -eq 'runFullTrust') 'Unexpected capabilities.'
  $startup = $manifest.SelectSingleNode('//*[local-name()="StartupTask"]')
  Assert-Prism ($startup.TaskId -eq 'PrismStartup' -and $startup.Enabled -eq 'false') 'Startup must begin disabled.'
  Assert-Prism ($startup.ParentNode.Executable -eq 'Prism.Windows.exe') 'Wrong startup executable.'
  foreach ($name in @('Prism.exe','Prism.Windows.exe','LICENSE','THIRD_PARTY_NOTICES.txt','DEPENDENCY_LICENSES.txt','RUST_STANDARD_LIBRARY_LICENSES.html')) {
    $source = [IO.File]::ReadAllBytes((Join-Path $portable $name))
    Assert-Prism ([Convert]::ToBase64String($source) -ceq [Convert]::ToBase64String($content[$name])) "MSIX differs from portable input: $name"
  }
  foreach ($name in @('Prism.exe','Prism.Windows.exe')) {
    $bytes = $content[$name]; $pe = [BitConverter]::ToInt32($bytes, 60)
    Assert-Prism ([BitConverter]::ToUInt16($bytes, $pe + 4) -eq 0x8664) "$name is not x64."
    $flags = [BitConverter]::ToUInt16($bytes, $pe + 24 + 70)
    Assert-Prism (($flags -band 0x160) -eq 0x160) "$name lacks ASLR, high-entropy ASLR or DEP."
  }
  foreach ($pair in @(@('StoreLogo',50),@('Square150x150Logo',150),@('Square44x44Logo',44))) {
    $memory = New-Object IO.MemoryStream(,$content["Assets/$($pair[0]).png"])
    $image = [Drawing.Image]::FromStream($memory)
    try { Assert-Prism ($image.Width -eq $pair[1] -and $image.Height -eq $pair[1]) "Wrong logo dimensions: $($pair[0])" }
    finally { $image.Dispose(); $memory.Dispose() }
  }
  [xml]$map = [Text.Encoding]::UTF8.GetString($content['AppxBlockMap.xml'])
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    foreach ($file in $map.BlockMap.File) {
      $bytes = $content[$file.Name.Replace('\','/')]; $offset = 0
      Assert-Prism ($bytes.Length -eq [long]$file.Size) "Wrong block-map size: $($file.Name)"
      foreach ($block in $file.Block) {
        $length = [Math]::Min(65536, $bytes.Length - $offset)
        $hash = [Convert]::ToBase64String($sha.ComputeHash($bytes, $offset, $length))
        Assert-Prism ($hash -ceq $block.Hash) "Bad block hash: $($file.Name)"
        $offset += $length
      }
      Assert-Prism ($offset -eq $bytes.Length) "Incomplete block map: $($file.Name)"
    }
  } finally { $sha.Dispose() }
  Write-Output 'PASS: unsigned MSIX identity, exact contents, native inputs, startup opt-in, PE safety flags, icons and every block hash.'
} finally { $zip.Dispose() }
