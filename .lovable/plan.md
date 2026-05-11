## Versão final — fechada para implementação

Reli o plano contra todos os fluxos: SSR, offline, conflito de versão, mappers, eventos de storage, hidratação, troca de turno meio do dia, virada de data operacional, tablet compartilhado. Abaixo está o que muda, o que **não** muda, as 3 sutilezas extras que descobri nesta passada e a checklist de verificação.

### O que está sólido e fica intocado

- ID determinístico (`ptp-${data}-${codigo}` e `limp-${data}-${turno}`): uma row por janela/turno do dia para todos os operadores. Sem duplicação.
- `folhaDiaKey` fixa (Linha 3 / Enchedora 3): folha do dia única.
- `ConflitoVersaoError` via `expectedUpdatedAt`: bloqueia sobrescrita silenciosa quando outro login alterou a mesma janela.
- `janelasPtpDaEscala` cobre os 6 regimes corretamente (janela parcial conta).
- `calcularDataOperacional` com folga de 10 min para turnos atravessando meia-noite.
- Auditoria em `ptp_janelas_edicoes` / `limpeza_turnos_edicoes`.
- Fila offline em `usePtpJanelas`/`useLimpezaTurnos`: o payload já carrega o `id` final, então mudar o turno depois não corrompe a fila.

### Bug raiz (confirmado em 5 telas)

Todas resolvem turno/equipe direto de `usuario.equipePadrao`/`usuario.turnoPadrao`, ignorando extra/cobertura:

| Tela | Sintoma quando o operador está em extra |
|---|---|
| `/operador` (home) | Badges "Concluído" e card "Turno concluído" calculados no turno errado |
| `/operador/verso/ptp` (lista) | Vê janelas do turno errado; sem padrão cai no fallback que mostra **as 12** |
| `/operador/verso/ptp/$janelaCodigo` | Grava na **data errada** (regra de madrugada do turno padrão) |
| `/operador/verso/limpeza` | `useEffect` impede selecionar qualquer turno ≠ padrão → bloqueio total |
| `/operador/validacao-lider` | Líder valida o turno errado e some pendência real |

### Solução — Turno Ativo do Dia (single source of truth)

**1) `src/lib/operacao/turno-ativo.ts` (novo)**
- `localStorage` por usuário: `fm-turno-ativo:${userId}` = `{ turno, equipe, dataOperacional, gravadoEm }`.
- Validação ao ler:
  - Combo precisa formar escala válida (`escalaPorTurnoEquipe` retorna não-nulo).
  - Recalcula `calcularDataOperacional(turno, equipe)`; se ≠ ao gravado, descarta (não arrasta extra de ontem).
- Fallback: padrão do cadastro.
- Evento `fm-turno-ativo-update` (custom event) + `storage` event para cross-tab.
- Hook `useTurnoAtivoDoDia(usuario)` com `useSyncExternalStore` + `getServerSnapshot` retornando o padrão → SSR-safe, sem hydration mismatch.
- Retorna `{ turno, equipe, data, ehExtra }`.

**2) `src/components/turno-ativo-picker.tsx` (novo)**
- Selects encadeados (turno → equipes válidas daquele turno) populados a partir de `ESCALAS`. Sem combos inválidos.
- Botão "Voltar ao padrão" (limpa o ativo).
- **Modal de confirmação** quando o turno corrente já tem janelas PTP ou limpeza preenchidas: "Você tem registros no turno atual. Trocar leva você para outra folha do dia. Confirmar?" — usa os dados que a home já carrega via `usePtpJanelas`/`useLimpezaTurnos`, sem query nova.

**3) Substituições mínimas nas 5 telas**
- `/operador`: usa o hook; renderiza o picker no topo; chip "EXTRA" no card de boas-vindas quando `ehExtra`.
- `/operador/verso/ptp` (lista e detalhe): usa o hook; remove o fallback que mostra 12 janelas — sem turno/equipe resolvido, mostra card "Defina seu turno do dia na tela inicial". Chip "EXTRA" no `AppHeader` quando aplicável.
- `/operador/verso/limpeza`: usa o hook; a proteção interna passa a comparar com o ativo, não com o padrão.
- `/operador/validacao-lider`: usa o hook.

**4) `/operador/contexto` continua igual, com 1 linha a mais**
- Ao clicar em "Continuar", além de gravar `STORAGE_CTX`, grava também o Turno Ativo. Operador que entra direto na frente alinha verso automaticamente.

### 3 sutilezas extras descobertas nesta passada

1. **`/operador/contexto` permite combos inválidos** (`TODAS_AS_EQUIPES × TODOS_OS_TURNOS`), enquanto o picker novo restringe a `ESCALAS`. Para alinhar, troco também os selects do contexto por escalas válidas. Sem isso, o operador pode gravar um checklist com Bruno+1ºTurno via contexto e o picker recusar a mesma combinação na home — divergência sutil. Custo: ~10 linhas.
2. **Virada do dia operacional sem evento**: `useSyncExternalStore` não reavalia sozinho se nada dispara o subscribe. O ativo só "expira" quando o usuário recarrega ou troca de tela. Aceitável (já que reset acontece no próximo carregamento), e o botão "Voltar ao padrão" cobre o caso explícito. Não vou colocar timer/poll para evitar complexidade.
3. **Telas que continuam com padrão (não impactam o bug central)**: `useItTelemetria`, `/operador/it/ata` (apenas defaultValue do select). Mantenho como follow-up — telemetria é informativa e a ata permite editar o turno.

### Plano de verificação

1. Bruno padrão Noite → home → picker "12x36 Dia · Karolainny" → home/PTP/limpeza/validação líder consistentes; chip "EXTRA" visível.
2. Já com janelas preenchidas no turno corrente → picker dispara modal antes de trocar.
3. Reload → escolha persiste. Trocar de login no mesmo tablet → ativo de cada login isolado.
4. Login sem padrão e sem ativo → PTP e limpeza com card de bloqueio (não mostra 12 janelas).
5. Frente da folha com turno diferente do padrão → grava no ativo; verso acompanha.
6. Vira o dia operacional → próximo carregamento descarta o ativo automaticamente.
7. Dois logins na mesma janela → continua coberto por `ConflitoVersaoError`.
8. Offline: gravar janela em extra → fica na fila com `id` correto; sincroniza certo ao voltar online.
9. APK Capacitor → 100% web, sem recompilação.

Plano fechado. Pode aprovar para eu implementar.
