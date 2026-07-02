# Cria atalho na Area de Trabalho com icone personalizado
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "COGNITIVE LAB.lnk"
$VbsLauncher = Join-Path $ProjectRoot "scripts\launch.vbs"
$IconPath = Join-Path $ProjectRoot "assets\app-icon.ico"
$ConvertScript = Join-Path $ProjectRoot "scripts\convert-icon.py"

# Gera ICO com multiplos tamanhos (Pillow)
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python -and (Test-Path $ConvertScript)) {
    & python $ConvertScript
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Falha na conversao do icone. Usando icone padrao."
        $IconPath = "$env:SystemRoot\System32\imageres.dll,109"
    }
} elseif (-not (Test-Path $IconPath)) {
    Write-Warning "Python/Pillow nao encontrado. Usando icone padrao."
    $IconPath = "$env:SystemRoot\System32\imageres.dll,109"
}

# Remove atalho antigo para forcar atualizacao do cache de icones
if (Test-Path $ShortcutPath) {
    Remove-Item $ShortcutPath -Force
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $VbsLauncher
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "COGNITIVE LAB - Laboratorio cognitivo pessoal"

if ($IconPath -like "*,*") {
    $Shortcut.IconLocation = $IconPath
} else {
    $Shortcut.IconLocation = "$IconPath,0"
}

$Shortcut.Save()

# Atualiza cache de icones do Windows
$null = Start-Process "ie4uinit.exe" -ArgumentList "-show" -WindowStyle Hidden -PassThru -Wait -ErrorAction SilentlyContinue

Write-Host "Atalho criado: $ShortcutPath" -ForegroundColor Green
Write-Host "Icone: $IconPath" -ForegroundColor Cyan