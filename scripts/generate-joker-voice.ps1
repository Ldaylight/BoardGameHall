# Optional asset regeneration on Windows; running the game uses the committed WAV.
Add-Type -AssemblyName System.Speech
$taskVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $taskVoice.SelectVoice('Microsoft Huihui Desktop')
  $taskVoice.Rate = 2
  $taskOutput = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../client/public/audio/joker-laugh.wav'))
  $taskVoice.SetOutputToWaveFile($taskOutput)
  $taskVoice.Speak([string]::Concat([char]0x54C8, [char]0x54C8, ', ', [char]0x54C8, [char]0x54C8, [char]0x54C8, [char]0x54C8, '!'))
  $taskVoice.SetOutputToNull()
  Get-Item -LiteralPath $taskOutput | Select-Object Length
} finally { $taskVoice.Dispose() }
