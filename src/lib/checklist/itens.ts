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

/** A Enchedora 2 usa os mesmos itens do FM09 da Enchedora 3. */
export const ITENS_ENCHEDORA_2: ItemChecklistDef[] = ITENS_CHECKLIST.map((item) => ({
  ...item,
}));

export const ITENS_EMPACOTADORA_2: ItemChecklistDef[] = [
  // FM09 PSGQ07, Empacotadora Rodhigero da Linha 2.
  {
    numero: 1,
    descricao: "Checar e informar a pressão de ar comprimido",
    tipo: "numerico",
    unidade: "MPa",
    referencia: "Recomendável: 0,6 a 1,0 MPa",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 2,
    descricao: "Verificar o funcionamento dos exaustores do túnel de resfriamento",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 3,
    descricao: "Checar e informar a temperatura do túnel de selagem",
    tipo: "numerico",
    unidade: "°C",
    referencia: "Recomendável: 215,0 a 250,0 °C",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 4,
    descricao: "Verificar se o sensor de entrada está atuando",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 5,
    descricao: "Verificar se o sensor de saída está atuando",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 6,
    descricao: "Verificar se o sistema que segura a bobina está atuando",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 7,
    descricao: "Verificar se as barras de arraste não estão empenadas",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 8,
    descricao: "Verificar se o cilindro do guia do pacote e o regulador do pistão estão atuando",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 9,
    descricao: "Verificar se as bandeirolas estão atuando corretamente",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  {
    numero: 10,
    descricao: "Verificar se todos os botões de emergência estão funcionando",
    tipo: "simples",
    permiteNA: false,
    momento: "Início / retomada de processo",
  },
  // Durante setup, longas paradas ou PCM.
  {
    numero: 11,
    descricao: "Verificar se as correntes e esteiras da máquina estão com desgaste",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 12,
    descricao: "Checar se a esteira de forno está com o guia de alinhamento",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 13,
    descricao: "Checar se a fita de deslizamento do arraste de pacote está atuando",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 14,
    descricao: "Checar a lubrificação da máquina",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  {
    numero: 15,
    descricao: "Verificar junto ao líder preventivas operacionais pendentes e realizá-las",
    tipo: "simples",
    permiteNA: true,
    momento: "Setup / longas paradas / PCM",
  },
  // Pós-setup.
  {
    numero: 16,
    descricao: "Regular os guias de entrada de garrafas",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 17,
    descricao: "Regular os guias de entrada do pacote",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 18,
    descricao: "Regular a altura da vareta de envelopamento",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 19,
    descricao: "Ajustar a altura dos sensores",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
  {
    numero: 20,
    descricao: "Instalar a bobina de filme termocontrátil adequada",
    tipo: "simples",
    permiteNA: true,
    momento: "Pós-setup",
  },
];

export const ITENS_EMPACOTADORA_3: ItemChecklistDef[] = ITENS_EMPACOTADORA_2.map(
  (item) => {
    switch (item.numero) {
      case 1:
        return {
          ...item,
          // O campo "bar" do formulário físico é um erro, confirmado pelo usuário.
          unidade: "MPa",
        };
      case 3:
        return { ...item, referencia: "Recomendável: 210,0 a 250,0 °C" };
      case 8:
        return {
          ...item,
          descricao: "Verificar se o guia do pacote e o regulador da prensa estão atuando",
        };
      case 9:
        return { ...item, descricao: "Verificar se as prensas estão atuando" };
      default:
        return { ...item };
    }
  },
);

const ITENS_POR_MAQUINA: Record<string, ItemChecklistDef[]> = {
  "Enchedora 2": ITENS_ENCHEDORA_2,
  "Enchedora 3": ITENS_CHECKLIST,
  "Empacotadora 2": ITENS_EMPACOTADORA_2,
  "Empacotadora 3": ITENS_EMPACOTADORA_3,
};

/** Obtém a versão do checklist correspondente à máquina selecionada. */
export function itensChecklistPorMaquina(maquina: string): ItemChecklistDef[] {
  const itens = ITENS_POR_MAQUINA[maquina];
  if (!itens) throw new Error(`Máquina sem checklist cadastrado: ${maquina}`);
  return itens;
}

export function itensPorMomento(
  momento: string,
  maquina: string = "Enchedora 3",
): ItemChecklistDef[] {
  return itensChecklistPorMaquina(maquina).filter((i) => i.momento === momento);
}
