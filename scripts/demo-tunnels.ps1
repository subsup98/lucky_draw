# 3개 cloudflared 임시 터널을 한 번에 띄우고 URL 을 출력한다.
# 전제: dev 서버 (backend/user/admin) 가 이미 떠 있어야 함.
# 사용: pwsh scripts/demo-tunnels.ps1
# 종료: Ctrl+C — 모든 터널 자동 종료.

$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
$logDir = Join-Path $root ".tunnels"
New-Item -ItemType Directory -Force $logDir | Out-Null

$tunnels = @(
    [ordered]@{ Name = "backend"; Port = 4000 },
    [ordered]@{ Name = "user";    Port = 3000 },
    [ordered]@{ Name = "admin";   Port = 3001 }
)

$state = @()
foreach ($t in $tunnels) {
    $log = Join-Path $logDir "$($t.Name).log"
    if (Test-Path $log) { Remove-Item $log -Force }
    $p = Start-Process -FilePath "cloudflared" `
        -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://localhost:$($t.Port)", "--logfile", $log, "--loglevel", "info") `
        -PassThru -WindowStyle Hidden
    $state += [pscustomobject]@{
        Process = $p
        Name    = $t.Name
        Port    = $t.Port
        Log     = $log
        Url     = $null
    }
}

Write-Host "[demo] cloudflared 3개 시작 — URL 발급 대기 (최대 60초)..."

$urlRegex = "https://[a-z0-9-]+\.trycloudflare\.com"
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    $remaining = $false
    foreach ($s in $state) {
        if (-not $s.Url -and (Test-Path $s.Log)) {
            $found = Select-String -Path $s.Log -Pattern $urlRegex -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $s.Url = $found.Matches[0].Value }
        }
        if (-not $s.Url) { $remaining = $true }
    }
    if (-not $remaining) { break }
    Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "=== Demo URLs ==="
foreach ($s in $state) {
    if ($s.Url) {
        Write-Host ("  {0,-8} (:{1}) -> {2}" -f $s.Name, $s.Port, $s.Url)
    } else {
        Write-Host ("  {0,-8} (:{1}) -> TIMEOUT  log: {2}" -f $s.Name, $s.Port, $s.Log) -ForegroundColor Yellow
    }
}

$backend = ($state | Where-Object Name -eq "backend").Url
if ($backend) {
    Write-Host ""
    Write-Host "=== 모바일 데모 절차 ==="
    Write-Host "1) apps/mobile/.env 의 두 값을 다음으로 교체:"
    Write-Host "     EXPO_PUBLIC_API_BASE_URL=$backend"
    Write-Host "     EXPO_PUBLIC_OAUTH_BASE_URL=$backend"
    Write-Host "2) 새 터미널: pnpm --filter @lucky/mobile start --tunnel"
    Write-Host "3) Expo Go (테스터 폰) 로 QR 스캔"
}

Write-Host ""
Write-Host "Ctrl+C 로 모든 터널 종료. (이 창 유지)"

try {
    while ($true) {
        $alive = $state | Where-Object { -not $_.Process.HasExited }
        if ($alive.Count -eq 0) { break }
        Start-Sleep -Seconds 5
    }
} finally {
    foreach ($s in $state) {
        if (-not $s.Process.HasExited) {
            Stop-Process -Id $s.Process.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[demo] 모든 터널 종료됨."
}
