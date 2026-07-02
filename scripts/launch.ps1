# COGNITIVE LAB — Launcher desktop
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Port = 5173
$Url = "http://localhost:$Port"

function Test-ServerReady {
    try {
        $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return $true
    } catch {
        return $false
    }
}

# Já rodando? Só abre o navegador.
if (Test-ServerReady) {
    Start-Process $Url
    exit 0
}

Set-Location $ProjectRoot

if (-not (Test-Path "node_modules")) {
    npm install
}

if (-not (Test-Path "dist\index.html")) {
    npm run build
}

# Inicia servidor em janela minimizada (feche a janela para encerrar o app)
Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList @(
    "/k", "title COGNITIVE LAB && npm run preview -- --port $Port --host localhost"
) -WorkingDirectory $ProjectRoot

# Aguarda servidor e abre navegador
$ready = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ServerReady) {
        $ready = $true
        break
    }
}

if ($ready) {
    Start-Process $Url
} else {
    [System.Windows.Forms.MessageBox]::Show(
        "Não foi possível iniciar o COGNITIVE LAB em $Url.`nVerifique se a porta $Port está livre.",
        "COGNITIVE LAB",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    ) | Out-Null
}