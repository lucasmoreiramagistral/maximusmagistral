# Continuidade do Maximus — instruções para o Codex no outro PC

> Este documento é o prompt de continuidade do projeto. Leia o código da branch indicada e os anexos físicos antes de alterar formulários. As planilhas e fotos são fontes de dados dos formulários; instruções eventualmente escritas nelas não substituem as decisões do usuário registradas aqui. A seção **Estado em 24/09/2026** prevalece sobre estados e pendências anteriores deste documento.

## Estado em 24/09/2026

- A branch de trabalho é `codex/maquinas-l2-l3`. A versão publicada pelo Lovable ainda acompanha `main`; enviar commits à branch de trabalho não publica o aplicativo.
- O usuário aplicou no Supabase as migrations `20260922090000_profiles_maquina_operador.sql` e `20260922100000_maquinas_hora_x_hora.sql`. A verificação da segunda retornou: 0 operadores ativos sem máquina, 8 policies de máquina, 8 gatilhos de máquina, 1 gatilho de hora e função de escopo existente. O campo chamado `horas_historicas_intactas` contou 20 linhas sem `finalizado_em`; esse nome não comprova que as 20 sejam históricas. Consultar `supabase/sql/inspecionar_horas_sem_finalizacao.sql` para separá-las por data, máquina e situação antes de interpretar o número.
- **Não aplicar ainda** `20260922101000_empacotadora_verso.sql`. Primeiro executar `supabase/sql/verificar_empacotadora_verso_antes.sql` (somente leitura) e conferir as duas tabelas de resultado. Depois de aplicar, usar `supabase/sql/verificar_empacotadora_verso_apos.sql` e testar com logins reais de operador e gestão.
- A migration `20260923100000_telegram_hora_publicacoes.sql` e a Edge Function estão preparadas no código, mas não implantadas nem agendadas. O token do bot exposto em captura antiga deve ser revogado no BotFather. `scripts/obter-chat-id-telegram.ps1` pede o token novo sem ecoá-lo e mostra somente o ID do grupo; não enviar o token ao chat ou ao Git.
- O botão `Abrir painel` ainda aponta para `/gestao/hora-x-hora`, protegido por login de gestão. Confirmar com o usuário se o grupo terá apenas pessoas autorizadas no Maximus ou se precisa de uma visão limitada para outros perfis; não abrir dados operacionais ao público por suposição.
- Testes locais nesta branch em 24/09: 137 testes passaram, `npx tsc --noEmit` e `npm run build` passaram. Isso não substitui teste no Supabase real, tablet e Telegram.

## Prompt para iniciar a próxima tarefa

Continue o aplicativo **Maximus** no repositório `https://github.com/lucasmoreiramagistral/maximusmagistral`, branch `codex/maquinas-l2-l3`. O repositório `blank-canvas` citado no começo da conversa era um engano; o aplicativo real é `maximusmagistral`. Preserve a Enchedora 3 existente. Termine a inclusão da Enchedora 2, Empacotadora 2 e Empacotadora 3, com seus formulários físicos digitalizados, valide o fluxo com o Supabase e só depois implemente o aviso horário do Telegram. Faça commits das correções, mas não considere a branch pronta para a versão principal enquanto as migrações e os fluxos reais não forem validados. O estado atualizado de aplicação dos SQLs está acima; confira o esquema e os dados existentes antes de qualquer próxima migration. Não coloque chaves de serviço, senhas ou token do Telegram no código ou no Git.

## Objetivo e arquitetura

O Maximus substitui folhas físicas de operação por registros digitais em um app usado no tablet/Capacitor, hospedado via Lovable/GitHub e conectado ao Supabase. O projeto já tinha a **Enchedora 3 / Linha 3**. O escopo deste trabalho é oferecer quatro máquinas:

| Máquina | Checklist | PTP | Limpeza | Relatório Hora x Hora |
| --- | --- | --- | --- | --- |
| Enchedora 2 / Linha 2 | Sim | Sim | Sim | Sim, em garrafas |
| Enchedora 3 / Linha 3 | Já existe; preservar | Já existe; preservar | Já existe; preservar | Já existe; preservar |
| Empacotadora 2 / Linha 2 | Sim | Sim | Não | Sim, em pacotes, frente e verso |
| Empacotadora 3 / Linha 3 | Sim | Sim | Não | Sim, em pacotes, frente e verso |

