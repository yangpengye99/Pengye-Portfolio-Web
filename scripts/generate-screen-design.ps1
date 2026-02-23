param(
  [string]$SourceDir = (Join-Path $PSScriptRoot "..\\Screen Design"),
  [string]$AssetsDir = (Join-Path $PSScriptRoot "..\\assets\\screen-design"),
  [string]$HtmlPath = (Join-Path $PSScriptRoot "..\\index.html"),
  [int]$MaxSlots = 8
)

$sourceDirPath = Resolve-Path $SourceDir
$assetsDirPath = Resolve-Path -Path $AssetsDir -ErrorAction SilentlyContinue
if (-not $assetsDirPath) {
  $assetsDirPath = New-Item -ItemType Directory -Force -Path $AssetsDir
} else {
  $assetsDirPath = $assetsDirPath.Path
}
$htmlPathResolved = Resolve-Path $HtmlPath

$patterns = @("is-mid", "is-tall", "is-mid", "is-tall", "is-tall", "is-mid", "is-tall", "is-mid")
$allowed = @(".png", ".jpg", ".jpeg", ".webp")

$files = Get-ChildItem -Path $sourceDirPath -File |
  Where-Object { $allowed -contains $_.Extension.ToLowerInvariant() } |
  Sort-Object Name

foreach ($file in $files) {
  Copy-Item -Force $file.FullName (Join-Path $assetsDirPath $file.Name)
}

$tiles = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $MaxSlots; $i++) {
  $class = $patterns[$i % $patterns.Count]
  if ($i -lt $files.Count) {
    $file = $files[$i]
    $base = $file.BaseName
    $encoded = [System.Uri]::EscapeDataString($file.Name)
    $tiles.Add("            <article class=\"screen-tile $class\">")
    $tiles.Add("              <div class=\"thumb thumb--screen\">")
    $tiles.Add("                <img")
    $tiles.Add("                  src=\"assets/screen-design/$encoded\"")
    $tiles.Add("                  alt=\"$base\"")
    $tiles.Add("                  loading=\"lazy\"")
    $tiles.Add("                />")
    $tiles.Add("              </div>")
    $tiles.Add("              <div class=\"screen-caption\">$base</div>")
    $tiles.Add("            </article>")
  } else {
    $num = "{0:D2}" -f ($i + 1)
    $tiles.Add("            <article class=\"screen-tile $class\">")
    $tiles.Add("              <div class=\"thumb thumb--screen\" aria-hidden=\"true\"></div>")
    $tiles.Add("              <div class=\"screen-caption\">Concept Screen $num</div>")
    $tiles.Add("            </article>")
  }
}

$block = @()
$block += "          <!-- screen-design:begin -->"
$block += $tiles
$block += "          <!-- screen-design:end -->"
$replacement = ($block -join "`r`n")

$html = Get-Content -Raw -Path $htmlPathResolved
$pattern = "(?s)\\s*<!-- screen-design:begin -->.*?<!-- screen-design:end -->"
if ($html -notmatch $pattern) {
  throw "screen-design markers not found in $htmlPathResolved"
}

$html = [Regex]::Replace($html, $pattern, "`r`n$replacement")
Set-Content -Path $htmlPathResolved -Value $html -NoNewline

Write-Host "Updated $htmlPathResolved"
