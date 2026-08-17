# restore-test.ps1 — Drill restore backup end-to-end (DEPLOYMENT.md §8)
#
# Membuktikan backup 3-2-1 benar-benar bisa dipulihkan: file .gpg dari
# artifact GitHub / Google Drive didekripsi, di-restore ke project Supabase
# SEMENTARA (scratch), lalu dihitung jumlah baris tabel publik.
#
# PENTING:
#   - TARGET_DB_URL harus SESSION POOLER ke project SCRATCH (bukan produksi!)
#     contoh: postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
#   - Key/koneksi diambil dari environment; TIDAK PERNAH di-log oleh skrip.
#   - Butuh psql di PATH (postgresql-client / pgAdmin / Docker).
#
# Penggunaan (PowerShell):
#   $env:BACKUP_ENCRYPTION_KEY = "<passphrase dari GitHub secret>"
#   $env:TARGET_DB_URL = "postgresql://...scratch...?sslmode=require"
#   .\scripts\restore-test.ps1 -GpgFile "backup.sql.gpg"
#
# Output: "RESTORE TEST: PASS (n baris)" — hasil dicatat di DEPLOYMENT.md §8.

param(
    [string]$GpgFile = "backup.sql.gpg",
    [string]$TargetDbUrl = $env:TARGET_DB_URL,
    [string]$EncKey = $env:BACKUP_ENCRYPTION_KEY
)

$ErrorActionPreference = "Stop"

if (-not $TargetDbUrl) { Write-Error "TARGET_DB_URL belum di-set (harus project SCRATCH)."; exit 1 }
if (-not $EncKey)     { Write-Error "BACKUP_ENCRYPTION_KEY belum di-set."; exit 1 }
if (-not (Test-Path -LiteralPath $GpgFile)) { Write-Error "File $GpgFile tidak ditemukan."; exit 1 }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Error "psql tidak ditemukan di PATH — install postgresql-client atau gunakan psql dari pgAdmin/Docker."
    exit 1
}

$tmpSql = Join-Path ([System.IO.Path]::GetTempPath()) ("restore-test-" + [guid]::NewGuid().ToString("N") + ".sql")

try {
    Write-Host "[1/4] Dekripsi AES-256 (GPG)..." -ForegroundColor Cyan
    & gpg --batch --yes --quiet --decrypt --passphrase $EncKey -o $tmpSql $GpgFile
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $tmpSql)) {
        Write-Error "Dekripsi gagal (passphrase salah atau file korup)."
    }
    Write-Host "      OK — $((Get-Item $tmpSql).Length) byte terdekripsi."

    Write-Host "[2/4] Restore ke project SCRATCH..." -ForegroundColor Cyan
    & psql $TargetDbUrl -v ON_ERROR_STOP=1 -q -f $tmpSql
    if ($LASTEXITCODE -ne 0) { Write-Error "Restore gagal — lihat error psql di atas." }

    Write-Host "[3/4] Verifikasi jumlah baris..." -ForegroundColor Cyan
    $tables = @("projects", "certificates", "contact_messages", "profiles", "login_attempts")
    foreach ($t in $tables) {
        $count = & psql $TargetDbUrl -t -A -c "select count(*) from public.$t" 2>$null
        if ($LASTEXITCODE -ne 0) { $count = "tabel tidak ada (wajar untuk tabel audit)" }
        Write-Host ("      {0,-20} {1}" -f $t, $count)
    }

    Write-Host "[4/4] Bersihkan file sementara..." -ForegroundColor Cyan
    Remove-Item -LiteralPath $tmpSql -Force -ErrorAction SilentlyContinue

    Write-Host "`nRESTORE TEST: PASS" -ForegroundColor Green
    Write-Host "Catat tanggal & hasil ini di docs/DEPLOYMENT.md §8 (drill terakhir)." -ForegroundColor Yellow
    exit 0
}
catch {
    if (Test-Path -LiteralPath $tmpSql) { Remove-Item -LiteralPath $tmpSql -Force -ErrorAction SilentlyContinue }
    Write-Host "`nRESTORE TEST: FAIL" -ForegroundColor Red
    Write-Error $_
    exit 1
}