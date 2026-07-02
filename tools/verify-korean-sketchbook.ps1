$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$files = @(
  (Join-Path $root 'index.html'),
  (Join-Path $root 'aidu/index.html')
)

$requiredMarkers = @(
  'openSketchbookActivity',
  'drawingBrushSizeMap',
  'selectDrawingBrushSize(1)',
  'selectDrawingBrushSize(2)',
  'selectDrawingBrushSize(3)',
  'selectDrawingBrushSize(4)',
  'Array.from({ length: 100 }',
  'aiedue_korean_drawings',
  'openFriendsDrawingGallery',
  'completeTodayDrawingMission',
  'rewardedMilestones',
  'korean-db/db-api',
  'activity-loading-text'
)

$forbiddenMarkers = @(
  'anti-db/db-api',
  'window.location.href = route.page'
)

foreach ($file in $files) {
  if (!(Test-Path $file)) {
    throw "Missing expected Korean app file: $file"
  }
  $html = Get-Content -Raw -Encoding UTF8 $file
  foreach ($marker in $requiredMarkers) {
    if (!$html.Contains($marker)) {
      throw "Korean sketchbook patch guard failed: $file is missing marker [$marker]"
    }
  }
  foreach ($marker in $forbiddenMarkers) {
    if ($html.Contains($marker)) {
      throw "Korean sketchbook patch guard failed: $file still contains forbidden marker [$marker]"
    }
  }
}

Write-Host 'Verified Korean sketchbook patch guard: both app copies keep brush buttons, 100 stages, unlock/save/gallery/reward markers, and /korean-db.'
