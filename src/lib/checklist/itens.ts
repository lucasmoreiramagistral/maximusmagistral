import type { ItemChecklistDef } from "./types";

export const ITENS_CHECKLIST: ItemChecklistDef[] = [
  // MOMENTO A — Início / retomada de processo
  {
    numero: 1,
    descricao:
      "Verificar se todas as válvulas de enchimento estão com os respectivos bicos e aba cônica",
    tipo: "simples",
    permiteNA: true,
    momento: "Início / retomada de processo",
  },
  {
    numero: 2,
    descricao: "Verificar e registrar a pressão no tanque para definir a contrapressão",
    tipo: "numerico",
    unidade: "bar",
    permiteNA: true,
    momento: "Início / retomada de processo",
  },
  {
    numero: 3,
    descricao: "Verificar e registrar a pressão no recipiente (contrapressão)",
    tipo: "numerico",
    unidade: "bar",
    referencia: "Recomendável: 2 décimos acima do valor do item 2",
    permiteNA: true,
    momento: "Início / retomada de processo",
  },
  {
    numero: 4,
    descricao: "Checar e informar a pressão de ar dos pistões",
    tipo: "numerico",
    unidade: "bar",
    referencia: "Recomendável: 3,5 a 4,0 bar",
    permiteNA: true,
    momento: "Início / retomada de processo",
  },
  {
    numero: 5,
    descricao: "Checar o funcionamento do detector de metal via teste",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 6,
    descricao: "Checar se todos os botões de emergência estão funcionando",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  // MOMENTO B — Setup / longas paradas / PCM
  {
    numero: 7,
    descricao: "Verificar se os bicos estão no tamanho correto e com aba cônica",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 8,
    descricao:
      "Verificar e registrar qual orifício está sendo utilizado na saída da cuba de xarope",
    tipo: "numerico",
    unidade: "mm",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 9,
    descricao: "Checar posição e funcionamento de todos os sensores",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 10,
    descricao: "Verificar se os arrolhadores estão em boas condições",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 11,
    descricao: "Checar abastecimento de óleo no sistema de lubrificação dos pistões",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 12,
    descricao: "Verificar junto ao líder preventivas operacionais pendentes e realizá-las",
    tipo: "texto",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  // MOMENTO C — Pós-setup
  {
    numero: 13,
    descricao: "Trocar e ajustar todas as estrelas",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 14,
    descricao: "Trocar e ajustar todos os guias de entrada e saída",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 15,
    descricao: "Retirar tampas da tova, se necessário",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 16,
    descricao: "Trocar os tubos de ar/bicos e verificar aba cônica",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 17,
    descricao: "Trocar os bocais dos arrolhadores, se necessário",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 18,
    descricao: "Ajustar o transporte pneumático aéreo e a entrada de garrafas",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 19,
    descricao: "Regular o transporte de saída de garrafas",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 20,
    descricao: "Guardar corretamente o kit retirado da máquina",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
];

export function itensPorMomento(momento: string): ItemChecklistDef[] {
  return ITENS_CHECKLIST.filter((i) => i.momento === momento);
}