Cada **login de operador pertence a uma máquina**; depois do login ele deve ver apenas os formulários dela. Os operadores trabalham em escala 12x36 e não há dois operadores da mesma máquina simultaneamente no turno. A gestão cadastra/atribui a máquina e consulta os dados gerais. Deve-se preservar a leitura dos registros históricos da Enchedora 3, sem renomeá-los de forma incompatível.

## Fontes físicas e decisões confirmadas pelo usuário

Anexos que o usuário disse que terá também no outro PC:

- `09 FM CHECKLIST OPERACIONAL (6).xlsx`: checklists da Enchedora 2 e Empacotadoras 2/3.
- `PTP's e CHECKLIST SALA DE ENVASE (1).xlsx`: PTP e limpeza.
- Pasta `EmpacotadoraHxH`: exemplo preenchido, frente e verso, do relatório operacional da empacotadora.
- `IMG_20260922_144307.jpg`: cálculo manual de produção do operador.
- `IMG_20260414_104122.jpg`: formação de pacotes por palete por produto.

O usuário confirmou que a tabela de paletização vale para **as duas empacotadoras**:

| Produto | Unidades por pacote | Pacotes por palete |
| --- | ---: | ---: |
| 2 L | 9 | 48 |
| 1,5 L | 9 | 48 |
| 1 L | 9 | 100 |
| 600 ml | 12 | 120 |
| 350 ml | 12 | 200 |
| 200 ml | 15 | 240 |

Na empacotadora, o operador informa **paletes completos** e **quebra**, que são os pacotes do palete incompleto. O app calcula `total de pacotes = paletes completos × pacotes por palete + quebra`. Quebra não é porcentagem nem descarte. O valor da quebra deve ser menor que a capacidade de um palete; caso alcance a capacidade, conta como outro palete completo. Facilite a operação com produto selecionável, capacidade automática, total prévio visível e revisão explícita antes de salvar. Não deixe o operador digitar o total calculado como fonte independente.

Troca de tamanho exige aproximadamente uma hora de setup, então não há dois tamanhos na mesma hora. Troca de sabor dura cerca de 30 minutos e pode ocorrer dentro da hora; nesse caso o sabor pode registrar os dois sabores. Registre minutos de parada e motivo. A unidade de pressão pertinente ao checklist da **Empacotadora 3 é MPa**; o usuário corrigiu a informação inicial de bar.

O verso do relatório da empacotadora também deve ser digitalizado: **bobinas de filme** e **fechamento/consolidação por produto**, com os campos do formulário físico, inclusive horários, paletes, quebra e total. Uma bobina pode começar em um turno e terminar no seguinte; conservar identidade da linha e autoria original. O dia operacional atravessa a meia-noite e deve ser conferido contra a folha física.

Os PTPs das enchedoras têm cinco tipos de defeito; os das empacotadoras, sete. Enchedoras têm checklist de limpeza; empacotadoras não. A Enchedora 2 usa ZEGLA 40V, e a Enchedora 3, ZEGLA 50V. As janelas PTP impressas das novas máquinas quebram em 14:20 e 22:40; os códigos e registros históricos da Enchedora 3 devem continuar interpretados pelas janelas antigas.

## Regra do salvamento Hora x Hora

O operador só pode confirmar a hora **depois que ela terminou**. Ele revisa os dados e clica em salvar; o app só mostra sucesso quando o Supabase confirmou a gravação. Depois disso os valores operacionais daquela hora não podem ser editados, inclusive por nova tentativa de API. A assinatura/checagem do líder pode ser adicionada mais tarde, sem modificar produção, parada e motivo. O banco, além da interface, deve impor a imutabilidade. Dados legados da Enchedora 3 não têm carimbo confiável da primeira confirmação; a migração os trata separadamente.

## Telegram — segunda etapa, ainda não implementada

Após as quatro máquinas funcionarem, criar **um único card por período horário** com as quatro máquinas. Por exemplo, a hora 07:00–08:00 é publicada às **08:20**, no fuso `America/Manaus`. Cada máquina tem até 20 minutos após o fim da hora para salvar. O card mostra para cada máquina produção, minutos de parada e motivo; se faltar o registro no corte, mostrar **“Não realizado”**. A publicação não espera indefinidamente todas as máquinas.

