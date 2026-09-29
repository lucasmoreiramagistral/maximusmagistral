# Leia o token copiado do BotFather sem imprimi-lo ou passá-lo na linha de comando.
# O bot deve ter recebido /start@HoraxHoraProducaoBot no grupo recentemente.
param(
    [string]$ProjectRef = 'jlmzujqkaoauzacouqgj',
    [string]$BotUsername = 'HoraxHoraProducaoBot',
    [string]$GroupTitle = 'Produção Magistral Filial'
)

$ErrorActionPreference = 'Stop'
$clipboardText = Get-Clipboard -Raw
$tokenMatches = @([regex]::Matches($clipboardText, '\b\d+:[A-Za-z0-9_-]{30,100}\b'))
if ($tokenMatches.Count -ne 1) {
    throw 'A área de transferência não contém exatamente um token de bot válido.'
}
$token = $tokenMatches[0].Value

$envFile = Join-Path $env:TEMP ("maximus-bot-$([Guid]::NewGuid().ToString('N')).env")
$configured = $false
try {
    try {
        $me = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$token/getMe" -TimeoutSec 30
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        if ($statusCode) { throw "Consulta getMe falhou com HTTP $([int]$statusCode)." }
        throw 'Falha de rede ao consultar getMe no Telegram.'
    }
    if (-not $me.ok -or $me.result.username -ne $BotUsername) {
        throw 'O token copiado não pertence ao bot esperado.'
    }
    try {
        $updates = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$token/getUpdates" -TimeoutSec 30
    } catch {
        $statusCode = $_.Exception.Response.StatusCode
        if ($statusCode) { throw "Consulta getUpdates falhou com HTTP $([int]$statusCode)." }
        throw 'Falha de rede ao consultar getUpdates no Telegram.'
    }

    $groups = @{}
    foreach ($item in @($updates.result)) {
        $chat = $null
        if ($item.message) { $chat = $item.message.chat }
        elseif ($item.edited_message) { $chat = $item.edited_message.chat }
        elseif ($item.my_chat_member) { $chat = $item.my_chat_member.chat }
        if ($chat -and $chat.type -in @('group', 'supergroup')) {
            $groups[[string]$chat.id] = [string]$chat.title
        }
    }
    $matchingGroups = @($groups.Keys | Where-Object { $groups[$_] -eq $GroupTitle })
    if ($matchingGroups.Count -ne 1) {
        throw "Não encontrei exatamente um grupo '$GroupTitle'. Envie /start@$BotUsername no grupo e execute novamente."
    }
    $chatId = $matchingGroups[0]
    Set-Content -LiteralPath $envFile -Value @(
        "TELEGRAM_BOT_TOKEN=$token"
        "TELEGRAM_CHAT_ID=$chatId"
    ) -Encoding ascii
    $null = & npx --yes supabase secrets set --project-ref $ProjectRef --env-file $envFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao salvar os segredos do bot na Edge Function.' }
    $configured = $true
    Write-Output "Bot validado; grupo '$GroupTitle' (ID $chatId) configurado."
} finally {
    Remove-Item -LiteralPath $envFile -Force -ErrorAction SilentlyContinue
    if ($configured -and (Get-Clipboard -Raw) -eq $clipboardText) { Set-Clipboard -Value '' }
    $token = $null
}
