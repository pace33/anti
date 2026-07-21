$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$indexPath = Join-Path $root 'index.html'
$appPath = Join-Path $root 'app.js'
$appCssPath = Join-Path $root 'app.css'

foreach ($file in @($indexPath, $appPath, $appCssPath)) {
  if (!(Test-Path $file)) {
    throw "Missing expected Korean app file: $file"
  }
}

$index = Get-Content -Raw -Encoding UTF8 $indexPath
$app = Get-Content -Raw -Encoding UTF8 $appPath
$appCss = Get-Content -Raw -Encoding UTF8 $appCssPath

if ($index -notmatch 'src=["'']app\.js') {
  throw 'index.html must load app.js as an external module.'
}
if ($index -notmatch 'href=["'']app\.css') {
  throw 'index.html must load app.css.'
}
if ($index -match '<script\s+type=["'']module["'']\s*>') {
  throw 'Inline module JavaScript must remain split out of index.html.'
}

$requiredAppMarkers = @(
  'openSketchbookActivity',
  'openCurrentDrawingMission',
  'drawingBrushSizeMap',
  'drawingShapeLibrary',
  'evaluateDrawingAccuracy',
  'openFriendsDrawingGallery',
  'completeTodayDrawingMission',
  'aiedueKoreanDrawingsV2',
  'persistDrawingRecord',
  'sanitizeModalHtml',
  'enhanceInteractiveSemantics'
)

foreach ($marker in $requiredAppMarkers) {
  if (!$app.Contains($marker)) {
    throw "Korean app guard failed: app.js is missing marker [$marker]"
  }
}

$forbiddenMarkers = @(
  'anti-db/db-api',
  'korean-db/db-api',
  'school-firestore-adapter',
  'localStorage',
  'sessionStorage',
  'window.location.href = route.page',
  'fillText(info.emoji',
  'fillText(info.label'
)

foreach ($marker in $forbiddenMarkers) {
  if ($app.Contains($marker)) {
    throw "Korean app guard failed: app.js contains forbidden marker [$marker]"
  }
}

if (!$appCss.Contains('.skip-link') -or !$appCss.Contains(':focus-visible') -or !$appCss.Contains('prefers-reduced-motion')) {
  throw 'Accessibility styles are missing from app.css.'
}

if (Test-Path (Join-Path $root 'school-firestore-adapter.js')) {
  throw 'The retired Firestore adapter must not be deployed.'
}
if (Test-Path (Join-Path $root 'aidu')) {
  throw 'The duplicate aidu directory must not be deployed.'
}

Write-Host 'Verified modular Korean app, drawing missions, self-hosted drawing persistence, XSS safeguards, and accessibility styles.'
