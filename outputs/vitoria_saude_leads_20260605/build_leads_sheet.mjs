import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/luiz_fbm/Documents/programacao/freela/outputs/vitoria_saude_leads_20260605";
const outputPath = `${outputDir}/leads_saude_vitoria_es_2026-06-05.xlsx`;

const leads = [
  ["Hot", "Clínica Equilíbrio Fisioterapia", "Fisioterapia/Terapias", "Fisioterapia", "Enseada do Suá", "<=10 km", "Somente social", "Instagram / sem site listado", "(27) 3235-1857", "Clínica ativa com contato e sem site próprio.", "High", "https://br.todosnegocios.com/pt/clinica-equilibrio-fisioterapia-e_1m-27-3235-1857", "Fonte informa Instagram e ausência de site listado.", "Abordar oferecendo site institucional com CTA para WhatsApp."],
  ["Hot", "Espaço Vitta Saúde", "Fisioterapia/Terapias", "Fisioterapia, pilates, saúde integrada", "Jardim da Penha", "<=10 km", "Somente social", "Instagram @vittasaudee", "(27) 2142-1173", "ME ativa, presença pública dependente de Instagram/diretórios.", "High", "https://ajudes.org.br/project/espaco-vitta-saude/", "Confirmado em convênio Ajudes e cadastro CNPJ público.", "Abordar com landing page para serviços e agendamento."],
  ["Hot", "EssenceSaúde", "Fisioterapia/Terapias", "Terapias integrativas, fisioterapia", "Praia do Suá", "<=10 km", "Google Sites + booking", "Google Sites + Setmore + Instagram", "(27) 99779-6437", "Tem site em Google Sites e agenda externa; oportunidade de melhorar presença própria.", "High", "https://sites.google.com/view/essencesade", "Fonte adicional: Setmore/SindjudES lista Instagram e WhatsApp.", "Oferecer redesign/landing page integrada ao WhatsApp e reservas."],
  ["Hot", "Fisiohealth Clínica de Fisioterapia e Pilates", "Fisioterapia/Terapias", "Fisioterapia", "Jardim Camburi", "<=10 km", "Somente social", "Instagram como site", "(27) 3014-9801", "Boa presença local, mas sem página própria.", "High", "https://seniorbemestar.com/clinicas-de-fisioterapia/vitoria/fisiohealth-clinica-de-fisioterapia-e-pilates/", "Também aparece em Cylex, BuscaFisio e Solutudo.", "Abordar com site simples para captação por bairro."],
  ["Hot", "Fisio Ativa Clínica de Fisioterapia e Pilates", "Fisioterapia/Terapias", "Fisioterapia", "Praia do Canto", "<=10 km", "Sem site encontrado", "Diretório local", "(27) 3315-5190", "Avaliações e telefone, mas sem domínio próprio encontrado.", "Medium", "https://br.physiofinder.net/pt-br/i/23000-fisio-ativa-clinica-de-fisioterapia-e-pilates/", "Busca exata não retornou domínio próprio confiável.", "Validar Instagram antes do contato e propor site de serviços."],
  ["Hot", "Flexfisio Clínica de Fisioterapia e Pilates", "Fisioterapia/Terapias", "Fisioterapia", "Jardim Camburi", "<=10 km", "Sem site encontrado", "Diretório Fisio.net", "(27) 9873-8348", "Pequena clínica sem site próprio visível.", "Medium", "https://fisio.net.br/sobre/flexfisio-vitoria-es-28420001", "Diretório marca empresa como não reivindicada.", "Abordar com proposta de página local e Google Business."],
  ["Hot", "Espaço Fisio LTDA", "Fisioterapia/Terapias", "Fisioterapia e pilates", "Enseada do Suá", "<=10 km", "Sem site encontrado", "Diretório local", "(27) 98153-8335", "Tem telefone e endereço, mas depende de listagem.", "Medium", "https://www.locaisdobrasil.com.br/encontre/clinica-de-fisioterapia/vitoria-es/clinica-de-fisioterapia-e-pilates-espaco-fisio-ltda/6507c72e831a9c92fa853c30", "Convênios listados em fonte pública.", "Oferecer site de credenciamentos, convênios e horários."],
  ["Hot", "Viva Odontologia", "Odontologia", "Odontologia", "Santa Lúcia", "<=10 km", "Somente social", "Instagram / sem site listado", "(27) 3026-1235", "Clínica odontológica ativa sem site próprio.", "High", "https://br.todosnegocios.com/pt/viva-odontologia_2H-27-3026-1235", "Fonte informa Instagram e ausência de site listado.", "Abordar com site focado em especialidades e agendamento."],
  ["Hot", "COI Odontologia", "Odontologia", "Odontologia", "Praia do Suá", "<=10 km", "Somente social", "Instagram @coiodontovix", "(27) 99610-5491", "Oferta completa e captação ainda dependente de social.", "High", "https://ajudes.org.br/project/coi-odontologia/", "Fonte Ajudes lista serviços, telefone e Instagram.", "Abordar com site para implantes, estética e tráfego local."],
  ["Hot", "CIEO", "Odontologia", "Odontologia", "Vitória", "<=10 km", "Somente Facebook", "Sem site listado", "(27) 3235-2509", "Tem telefone, avaliações e sem site próprio.", "High", "https://br.todosnegocios.com/pt/cieo-centro-integrado-de-especialidades_3V-27-3235-2509", "Fonte informa Facebook e ausência de site listado.", "Abordar com página institucional e prova social."],
  ["Hot", "Clínica Dentare", "Odontologia", "Odontologia", "Vitória", "<=10 km", "Sem site encontrado", "Foursquare/diretório", "(27) 3325-9459", "Clínica com contato público, sem domínio próprio visível.", "Medium", "https://br.todosnegocios.com/pt/cl%C3%ADnica-dentare-27-3325-9459", "Busca exata não encontrou site próprio confiável.", "Validar atividade antes do contato e oferecer presença básica."],
  ["Hot", "CEO Clínica de Especialidades Odontológicas", "Odontologia", "Odontologia", "Jardim da Penha", "<=10 km", "Somente social/diretório", "Sem site listado", "(27) 3227-8122", "Clínica com telefone e ausência de site próprio.", "High", "https://br.todosnegocios.com/pt/ceo-cl%C3%ADnica-de-especialidades-27-3227-8122", "Fonte informa Facebook e ausência de site listado.", "Abordar com site de especialidades e canais de contato."],
  ["Hot", "Max Túlio Clínica Odontológica", "Odontologia", "Odontologia", "Praia do Canto", "<=10 km", "Somente Instagram", "Instagram listado como site", "(27) 3024-1561 / 99848-1178", "Boa especialização, mas sem site próprio.", "Medium", "https://painelwebservice.cfa.org.br/?a=show&c=pesquisa&id=1044", "Fonte lista Instagram como site e unidade em Vitória.", "Abordar com página de especialidades e diferenciais."],
  ["Hot", "Dra. Andressa Rocha Odontologia", "Odontologia", "Odontologia estética", "Jardim da Penha", "<=10 km", "Somente social", "Instagram/WhatsApp", "(27) 99979-8481", "Perfil comercial forte, sem site próprio encontrado.", "Medium", "https://eguias.net/empresa/dra-andressa-rocha-odontologia-implante-dentario-harmonizacao-facial-em-vitoria/vitoria/es/3548408", "Fonte lista Instagram e WhatsApp.", "Abordar com landing page de implantes e harmonização."],
  ["Hot", "Dra. Karine Pimentel Ortodontia", "Odontologia", "Ortodontia", "Santa Lúcia", "<=10 km", "Linktree/social only", "Linktree", "WhatsApp via Linktree", "Profissional com contato digital, sem domínio próprio.", "Medium", "https://linktr.ee/karinepimentelorto", "Linktree informa localização, Instagram e WhatsApp.", "Abordar com site one-page para autoridade em ortodontia."],
  ["Hot", "Dra. Aline Bragança", "Odontologia", "Odontologia/Harmonização", "Vitória", "<=10 km", "Linktree/social only", "Linktree", "WhatsApp via Linktree", "Depende de Linktree para conversão.", "Medium", "https://linktr.ee/dra.alinebraganca", "Linktree informa cirurgiã-dentista em Vitória.", "Abordar com página de procedimentos e formulário rápido."],
  ["Warm", "COEH Clínica Odontológica do Hálito", "Odontologia", "Odontologia", "Santa Lúcia", "<=10 km", "Somente Facebook", "Sem site listado", "Not found", "Sem telefone visível, mas há contato comercial por email/Facebook.", "Medium", "https://br.todosnegocios.com/pt/coeh-cl%C3%ADnica-odontol%C3%B3gica-do-h%C3%A1lito", "Contato incompleto; validar canal antes de priorizar.", "Pesquisar telefone antes do outreach."],
  ["Warm", "Laboratório Deomar Bittencourt", "Laboratório", "Laboratório clínico", "Centro/Jardim Camburi", "<=10 km", "Site antigo/histórico", "Sem site listado; domínio histórico", "(27) 3223-0582", "Parece ter lacuna de presença própria atual.", "Medium", "https://br.todosnegocios.com/pt/laborat%C3%B3rio-an%C3%A1lises-cl%C3%ADnicas-deomar-27-3223-0582", "Fonte menciona domínio histórico deomarbittencourt.com.br.", "Validar operação atual e propor atualização de presença."],
  ["Hot", "LAPACI", "Laboratório", "Anatomia patológica/citologia", "Praia do Suá", "<=10 km", "Sem site encontrado", "Diretório Cylex", "(27) 3325-4248", "Laboratório pequeno com telefone e sem site visível.", "Medium", "https://www.cylex.com.br/vitoria/lapaci-laborat%C3%B3rio-de-anatomia-patol%C3%B3gica-e-citologia-ltda-11337545.html", "Fonte pública lista telefone, endereço e horário.", "Abordar com site técnico para médicos e pacientes."],
  ["Warm", "Laboratório Biolab", "Laboratório", "Laboratório clínico", "Parque Moscoso", "<=10 km", "Sem site encontrado", "Diretório local", "(27) 3223-5755", "Listagem básica, sem canal próprio claro.", "Medium", "https://www.encontraes.com.br/local/laboratorio-biolab-439311", "Empresa maior/filial: validar se já usa marca corporativa.", "Validar autonomia local antes de ofertar site próprio."],
];

