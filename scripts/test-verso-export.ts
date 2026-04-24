import ExcelJS from "exceljs";
import { gerarVersoWorksheet } from "@/lib/verso/excel-export";

const wb = new ExcelJS.Workbook();

const ptpJanelas: any = [
  { janelaCodigo: "J01", janelaInicio: "06:00", janelaFim: "08:00", statusJanela: "houve_ocorrencia",
    operadorLogin: "bruno", operadorNome: "Bruno Dia",
    itens: [
      { codigo: "TAMPA_ALTA", quantidade: 3 },
      { codigo: "ESTOURANDO", quantidade: 0 },
      { codigo: "FINISH_QUEBRANDO", quantidade: 1 },
      { codigo: "NIVEL_BAIXO", quantidade: 0 },
      { codigo: "SEM_TAMPA", quantidade: 7 },
    ],
    analiseAngulo: { v1Realizada: true, v2Realizada: true },
    observacao: "Pista 2 com vibração" },
  { janelaCodigo: "J02", janelaInicio: "08:00", janelaFim: "10:00", statusJanela: "sem_ocorrencia",
    operadorLogin: "bruno", operadorNome: "Bruno Dia",
    itens: [], analiseAngulo: { v1Realizada: true, v2Realizada: false } },
  { janelaCodigo: "J03", janelaInicio: "10:00", janelaFim: "12:00", statusJanela: "nao_rodou",
    operadorLogin: "bruno", operadorNome: "Bruno Dia", itens: [], analiseAngulo: null },
  { janelaCodigo: "J04", janelaInicio: "12:00", janelaFim: "14:00", statusJanela: "houve_ocorrencia",
    operadorLogin: "bruno", operadorNome: "Bruno Dia",
    itens: [{ codigo: "NIVEL_BAIXO", quantidade: 12 }],
    analiseAngulo: { v1Realizada: true, v2Realizada: true } },
  { janelaCodigo: "J05", janelaInicio: "14:00", janelaFim: "16:00", statusJanela: "sem_ocorrencia",
    operadorLogin: "bruno", operadorNome: "Bruno Dia", itens: [], analiseAngulo: null },
  { janelaCodigo: "J06", janelaInicio: "16:00", janelaFim: "18:00", statusJanela: "sem_ocorrencia",
    operadorLogin: "bruno", operadorNome: "Bruno Dia", itens: [], analiseAngulo: null },
  { janelaCodigo: "J07", janelaInicio: "18:00", janelaFim: "20:00", statusJanela: "houve_ocorrencia",
    operadorLogin: "carla", operadorNome: "Carla Noite",
    itens: [{ codigo: "ESTOURANDO", quantidade: 4 }],
    analiseAngulo: { v1Realizada: false, v2Realizada: true },
    observacao: "Reposição de garrafas atrasou" },
  { janelaCodigo: "J08", janelaInicio: "20:00", janelaFim: "22:00", statusJanela: "sem_ocorrencia",
    operadorLogin: "carla", operadorNome: "Carla Noite", itens: [], analiseAngulo: null },
  { janelaCodigo: "J09", janelaInicio: "22:00", janelaFim: "00:00", statusJanela: "houve_ocorrencia",
    operadorLogin: "carla", operadorNome: "Carla Noite",
    itens: [{ codigo: "TAMPA_ALTA", quantidade: 2 }],
    analiseAngulo: { v1Realizada: true, v2Realizada: false } },
  { janelaCodigo: "J10", janelaInicio: "00:00", janelaFim: "02:00", statusJanela: "sem_ocorrencia",
    operadorLogin: "diego", operadorNome: "Diego 3T", itens: [], analiseAngulo: null },
  { janelaCodigo: "J11", janelaInicio: "02:00", janelaFim: "04:00", statusJanela: "houve_ocorrencia",
    operadorLogin: "diego", operadorNome: "Diego 3T",
    itens: [{ codigo: "SEM_TAMPA", quantidade: 5 }, { codigo: "TAMPA_ALTA", quantidade: 1 }],
    analiseAngulo: { v1Realizada: true, v2Realizada: true } },
  { janelaCodigo: "J12", janelaInicio: "04:00", janelaFim: "06:00", statusJanela: "sem_ocorrencia",
    operadorLogin: "diego", operadorNome: "Diego 3T", itens: [], analiseAngulo: null },
];

const limpezaTurnos: any = [
  { turno: "12x36 Dia", status: "validado",
    operadorLogin: "bruno", operadorNome: "Bruno Dia",
    liderLogin: "lider1", liderNome: "Líder Dia",
    itens: Array.from({length:21},(_,i)=>({ codigo: i+1, status: i % 7 === 3 ? "nao_realizado" : (i % 5 === 0 ? "nao_aplicavel" : "realizado") })),
    observacao: "Limpeza concluída sem pendências." },
  { turno: "12x36 Noite", status: "aguardando_validacao",
    operadorLogin: "carla", operadorNome: "Carla Noite",
    liderLogin: null, liderNome: null,
    itens: Array.from({length:21},(_,i)=>({ codigo: i+1, status: "realizado" })),
    observacao: "" },
  { turno: "3º Turno", status: "validado",
    operadorLogin: "diego", operadorNome: "Diego 3T",
    liderLogin: "lider3", liderNome: "Líder 3T",
    itens: Array.from({length:21},(_,i)=>({ codigo: i+1, status: i === 10 ? "nao_realizado" : "realizado" })),
    observacao: "Item 11 fica para próximo turno." },
];

gerarVersoWorksheet(wb, {
  dataOperacao: "2026-04-24",
  ptpJanelas,
  limpezaTurnos,
});

await wb.xlsx.writeFile("/tmp/teste-export.xlsx");
console.log("OK");
