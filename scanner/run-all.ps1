$ErrorActionPreference = 'Continue'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$LogDir  = Join-Path $ScriptDir 'logs'
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }
$LogFile = Join-Path $LogDir ("scan-$(Get-Date -Format 'yyyy-MM-dd_HH-mm').log")

function Log($msg) {
  $line = "$(Get-Date -Format 'HH:mm:ss')  $msg"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Log "=== APEX scanner run starting ==="

$scanners = @(
  @{ label = 'Suffolk Registry';              cmd = 'node registries/masslandrecords.js suffolk --since-last' },
  @{ label = 'Middlesex South Registry';      cmd = 'node registries/masslandrecords.js middlesex_south --since-last' },
  @{ label = 'Middlesex North Registry';      cmd = 'node registries/masslandrecords.js middlesex_north --since-last' },
  @{ label = 'Norfolk Registry';              cmd = 'node registries/norfolk.js --since-last' },
  @{ label = 'Essex SPA';                     cmd = 'node registries/essex_spa.js --since-last' },
  @{ label = 'TitleView (Plymouth)';          cmd = 'node registries/titleview.js --since-last' },
  @{ label = 'MassCourts (divorce/eviction)'; cmd = 'node registries/masscourts.js --days=1' },
  @{ label = 'Boston Violations';             cmd = 'node registries/boston_violations.js --days=1' }
)

$total_ok  = 0
$total_err = 0

foreach ($s in $scanners) {
  Log "--- $($s.label)"
  $start = Get-Date
  $output = & cmd /c "$($s.cmd) 2>&1"
  $exit   = $LASTEXITCODE
  $elapsed = [int](((Get-Date) - $start).TotalSeconds)

  $output | ForEach-Object { Log "    $_" }
  if ($exit -ne 0) {
    Log "    [FAILED exit=$exit elapsed=${elapsed}s]"
    $total_err++
  } else {
    Log "    [OK elapsed=${elapsed}s]"
    $total_ok++
  }
}

Log "=== Done: $total_ok ok / $total_err failed ==="

# Send notifications for any new leads found during this run
Log "--- Notifications"
$notifOutput = & cmd /c "node notify-after-run.js 2>&1"
$notifOutput | ForEach-Object { Log "    $_" }