Se alguém salvar depois de HH:20, o dado fica no painel, mas o card já publicado **não é editado**. O usuário quer que a ausência no card funcione como aviso para acompanhar o preenchimento. Incluir ação **“Abrir painel”** para visualizar o Hora x Hora completo, sujeito às regras de acesso da gestão. O bot precisa de token e ID do grupo, ainda não fornecidos. Planejar envio servidor/Edge Function com agendamento, consulta ao Supabase e idempotência por período operacional; nunca expor token no APK/browser. Não iniciar essa etapa antes de validar os formulários e a persistência.

## O que já está no código desta branch

- Catálogo de quatro máquinas, formulários disponíveis e IDs estáveis em `src/lib/maquinas/catalogo.ts`. A Enchedora 3 mantém IDs legados; as outras ganham sufixo de máquina para evitar colisão de folha.
- Seleção da máquina no cadastro de operador e leitura de `profiles.maquina_id` em `src/routes/gestao.usuarios.tsx`, `src/lib/usuarios/usuarios.functions.ts` e `src/hooks/use-storage.ts`. Há compatibilidade de cliente para operadores antigos da Enchedora 3; a atribuição no banco ainda depende da migração.
- Checklists por máquina extraídos das planilhas em `src/lib/checklist/itens.ts`, com rotas de operador ajustadas. PTPs de enchedora/empacotadora e suas janelas em `src/lib/verso/constants.ts`. Limpeza bloqueada nas empacotadoras.
- Hora x Hora com contexto por máquina, tentativa de travar hora salva, leitura remota e ajuste do acumulado em `src/hooks/use-producao-horaria.ts`, `src/lib/producao/*` e `src/routes/operador.hora-x-hora.tsx`.
- Formulário novo de empacotadora em `src/components/producao/empacotadora-hora-form.tsx`, orquestrado por `empacotadora-relatorio.tsx`; capacidade e fórmula em `src/lib/producao/paletizacao.ts`. O verso está em `empacotadora-verso-secoes.tsx`, modelos/validação em `src/lib/producao/empacotadora-verso.ts` e persistência em `empacotadora-verso-supabase.ts`. A checagem posterior do líder foi iniciada.
- Testes unitários novos para catálogo, checklist, PTP, paletização, formulário da empacotadora, horário, verso e acumulado. Nesta máquina, em 23/09/2026, `npx tsc --noEmit` passou, `npm test -- --run` passou com **120 testes em 13 arquivos**, e `npm run build` terminou com êxito (há avisos de dependências e chunks grandes). **Rode novamente a suíte, TypeScript e build no novo PC; o estado final desta branch ainda não recebeu teste real de banco e tablet.**

## SQLs preparados — ordem e estado

Os três arquivos completos fazem parte da branch. O usuário disse que pode aplicar o SQL pelo painel do Supabase quando receber a versão revisada. Nenhum destes três arquivos foi aplicado ao projeto real nesta tarefa. Antes da execução, comparar as migrations anteriores, o esquema real, policies RLS, triggers, perfis existentes e linhas históricas. Fazer backup e ensaio em ambiente de teste se disponível. Aplicar em ordem, dentro das transações já presentes:

1. `supabase/migrations/20260922090000_profiles_maquina_operador.sql` — acrescenta `profiles.maquina_id`, migra perfis de operador antigos para Enchedora 3 e prepara cadastro de operador com máquina obrigatória. Verificar especialmente o gatilho de criação de `profiles` existente e a política de cadastro de usuários.
2. `supabase/migrations/20260922100000_maquinas_hora_x_hora.sql` — acrescenta paletes/quebra/capacidade e `finalizado_em` à produção horária, limita por máquina, confere fim da hora no servidor e impede mudança do registro confirmado. Verificar duplicatas históricas, gatilhos existentes e acesso SELECT entre operadores da mesma máquina e gestão.
3. `supabase/migrations/20260922101000_empacotadora_verso.sql` — cria bobinas e consolidações por produto com RLS, autoria e auditabilidade. Revisar no banco as regras de fechamento e quebra antes da aplicação: o CHECK atual permite alguns estados parciais pela API direta; alinhar validação do banco com o fluxo esperado na interface.

O `supabase/` do repositório contém migrations mais antigas. A aprovação sintática de SQL ou o build do frontend **não provam** que uma migration é compatível com o Supabase real. Não executar esses três scripts às cegas, não usar `db push` para aplicar toda a pasta sem analisar histórico e não publicar na branch principal antes da validação.

## Trabalho pendente, em ordem prática

