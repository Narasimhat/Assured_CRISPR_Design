# pull-updates.ps1
# Periodically pulls latest changes from `origin/main` and installs dependencies if package.json/lockfile changed.
#
# Note: if dependency versions change, the running Vite dev server may need a restart for changes to take effect.

param(
  [string]$RepoPath = "c:\Users\ntelugu\Documents\Claude\Projects\CRISPR_Editing\assured-crispr-designer",
  [string]$Remote = "origin",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$gitPath = "C:\Users\ntelugu\AppData\Local\Programs\Git\cmd\git.exe"
$npmPath = "C:\Program Files\nodejs\npm"

if (!(Test-Path $RepoPath)) {
  Write-Host "Repo path not found: $RepoPath"
  exit 1
}

if (!(Test-Path $gitPath)) {
  Write-Host "git not found at: $gitPath"
  exit 1
}

if (!(Test-Path $npmPath)) {
  Write-Host "npm not found at: $npmPath"
  exit 1
}

Set-Location $RepoPath

# If you have local uncommitted changes to TRACKED files, skip pulling to avoid merge conflicts.
# Untracked files (like this script itself) are common and should not block pulls.
$porcelain = & $gitPath status --porcelain
$trackedChanges = @()
if ($porcelain) {
  $trackedChanges = $porcelain | Where-Object { $_ -notmatch '^\?\?\s' }
}
if ($trackedChanges -and $trackedChanges.Count -ne 0) {
  Write-Host "Local changes to tracked files detected; skipping pull."
  exit 0
}

$beforeHead = & $gitPath rev-parse HEAD

& $gitPath fetch $Remote

$remoteHead = & $gitPath rev-parse "$Remote/$Branch"
$localHead = & $gitPath rev-parse HEAD

if ($localHead -eq $remoteHead) {
  Write-Host "Up to date."
  exit 0
}

Write-Host "Pulling latest changes from $Remote/$Branch..."
& $gitPath pull --rebase $Remote $Branch

# If dependencies changed, re-install to keep node_modules in sync.
$changedFiles = & $gitPath diff --name-only "$beforeHead..HEAD"
if ($changedFiles -match '(^|/)(package\.json|package-lock\.json)$') {
  Write-Host "Dependencies changed; running npm ci..."
  & $npmPath ci
}

Write-Host "Update complete."

