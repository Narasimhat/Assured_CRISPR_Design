$ErrorActionPreference = "Stop"

$sourceRoot = "C:\Users\ntelugu\Documents\Claude\Projects\CRISPR_Editing"
$destinationRoot = "U:\DATA MANAGMENT\Projects\Gene_Editing_Projects\Projects\2026_GE"
$logPath = Join-Path $PSScriptRoot "sync_project_folders.log"
$projectFolderPatterns = @(
    '^\[[^\]]+\] \([^\)]+\) - .+'
    '^\d+ \(\d+\) - .+'
)

if (-not (Test-Path -LiteralPath $destinationRoot)) {
    New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
}

$projectFolders = Get-ChildItem -LiteralPath $sourceRoot -Directory | Where-Object {
    $name = $_.Name
    $projectFolderPatterns | Where-Object { $name -match $_ }
}

foreach ($folder in $projectFolders) {
    $targetFolder = Join-Path $destinationRoot $folder.Name
    $arguments = @(
        $folder.FullName
        $targetFolder
        "/E"
        "/XO"
        "/R:1"
        "/W:1"
        "/FFT"
        "/NP"
        "/NFL"
        "/NDL"
        "/NJH"
        "/NJS"
    )

    $null = & robocopy @arguments
    $exitCode = $LASTEXITCODE

    if ($exitCode -gt 7) {
        throw "Robocopy failed for '$($folder.FullName)' with exit code $exitCode."
    }
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Sync completed successfully." | Add-Content -LiteralPath $logPath