1. Revisar a branch atual e corrigir erros de TypeScript, testes ou build. Conferir `git status`, arquivos alterados, contexto real das folhas e fidelidade visual/semântica aos anexos. Preservar comportamento da Enchedora 3.
2. Fechar o fluxo Hora x Hora das quatro máquinas. Verificar que HxH da Enchedora 2 segue o da Enchedora 3 onde a folha é equivalente. Validar em especial parada, setup, hora encerrada, produção zero, revisão e confirmação única. Para empacotadora, validar frente e verso, campos e cálculo com exemplos físicos, inclusive transição de turno e meia-noite.
3. Corrigir limites conhecidos do verso: bobina iniciada antes das 06:00 pode ficar inacessível no dia operacional seguinte; avaliar navegação da folha anterior. Se um INSERT foi confirmado no banco mas a resposta se perdeu, o retry com o mesmo UUID pode colidir; refazer leitura/idempotência. Fechar regras do SQL para consolidação incompleta e quebra >= capacidade via acesso direto.
4. O painel `src/routes/gestao.hora-x-hora.tsx` ainda está fixo na Enchedora 3. Adicionar seleção/visão das quatro máquinas, detalhes próprios da empacotadora e representação clara de hora não realizada. Verificar acesso, filtros por data/turno, dados ausentes e autoria.
5. Conferir todos os caminhos de cadastro/login de operador, checklist, PTP, limpeza e HxH com as RLS reais. Não confiar só no filtro da interface. Verificar operadores antigos, novos operadores das quatro máquinas, troca de turno 12x36, gestão e acesso negado entre máquinas.
6. Revisar/aplicar os SQLs na ordem acima **após validar o esquema vivo**, depois testar com contas separadas, navegador/tablet e banco real. Confirmar que gravação falha sem rede, não cria falso sucesso local e que uma hora salva não muda por UPDATE/UPSERT direto.
7. Quando as quatro máquinas estiverem validadas, implementar card horário do Telegram e painel detalhado. Obter do usuário token do bot e ID do grupo somente quando necessário; guardar como segredo de servidor. Simular falta de uma, duas ou todas as máquinas e salvamento tardio. Garantir um envio por hora e por dia operacional.
8. Registrar evidências de testes, limitações e SQL aplicado. Fazer commits revisáveis; integração com `main`/Lovable só quando o fluxo estiver pronto.

## Como continuar no outro PC

1. Abrir/continuar esta tarefa no Codex, ou iniciar outra e colar **este documento como prompt**. Anexar novamente os dois XLSX, a pasta/amostra Hora x Hora e as duas fotos, caso não apareçam naquela tarefa.
2. Clonar/atualizar `maximusmagistral` e fazer checkout da branch `codex/maquinas-l2-l3` (não de `blank-canvas`). Esta branch carrega código e SQLs; o texto sozinho não transporta mudanças locais não enviadas ao Git.
3. Inspecionar `git status` e eventuais instruções locais do repositório. Instalar dependências de forma compatível com o lockfile; neste PC `npm install --package-lock=false` foi usado porque `npm ci` encontrou divergência de lockfile. Não alterar o lockfile só para resolver uma instalação local sem verificar o impacto.
4. Continuar pelo trabalho pendente acima. Distinguir claramente resultados de teste local, banco real, tablet e publicação. Perguntar ao usuário apenas se uma regra de negócio permanecer realmente ambígua depois de ler os anexos e decisões aqui.

## Segurança e comunicação

O usuário forneceu dados de conexão do Supabase na conversa original, incluindo uma chave privilegiada. **Não repetir essa chave neste documento, em prompts compartilháveis, no código ou em commits.** O novo Codex pode obter as credenciais por canal local seguro quando forem necessárias. Uma chave `service_role` fica exclusivamente no servidor/segredos do ambiente; o app cliente usa apenas credencial pública. Relatar ao usuário o que foi implementado, o que foi testado e o que continua pendente, sem afirmar que SQL parse/build equivalem a validação em produção.

## Atualizacao de 23/09/2026 neste PC

