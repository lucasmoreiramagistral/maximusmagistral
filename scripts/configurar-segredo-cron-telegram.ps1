# Configura o mesmo segredo aleatorio na Edge Function e no Vault, sem exibi-lo.
# O agendamento nao e ativado por este script.
param(
    [string]$ProjectRef = 'jlmzujqkaoauzacouqgj',
    [string]$ProjectUrl = 'https://jlmzujqkaoauzacouqgj.supabase.co',
    [string]$EnvPath = (Join-Path $PSScriptRoot '..\.env')
)

$ErrorActionPreference = 'Stop'
$publishableLine = Get-Content -LiteralPath $EnvPath |
    Where-Object { $_ -match '^SUPABASE_PUBLISHABLE_KEY=' } |
    Select-Object -First 1
if (-not $publishableLine) { throw 'SUPABASE_PUBLISHABLE_KEY ausente no .env.' }
$publishableKey = $publishableLine.Substring('SUPABASE_PUBLISHABLE_KEY='.Length).Trim().Trim('"').Trim("'")
if ($publishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
    throw 'A chave publica do .env nao tem o formato esperado.'
}

function SqlLiteral([string]$value) {
    return "'" + $value.Replace("'", "''") + "'"
}

$bytes = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
$cronSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$tag = [Guid]::NewGuid().ToString('N')
$envFile = Join-Path $env:TEMP "maximus-cron-$tag.env"
$sqlFile = Join-Path $env:TEMP "maximus-vault-$tag.sql"

try {
    Set-Content -LiteralPath $envFile -Value "MAXIMUS_CRON_SECRET=$cronSecret" -NoNewline -Encoding ascii
    $null = & npx --yes supabase secrets set --project-ref $ProjectRef --env-file $envFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao salvar o segredo da Edge Function.' }

    $sql = @'
do $vault$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'maximus_project_url';
  if v_id is null then
    perform vault.create_secret({0}, 'maximus_project_url');
  else
    perform vault.update_secret(v_id, {0});
  end if;

  select id into v_id from vault.secrets where name = 'maximus_publishable_key';
  if v_id is null then
    perform vault.create_secret({1}, 'maximus_publishable_key');
  else
    perform vault.update_secret(v_id, {1});
  end if;

  select id into v_id from vault.secrets where name = 'maximus_cron_secret';
  if v_id is null then
    perform vault.create_secret({2}, 'maximus_cron_secret');
  else
    perform vault.update_secret(v_id, {2});
  end if;
end;
$vault$;
'@
    $sql = [string]::Format($sql, (SqlLiteral $ProjectUrl), (SqlLiteral $publishableKey), (SqlLiteral $cronSecret))
    Set-Content -LiteralPath $sqlFile -Value $sql -Encoding utf8
    $null = & npx --yes supabase db query --linked --project-ref $ProjectRef --file $sqlFile 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao salvar os segredos no Vault.' }
    Write-Output 'Segredo de agendamento sincronizado entre Edge Function e Vault.'
} finally {
    Remove-Item -LiteralPath $envFile, $sqlFile -Force -ErrorAction SilentlyContinue
    $cronSecret = $null
}
