# LOCAL, FREE, PROVISIONAL Hebrew voice lines with the Windows built-in voice (Microsoft Asaf, he-IL, OneCore).
# Use: rough timing and the assembly test only. It is a robotic system voice, not the natural narration for the real clip.
#   powershell -ExecutionPolicy Bypass -File scripts/local-hebrew-tts.ps1 -Script pilot/mouthing-redirect-toy-1-standard/script.json -Out <folder>
# Writes line-1.wav ... line-N.wav (one per voice line, in script order) and prints each duration in ms.
# Needs the Windows Hebrew speech voice (Settings > Time & language > Speech). No network, no account, no charge.
param([Parameter(Mandatory = $true)][string]$Script, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
function Await($op, [Type]$type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'he-IL' } | Select-Object -First 1
if (-not $voice) { throw 'No he-IL voice is installed in Windows.' }
$synth.Voice = $voice
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$lines = (Get-Content -Raw -Encoding UTF8 $Script | ConvertFrom-Json).voice
$i = 0
foreach ($line in $lines) {
  $i++
  $stream = Await ($synth.SynthesizeTextToStreamAsync($line.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $size = [uint32]$stream.Size
  Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  $path = Join-Path $Out ("line-$i.wav")
  [IO.File]::WriteAllBytes($path, $bytes)
  # WAV header: byte rate at offset 28, data size after the "data" chunk id.
  $byteRate = [BitConverter]::ToInt32($bytes, 28)
  $dataAt = 12
  while ([Text.Encoding]::ASCII.GetString($bytes, $dataAt, 4) -ne 'data') { $dataAt += 8 + [BitConverter]::ToInt32($bytes, $dataAt + 4) }
  $ms = [math]::Round([BitConverter]::ToInt32($bytes, $dataAt + 4) / $byteRate * 1000)
  Write-Output ("line-{0}.wav {1} ms ({2}) {3}" -f $i, $ms, $line.speaker, $line.text)
}
Write-Output "voice: $($voice.DisplayName) ($($voice.Language))"
