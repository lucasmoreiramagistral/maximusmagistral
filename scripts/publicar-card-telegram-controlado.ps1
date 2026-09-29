# Dispara um corte pendente uma unica vez, sem ligar o cron e sem exibir o segredo.
param(
    [string]$ProjectRef = 'jlmzujqkaoauzacouqgj'
)

$ErrorActionPreference = 'Stop'
$queryFile = Join-Path $env:TEMP ("maximus-cron-read-$([Guid]::NewGuid().ToString('N')).sql")
$cronSecret = $null
try {
    Set-Content -LiteralPath $queryFile -Value @'
select decrypted_secret
  from vault.decrypted_secrets
 where name = 'maximus_cron_secret';
'@ -Encoding utf8
    $raw = (& npx --yes supabase db query --linked --project-ref $ProjectRef --file $queryFile 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel consultar o segredo do agendamento.' }
    $jsonStart = $raw.IndexOf('{')
    if ($jsonStart -lt 0) { throw 'Resposta inesperada ao consultar o Vault.' }
    $result = $raw.Substring($jsonStart) | ConvertFrom-Json
    if (@($result.rows).Count -ne 1) { throw 'Segredo do agendamento ausente ou duplicado no Vault.' }
    $cronSecret = [string]$result.rows[0].decrypted_secret
    if ([string]::IsNullOrWhiteSpace($cronSecret)) { throw 'Segredo do agendamento vazio.' }

    try {
        $invokeArgs = @{
            Method = 'Post'
            Uri = "https://${ProjectRef}.supabase.co/functions/v1/hora-x-hora-telegram"
            Headers = @{ 'X-Maximus-Cron-Secret' = $cronSecret }
            ContentType = 'application/json'
            Body = '{}'
            TimeoutSec = 45
        }
        $response = Invoke-RestMethod @invokeArgs
        Write-Output "Resposta da funcao: $($response.mensagem)"
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        if ($statusCode) { throw "Funcao Telegram respondeu HTTP $([int]$statusCode). Consulte a tabela de publicacoes." }
        throw 'Falha de rede ao invocar a funcao Telegram. Confira a tabela antes de tentar novamente.'
    }
} finally {
    Remove-Item -LiteralPath $queryFile -Force -ErrorAction SilentlyContinue
    $cronSecret = $null
}