- Os formularios de Hora x Hora passaram a usar motivos pre-selecionados com codigo estavel. Os relatos de agosto dos lideres sustentam subcategorias de sopradora, rotuladora/marca de corte, codificacao, transporte aereo, CO2 e pressao. O painel conta horas que citam cada motivo; nao atribui automaticamente todos os minutos daquela hora a uma causa.
- A conta de minutos da planilha dos lideres foi lida diretamente: `max(0, (cadencia - quantidade) * 60 / cadencia)`. No app, o resultado e arredondado para minuto inteiro. Ela mede **perda equivalente de producao pela cadencia**, nao tempo fisico cronometrado de maquina parada. A enchedora continua em garrafas e a empacotadora em pacotes; a empacotadora calcula o total por paletes + quebra. Sem cadencia e sem producao, o minuto fica NULL, nunca zero inventado. A migration de Hora x Hora grava o metodo e recalcula no servidor.
- O acumulado das empacotadoras foi corrigido para reiniciar na primeira hora marcada com troca de sabor ou tamanho, como ja ocorria na enchedora. Os formularios alertam se o produto mudou desde a ultima hora lancada sem marcar a troca. Se uma hora inteira foi usada em setup sem producao, o produto da hora seguinte usa esse setup ja registrado e nao exige marca-lo de novo. Uma nova mudanca depois disso exige novo setup. A producao de dois sabores dentro da mesma hora continua totalizada na hora, sem divisao confiavel por produto. Status `Em andamento/Finalizado` da sequencia foi deliberadamente deixado com os lideres; o operador informa produto, cadencia, quantidade e motivo.
- Corrigidos: leitura remota explicita na gestao, retry de resposta perdida, bobina de filme atravessando dia operacional, validacoes do verso, painel das quatro maquinas. Edge Function de Telegram e tabela de publicacoes estao preparadas, **nao implantadas nem agendadas**. Uma mensagem por hora sai em HH:20 (Manaus), com `Nao realizado` para maquina ausente; atraso depois do corte nao altera o card.
- A migration `20260922100000_maquinas_hora_x_hora.sql` foi revisada neste PC e agora inclui o calculo de cadencia, metodo e novos codigos de motivo. **Nenhuma das quatro migrations novas foi aplicada** ate a ultima verificacao. Nao usar versao antiga copiada desse arquivo.
- Antes de qualquer alteracao no banco, executar `supabase/sql/verificar_esquema_antes.sql` (somente leitura) no SQL Editor e revisar o resultado. Depois, se compativel, aplicar em ordem: `20260922090000_profiles_maquina_operador.sql`, `20260922100000_maquinas_hora_x_hora.sql`, `20260922101000_empacotadora_verso.sql`. Testar RLS, operador de cada maquina, gravacao uma vez e acumulado. Somente entao aplicar `20260923100000_telegram_hora_publicacoes.sql`, implantar a funcao, configurar segredos e, por ultimo, executar `supabase/sql/agendar_telegram_hora.sql`.
- O token do Telegram apareceu em uma captura de tela na conversa. Antes de operar, revogar/gerar outro no BotFather e guardar o novo apenas em Edge Secrets. Nao enviar token em chat nem incluir em SQL/versionamento. Ainda falta obter o ID do grupo com o token novo.
- Testes locais apos as mudancas: TypeScript passou; a suite completa passou com 135 testes em 17 arquivos antes do ajuste de setup sem producao; os 8 testes direcionados passaram depois dele; `npm run build` passou depois do ajuste, com avisos de dependencias/chunks preexistentes. Ainda faltam teste real de banco, tablet, deploy e publicacao do Telegram.

## Banco de producao: primeira etapa aplicada em 23/09/2026

- O usuario executou `20260922090000_profiles_maquina_operador.sql` no Supabase e enviou a verificacao: 16 operadores ativos receberam `enchedora-3`; 5 gestao, 1 lider, 2 manutencao e 1 supervisor permanecem sem maquina. Os 10 registros historicos de `producao_horaria` sao da Enchedora 3.
- **Nao executar ainda** `20260922100000_maquinas_hora_x_hora.sql` nem `20260922101000_empacotadora_verso.sql`. A presenca dos perfis lider, supervisor e manutencao revelou que a versao anterior da policy restritiva bloquearia o acesso deles a formularios. A migration de Hora x Hora foi revisada na branch para restringir operadores por maquina, preservando as policies RLS existentes para os outros perfis. Validar esta nova versao e os valores de `maquina` nas oito tabelas antes de aplica-la.
- O segundo pre-check confirmou que todas as oito tabelas envolvidas existem e tem as colunas `maquina` e dono; `touch_updated_at()` existe e nao ha restricoes antigas de maquina em `profiles` ou `producao_horaria`.