const headers = [
  "Score",
  "Negócio",
  "Segmento",
  "Categoria",
  "Área",
  "Distância",
  "Status do site",
  "Website/Social",
  "Telefone",
  "Por que é prospect",
  "Confiança",
  "Fonte principal",
  "Notas",
  "Próxima ação",
];

const workbook = Workbook.create();
const leadSheet = workbook.worksheets.add("Leads");
const summarySheet = workbook.worksheets.add("Resumo");
const topSheet = workbook.worksheets.add("Top 3");

leadSheet.getRange("A1:N1").values = [headers];
leadSheet.getRange(`A2:N${leads.length + 1}`).values = leads;

summarySheet.getRange("A1:H1").merge();
summarySheet.getRange("A1:H1").values = [["Leads de saúde com presença digital fraca - Vitória/ES"]];
summarySheet.getRange("A3:B8").values = [
  ["Localização", "Vitória, Espírito Santo"],
  ["Raio", "10 km"],
  ["Categorias", "Fisioterapeutas, dentistas, pequenos laboratórios e saúde local"],
  ["Objetivo", "Leads sem site próprio forte ou dependentes de social/booking"],
  ["Data da pesquisa", "2026-06-05"],
  ["Total de leads", ""],
];
summarySheet.getRange("B8").formulas = [["=COUNTA(Leads!B2:B1000)"]];

