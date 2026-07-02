$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$files = @(
  (Join-Path $root 'index.html'),
  (Join-Path $root 'aidu/index.html')
)

$requiredMarkers = @(
  'openSketchbookActivity',
  'drawing-mission-next-label',
  'mission-draft',
  'drawingBrushSizeMap',
  'selectDrawingBrushSize(1)',
  'selectDrawingBrushSize(2)',
  'selectDrawingBrushSize(3)',
  'selectDrawingBrushSize(4)',
  'Array.from({ length: 100 }',
  'drawingShapeLibrary',
  'shapeMissionTemplates',
  'shape-mission',
  'ai-drawing',
  'evaluateDrawingAccuracy',
  'instances.push({ shape: key, index, hit: shapeHit, total: pts.length, accuracy: instanceAccuracy })',
  'const accuracy = instanceCount ? Math.round(accuracySum / instanceCount) : 0',
  'const threshold = Math.min(22, Math.max(10, drawingBrushSize * 0.9))',
  'applyShapeAccuracyStats',
  'openMyShapeStats',
  'shapeStats',
  'unpaidCooldownUntil',
  'aiedue_korean_drawings',
  'openFriendsDrawingGallery',
  'completeTodayDrawingMission',
  'rewardedMilestones',
  'korean-db/db-api',
  'activity-loading-text'
)

$forbiddenMarkers = @(
  'anti-db/db-api',
  'window.location.href = route.page',
  'fillText(info.emoji',
  'fillText(info.label'
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

Write-Host 'Verified Korean sketchbook/shape mission guard: brush buttons, 100 stages, real shape templates, accuracy stats, rewards/cooldown, gallery, and /korean-db are preserved.'
