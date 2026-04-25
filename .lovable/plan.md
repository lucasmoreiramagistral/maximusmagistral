Vou corrigir isso atacando a causa real: hoje o export depende só do banco remoto para montar PTP/Limpeza, mas o preenchimento do operador também salva localmente e pode cair na fila/offline. Além disso, a rotina de imagem está frágil para assinatura em ExcelJS.

Plano de correção:

1. Garantir que o export use os dados que o operador acabou de preencher
   - Alterar o carregamento do verso para mesclar banco remoto + armazenamento local do navegador.
   - Para cada PTP e Limpeza, usar o registro mais completo/mais recente, priorizando assinatura e observação quando existirem.
   - Assim, mesmo se o Supabase demorar, falhar ou a fila offline ainda não tiver sincronizado, o Excel baixado já sai com assinatura e observações.

2. Corrigir definitivamente as assinaturas do PTP e Limpeza no Excel
   - Trocar a inserção de imagem para usar `buffer`/bytes reais em vez de base64 solto, que é mais confiável no ExcelJS no navegador.
   - Inserir assinatura e nome em áreas separadas para não sobrescrever a imagem com texto.
   - Ajustar altura/posição das linhas de visto PTP e assinatura da limpeza para a assinatura ficar visível.
   - Validar também assinaturas antigas salvas como data URL ou base64 puro.

3. Corrigir observações vazias na frente do checklist
   - Fazer o bloco `OBSERVAÇÕES` da frente buscar de três fontes, sem uma apagar a outra:
     - observações normais do checklist da frente;
     - observações do PTP;
     - itens NR da limpeza com motivo/observação.
   - Mesmo que a tabela espelho `folha_observacoes_verso` esteja vazia, montar as observações diretamente dos dados brutos de PTP/Limpeza.
   - Não retornar sem preencher quando não houver segmentos; limpar/preencher corretamente o bloco para evitar “vazio” indevido ou conteúdo antigo perdido.

4. Corrigir propagação offline/fila
   - Quando um PTP ou Limpeza for salvo offline e depois sincronizado, também sincronizar as observações do verso para a frente.
   - Hoje a fila envia o registro PTP/Limpeza, mas não refaz o `upsertObservacaoVerso`; isso explica observações sumindo no Excel quando a exportação depende do espelho.

5. Conferir o fluxo de exportação completo
   - Revisar `exportarFrenteVersoCompletoExcel`, `exportarVersoApenasExcel` e `exportarFolhaDiaExcel` para todos usarem a mesma fonte consolidada.
   - Rodar build/teste de geração para confirmar que o arquivo gerado contém imagens embutidas e textos de observação no bloco A31:A36 da frente.

Arquivos principais a alterar:
- `src/lib/checklist/excel-export.ts`
- `src/lib/verso/excel-export.ts`
- `src/hooks/use-connection-status.ts`
- possivelmente `src/lib/verso/observacoes.ts` ou helpers de storage para consolidar dados.

Resultado esperado:
- Excel completo com assinatura do operador no visto do PTP.
- Excel completo com assinatura do operador na Limpeza.
- Observações NR da limpeza aparecendo em `OBSERVAÇÕES` na frente do checklist.
- Observações já existentes da frente não serão removidas.