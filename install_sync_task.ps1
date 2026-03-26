$ErrorActionPreference = "Stop"

$taskName = "GenomeEngineeringProjectSync2026"
$scriptPath = "C:\Users\ntelugu\Desktop\Genome_Enginnering_Automation\sync_project_folders.ps1"
$startTime = (Get-Date).AddMinutes(1)

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Once -At $startTime `
    -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Copies new or updated project folders into the 2026_GE project archive."

Start-ScheduledTask -TaskName $taskName
