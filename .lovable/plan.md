# Hora x Hora — Relatório Operacional Horário da Enchedora (L3)

Nova funcionalidade no `/operador`: registro da produção hora a hora da Enchedora da Linha 3, seguindo o formulário oficial FM08 PSGQ07 (rev. 04) — frente.

## Escopo desta etapa

Somente a **tabela horária** da frente (colunas HORA, META, QUANTIDADE HORÁRIA, QUANTIDADE ACUMULADA, TEMPO DE PARADA e ASSINATURA DO LÍDER).

Ficam mapeados para etapas seguintes, já conferidos no modelo Excel:
- Frente: Checklist de Apoio (8 atividades × marcação 1ºT/2ºT/3ºT), Controle de Assepsia (5 trocas de sabor com início/fim), Controle de CIP (7 etapas, com assinatura do operador executante e liberação do CQ com horário).
- Verso: Registro dos tanques de xarope (18 linhas: sabor, tamanho, nº tanque, lote, qtd inicial/final em L, hora início/término) e Passagem de Turno (3 blocos de ocorrências — 1ºT/12x36 Dia, 2ºT/12x36 Noite, 3ºT).


## Como vai funcionar

Cada dia operacional tem 24 linhas horárias, de 06:00 às 06:00 do dia seguinte — exatamente como no papel. O operador só enxerga e edita as horas do **seu turno** (Dia 06:00–18:00, Noite 18:00–06:00), podendo preencher e corrigir qualquer hora do próprio turno a qualquer momento.

Por linha o operador informa:
- **Meta** — digitada por ele (varia por produto/tamanho); ao digitar uma meta, ela é replicada para as horas seguintes vazias do turno, e ele pode sobrescrever quando o produto muda.
- **Quantidade horária** — número produzido, ou marcar "não rodou" (equivale ao traço "—" do papel).
- **Tempo de parada (min)**.
- **Quantidade acumulada** — calculada automaticamente pelo app, nunca digitada.

### Regra do acumulado

O acumulado soma as quantidades horárias e **zera** em dois casos:
1. Na virada de turno (06:00 e 18:00).
2. Quando o operador marca a hora como "início de novo acumulado" (troca de sabor / CIP) — é isso que explica o 07/07 reiniciando em 1.477 às 10:00.

A marcação de troca de sabor/CIP fica como um botão discreto na linha da hora ("reiniciar acumulado aqui"), e o app recalcula tudo daí pra frente.

### Assinatura do líder

Cada linha tem espaço para assinatura do líder "a cada checagem", igual ao papel — reaproveita o mesmo componente de assinatura digital já usado no checklist e na limpeza, registrando nome e horário.

## Telas

- **Card novo no `/operador`**: "Hora x Hora — Enchedora L3", com badge de progresso (ex.: 8/12 horas do turno lançadas).
- **`/operador/hora-x-hora`**: lista das 12 horas do turno ativo, cada uma como um cartão grande e tocável (padrão dos cards atuais), mostrando hora, meta, quantidade, acumulado e parada. Horas futuras aparecem bloqueadas até chegar o horário.
- **Gestão**: a folha do dia passa a exibir um bloco "Hora x Hora" por turno, com total produzido, atingimento da meta, total de minutos parados e as horas não preenchidas em destaque — mesma lógica de "janelas faltantes" já usada no PTP.

## Detalhes técnicos

- Nova tabela `producao_horaria` no Supabase, uma linha por hora: `folha_dia_key`, `data_operacao`, `linha`, `maquina`, `hora_codigo` (H01..H24), `hora_inicio`, `hora_fim`, `turno`, `meta`, `quantidade`, `nao_rodou`, `tempo_parada_min`, `reinicia_acumulado`, dados do operador, assinatura do líder, `updated_at`. Com GRANTs para `authenticated`/`service_role`, RLS habilitada e índice em `(data_operacao, linha, maquina)`.
- Tabela de auditoria `producao_horaria_edicoes`, espelhando `ptp_janelas_edicoes`.
- `src/lib/producao/constants.ts` com as 24 faixas horárias e o mapeamento hora → turno (reaproveitando `escalas.ts`).
- `src/lib/producao/acumulado.ts` — função pura que recebe as horas do dia e devolve o acumulado de cada uma, aplicando as duas regras de reset. Coberta por testes unitários com os números reais dos PDFs de 07 a 10/07.
- `src/lib/producao/supabase-storage.ts` e `src/hooks/use-producao-horaria.ts` seguindo exatamente o padrão de `use-ptp-janelas` (fila offline, `ConflitoVersaoError`, erros de aplicação propagados para o toast).
- Rota `src/routes/operador.hora-x-hora.tsx` + card em `operador.index.tsx`; resumo na gestão via `resumo.ts` e badges do dia.

## Ordem de execução

1. Migração SQL (tabelas + grants + RLS + índices).
2. Constantes, cálculo do acumulado e testes.
3. Storage + hook com fila offline.
4. Tela do operador e card na home.
5. Bloco na gestão (folha do dia + relatório).

Depois dessa base pronta, sigo com as demais seções da frente (checklist de apoio, assepsia, CIP) e o verso (tanques e passagem de turno), reaproveitando a mesma folha do dia.
