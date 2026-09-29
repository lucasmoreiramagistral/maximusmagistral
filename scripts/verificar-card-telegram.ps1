# Confere a ultima publicacao e o painel publico sem imprimir o token do link.
param([string]$ProjectRef = 'jlmzujqkaoauzacouqgj')

$ErrorActionPreference = 'Stop'
$queryFile = Join-Path $env:TEMP ("maximus-card-read-$([Guid]::NewGuid().ToString('N')).sql")
try {
    Set-Content -LiteralPath $queryFile -Value @'
select data_operacao, hora_codigo, status, message_id, public_token
  from public.telegram_hora_publicacoes
 order by corte_em desc
 limit 1;
'@ -Encoding utf8
    $raw = (& npx --yes supabase db query --linked --project-ref $ProjectRef --file $queryFile 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao consultar a ultima publicacao.' }
    $jsonStart = $raw.IndexOf('{')
    if ($jsonStart -lt 0) { throw 'Resposta inesperada do banco.' }
    $result = $raw.Substring($jsonStart) | ConvertFrom-Json
    if (@($result.rows).Count -ne 1) { throw 'Nenhum card registrado ainda.' }
    $card = $result.rows[0]
    Write-Output "Card $($card.data_operacao) $($card.hora_codigo): $($card.status); mensagem Telegram $($card.message_id)"
    if ($card.status -ne 'enviado') { exit 1 }

    $body = @{ token = [string]$card.public_token } | ConvertTo-Json -Compress
    $invokeArgs = @{
        Method = 'Post'
        Uri = "https://${ProjectRef}.supabase.co/functions/v1/hora-x-hora-publico"
        ContentType = 'application/json'
        Body = $body
        TimeoutSec = 30
    }
    $painel = Invoke-RestMethod @invokeArgs
    if ($painel.PSObject.Properties.Name -notcontains 'versoEmpacotadoras' -or
        $painel.PSObject.Properties.Name -notcontains 'registros') {
        throw 'Painel publico sem os dados esperados de frente e verso.'
    }
    Write-Output "Painel publico OK: $(@($painel.registros).Count) registros de hora; verso das empacotadoras presente."
} finally {
    Remove-Item -LiteralPath $queryFile -Force -ErrorAction SilentlyContinue
}