summarySheet.getRange("D3:E7").values = [
  ["Métrica", "Valor"],
  ["Hot", ""],
  ["Warm", ""],
  ["High confidence", ""],
  ["Medium confidence", ""],
];
summarySheet.getRange("E4:E7").formulas = [
  ['=COUNTIF(Leads!A:A,"Hot")'],
  ['=COUNTIF(Leads!A:A,"Warm")'],
  ['=COUNTIF(Leads!K:K,"High")'],
  ['=COUNTIF(Leads!K:K,"Medium")'],
];

summarySheet.getRange("A11:B14").values = [
  ["Leads por score", "Qtd."],
  ["Hot", ""],
  ["Warm", ""],
  ["Total", ""],
];
summarySheet.getRange("B12:B14").formulas = [
  ['=COUNTIF(Leads!A:A,A12)'],
  ['=COUNTIF(Leads!A:A,A13)'],
  ["=SUM(B12:B13)"],
];

summarySheet.getRange("D11:E15").values = [
  ["Leads por segmento", "Qtd."],
  ["Fisioterapia/Terapias", ""],
  ["Odontologia", ""],
  ["Laboratório", ""],
  ["Total", ""],
];
summarySheet.getRange("E12:E15").formulas = [
  ['=COUNTIF(Leads!C:C,D12)'],
  ['=COUNTIF(Leads!C:C,D13)'],
  ['=COUNTIF(Leads!C:C,D14)'],
  ["=SUM(E12:E14)"],
];

summarySheet.getRange("A18:C21").values = [
  ["Melhores primeiros alvos", "Segmento", "Motivo prático"],
  ["Clínica Equilíbrio Fisioterapia", "Fisioterapia/Terapias", "Alta confiança, telefone direto e sem site listado."],
  ["Fisiohealth Clínica de Fisioterapia e Pilates", "Fisioterapia/Terapias", "Instagram aparece como site; bom argumento para domínio próprio."],
  ["Max Túlio Clínica Odontológica", "Odontologia", "Clínica especializada com contatos e presença dependente de Instagram."],
];

