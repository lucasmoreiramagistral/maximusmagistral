# Obtem o ID do grupo sem salvar nem imprimir o token do bot.
# Use apenas depois de trocar o token exposto anteriormente no BotFather.
param(
    [string]$BotUsername = 'HoraxHoraProducaoBot'
)

Write-Host "Envie /start@$BotUsername no grupo do Telegram antes de continuar."
$segredo = Read-Host 'Cole o token NOVO do bot (entrada oculta)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredo)
$token = $null
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw 'Token vazio.'
    }
    try {
        $bot = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$token/getMe" -TimeoutSec 15 -ErrorAction Stop
        $resposta = Invoke-RestMethod -Method Get -Uri "https://api.telegram.org/bot$token/getUpdates" -TimeoutSec 15 -ErrorAction Stop
    } catch {
        throw 'O Telegram nao aceitou o token ou a rede falhou. Confira o token novo sem envia-lo no chat.'
    }
    if (-not $bot.ok -or $bot.result.username -ne $BotUsername) {
        throw 'Este token nao pertence ao bot esperado.'
    }
    $grupos = @{}
    foreach ($item in @($resposta.result)) {
        $chat = $null
        if ($item.message) { $chat = $item.message.chat }
        elseif ($item.edited_message) { $chat = $item.edited_message.chat }
        elseif ($item.my_chat_member) { $chat = $item.my_chat_member.chat }
        if ($chat -and $chat.type -in @('group', 'supergroup')) {
            $grupos[[string]$chat.id] = [string]$chat.title
        }
    }
    if ($grupos.Count -eq 0) {
        Write-Host "Nenhum grupo apareceu. Envie /start@$BotUsername no grupo e rode este script novamente."
    } else {
        foreach ($id in $grupos.Keys) {
            Write-Host "Grupo: $($grupos[$id]) | CHAT_ID: $id"
        }
    }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $token = $null
}
