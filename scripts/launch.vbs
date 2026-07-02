' Abre o COGNITIVE LAB sem janela do PowerShell
Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
launchPs1 = scriptDir & "\launch.ps1"
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & launchPs1 & """", 0, False