topSheet.getRange("A1:D1").merge();
topSheet.getRange("A1:D1").values = [["Top 3 primeiros contatos"]];
topSheet.getRange("A3:D6").values = [
  ["Prioridade", "Negócio", "Telefone", "Abordagem sugerida"],
  [1, "Clínica Equilíbrio Fisioterapia", "(27) 3235-1857", "Site institucional enxuto com CTA para WhatsApp e serviços de fisioterapia."],
  [2, "Fisiohealth Clínica de Fisioterapia e Pilates", "(27) 3014-9801", "Landing page local com serviços, convênios, avaliações e agendamento."],
  [3, "Max Túlio Clínica Odontológica", "(27) 3024-1561 / 99848-1178", "Página de especialidades odontológicas com prova social e botão de contato."],
];

const sheets = [leadSheet, summarySheet, topSheet];
for (const sheet of sheets) {
  sheet.getRange("A1:Z200").format.font = { name: "Arial", size: 10, color: "#111827" };
}

leadSheet.getRange("A1:N1").format = {
  fill: "#F3F4F6",
  font: { name: "Arial", size: 10, bold: true, color: "#111827" },
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
leadSheet.getRange(`A2:N${leads.length + 1}`).format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
leadSheet.getRange(`A2:A${leads.length + 1}`).conditionalFormats.add("containsText", {
  text: "Hot",
  format: { fill: "#DCFCE7", font: { color: "#166534", bold: true } },
});
leadSheet.getRange(`A2:A${leads.length + 1}`).conditionalFormats.add("containsText", {
  text: "Warm",
  format: { fill: "#FEF3C7", font: { color: "#92400E", bold: true } },
});
leadSheet.getRange(`K2:K${leads.length + 1}`).conditionalFormats.add("containsText", {
  text: "High",
  format: { fill: "#DBEAFE", font: { color: "#1D4ED8", bold: true } },
});

const leadWidths = [70, 230, 150, 180, 130, 90, 140, 180, 150, 260, 95, 360, 260, 280];
leadWidths.forEach((width, idx) => {
  const col = String.fromCharCode("A".charCodeAt(0) + idx);
  leadSheet.getRange(`${col}1:${col}${leads.length + 1}`).format.columnWidthPx = width;
});
leadSheet.getRange("A1:N1").format.rowHeightPx = 36;
leadSheet.getRange(`A2:N${leads.length + 1}`).format.rowHeightPx = 64;

summarySheet.getRange("A1:H1").format = {
  fill: "#F3F4F6",
  font: { name: "Arial", size: 15, bold: true, color: "#111827" },
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summarySheet.getRange("A3:B8").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
summarySheet.getRange("A3:A8").format = { fill: "#F9FAFB", font: { bold: true } };
summarySheet.getRange("D3:E7").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  horizontalAlignment: "left",
};
summarySheet.getRange("D3:E3").format = { fill: "#F3F4F6", font: { bold: true } };
summarySheet.getRange("A11:B14").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
};
summarySheet.getRange("D11:E15").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
};
summarySheet.getRange("A11:B11").format = { fill: "#F3F4F6", font: { bold: true } };
summarySheet.getRange("D11:E11").format = { fill: "#F3F4F6", font: { bold: true } };
summarySheet.getRange("A18:C21").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
summarySheet.getRange("A18:C18").format = { fill: "#F3F4F6", font: { bold: true } };
summarySheet.getRange("A1:H1").format.rowHeightPx = 42;
summarySheet.getRange("A:A").format.columnWidthPx = 190;
summarySheet.getRange("B:B").format.columnWidthPx = 370;
summarySheet.getRange("C:C").format.columnWidthPx = 24;
summarySheet.getRange("D:D").format.columnWidthPx = 190;
summarySheet.getRange("E:E").format.columnWidthPx = 90;

topSheet.getRange("A1:D1").format = {
  fill: "#F3F4F6",
  font: { name: "Arial", size: 15, bold: true, color: "#111827" },
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
topSheet.getRange("A3:D6").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
topSheet.getRange("A3:D3").format = { fill: "#F3F4F6", font: { bold: true } };
topSheet.getRange("A:A").format.columnWidthPx = 90;
topSheet.getRange("B:B").format.columnWidthPx = 260;
topSheet.getRange("C:C").format.columnWidthPx = 180;
topSheet.getRange("D:D").format.columnWidthPx = 430;
topSheet.getRange("A1:D1").format.rowHeightPx = 42;
topSheet.getRange("A4:D6").format.rowHeightPx = 58;

await fs.mkdir(outputDir, { recursive: true });

await workbook.render({ sheetName: "Resumo", range: "A1:H22", scale: 2 });
await workbook.render({ sheetName: "Leads", range: "A1:N12", scale: 1 });
await workbook.render({ sheetName: "Top 3", range: "A1:D7", scale: 2 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, rows: leads.length, sheets: ["Leads", "Resumo", "Top 3"] }, null, 2));
