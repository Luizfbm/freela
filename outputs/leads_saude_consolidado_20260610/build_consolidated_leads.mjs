import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/luiz_fbm/Documents/programacao/freela/outputs/leads_saude_consolidado_20260610";
const dataPath = `${outputDir}/merged_leads.json`;
const outputPath = `${outputDir}/leads_saude_es_consolidado_2026-06-10.xlsx`;

const columns = [
  ["origin", "origem"],
  ["score", "score"],
  ["business", "business"],
  ["segment", "segment"],
  ["category", "category"],
  ["area", "area"],
  ["distance", "distance"],
  ["website_status", "website_status"],
  ["website_or_social", "website_or_social"],
  ["phone", "phone"],
  ["source_urls", "source_urls"],
  ["why_prospect", "why_prospect"],
  ["confidence", "confidence"],
  ["notes", "notes"],
  ["next_action", "next_action"],
];
const headers = columns.map((column) => column[1]);

const payload = JSON.parse(await fs.readFile(dataPath, "utf8"));
const leads = payload.rows;
const rows = leads.map((lead) => columns.map(([key]) => lead[key] ?? ""));

const workbook = Workbook.create();
const leadSheet = workbook.worksheets.add("Leads");
const summarySheet = workbook.worksheets.add("Resumo");
const topSheet = workbook.worksheets.add("Primeiros contatos");

leadSheet.getRange("A1:O1").values = [headers];
leadSheet.getRange(`A2:O${rows.length + 1}`).values = rows;

summarySheet.getRange("A1:H1").merge();
summarySheet.getRange("A1:H1").values = [["Leads de saude consolidados - Vitoria e Vila Velha/ES"]];
summarySheet.getRange("A3:B9").values = [
  ["Localizacoes", "Vitoria/ES e Vila Velha/ES"],
  ["Arquivos de origem", "leads_saude_vila_velha_es_2026-06-09.xlsx; leads_saude_vitoria_es_2026-06-05.xlsx"],
  ["Data da consolidacao", "2026-06-10"],
  ["Regra usada", "Todos os leads foram preservados; use a coluna score para filtrar Hot/Warm."],
  ["Total de leads", ""],
  ["Duplicados removidos", "0"],
  ["Observacao", "Campos foram normalizados para uma unica tabela de prospeccao."],
];
summarySheet.getRange("B7").formulas = [["=COUNTA(Leads!C2:C1000)"]];

summarySheet.getRange("D3:E11").values = [
  ["Metrica", "Valor"],
  ["Hot", ""],
  ["Warm", ""],
  ["High confidence", ""],
  ["Medium confidence", ""],
  ["Vitoria/ES", ""],
  ["Vila Velha/ES", ""],
  ["Odontologia", ""],
  ["Fisioterapia/Pilates", ""],
];
summarySheet.getRange("E4:E11").formulas = [
  ['=COUNTIF(Leads!B:B,"Hot")'],
  ['=COUNTIF(Leads!B:B,"Warm")'],
  ['=COUNTIF(Leads!M:M,"High")'],
  ['=COUNTIF(Leads!M:M,"Medium")'],
  ['=COUNTIF(Leads!A:A,"Vitoria/ES")'],
  ['=COUNTIF(Leads!A:A,"Vila Velha/ES")'],
  ['=COUNTIF(Leads!D:D,"Odontologia")'],
  ['=COUNTIF(Leads!D:D,"Fisioterapia")+COUNTIF(Leads!D:D,"Pilates")+COUNTIF(Leads!C:C,"*Fisioterapia*")+COUNTIF(Leads!C:C,"*Pilates*")'],
];

summarySheet.getRange("A12:C18").values = [
  ["Como usar", "Acao", "Observacao"],
  ["Filtrar Hot", "Use filtro na coluna score", "Mantive Warm para nao perder pesquisa ja feita."],
  ["Priorizar contato", "Score Hot + confidence High", "Mais seguro para abordagem inicial."],
  ["Checar site", "Veja website_status e website_or_social", "Social only e No site found sao bons sinais."],
  ["Abrir fonte", "Use source_urls", "Alguns campos tem mais de uma URL separada por ponto e virgula."],
  ["Preparar demo", "Veja business, category, area e notes", "Confirmar dados antes de enviar WhatsApp."],
  ["Registrar acao", "Atualize next_action", "Campo editavel para follow-up."],
];

const topRows = leads
  .filter((lead) => lead.score === "Hot")
  .sort((a, b) => {
    const confidenceRank = { High: 0, Medium: 1 };
    return (confidenceRank[a.confidence] ?? 2) - (confidenceRank[b.confidence] ?? 2)
      || a.origin.localeCompare(b.origin, "pt-BR")
      || a.business.localeCompare(b.business, "pt-BR");
  })
  .slice(0, 12)
  .map((lead, index) => [
    index + 1,
    lead.business,
    lead.origin,
    lead.segment,
    lead.phone,
    lead.why_prospect,
  ]);

topSheet.getRange("A1:F1").merge();
topSheet.getRange("A1:F1").values = [["Primeiros contatos sugeridos"]];
topSheet.getRange("A3:F3").values = [["Prioridade", "Negocio", "Origem", "Segmento", "Telefone", "Motivo"]];
topSheet.getRange(`A4:F${topRows.length + 3}`).values = topRows;

const sheets = [leadSheet, summarySheet, topSheet];
for (const sheet of sheets) {
  sheet.getRange("A1:Z300").format.font = { name: "Arial", size: 10, color: "#111827" };
}

leadSheet.getRange("A1:O1").format = {
  fill: "#F3F4F6",
  font: { name: "Arial", size: 10, bold: true, color: "#111827" },
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
leadSheet.getRange(`A2:O${rows.length + 1}`).format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
leadSheet.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add("containsText", {
  text: "Hot",
  format: { fill: "#DCFCE7", font: { color: "#166534", bold: true } },
});
leadSheet.getRange(`B2:B${rows.length + 1}`).conditionalFormats.add("containsText", {
  text: "Warm",
  format: { fill: "#FEF3C7", font: { color: "#92400E", bold: true } },
});
leadSheet.getRange(`M2:M${rows.length + 1}`).conditionalFormats.add("containsText", {
  text: "High",
  format: { fill: "#DBEAFE", font: { color: "#1D4ED8", bold: true } },
});

const leadWidths = [120, 70, 240, 140, 210, 150, 90, 155, 240, 170, 380, 280, 95, 300, 280];
leadWidths.forEach((width, index) => {
  const column = String.fromCharCode("A".charCodeAt(0) + index);
  leadSheet.getRange(`${column}1:${column}${rows.length + 1}`).format.columnWidthPx = width;
});
leadSheet.getRange("A1:O1").format.rowHeightPx = 36;
leadSheet.getRange(`A2:O${rows.length + 1}`).format.rowHeightPx = 66;

summarySheet.getRange("A1:H1").format = {
  fill: "#F3F4F6",
  font: { name: "Arial", size: 15, bold: true, color: "#111827" },
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summarySheet.getRange("A3:B9").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
summarySheet.getRange("A3:A9").format = { fill: "#F9FAFB", font: { bold: true } };
summarySheet.getRange("D3:E11").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  horizontalAlignment: "left",
};
summarySheet.getRange("D3:E3").format = { fill: "#F3F4F6", font: { bold: true } };
summarySheet.getRange("A12:C18").format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
summarySheet.getRange("A12:C12").format = { fill: "#F3F4F6", font: { bold: true } };
summarySheet.getRange("A1:H1").format.rowHeightPx = 42;
summarySheet.getRange("A:A").format.columnWidthPx = 180;
summarySheet.getRange("B:B").format.columnWidthPx = 560;
summarySheet.getRange("C:C").format.columnWidthPx = 26;
summarySheet.getRange("D:D").format.columnWidthPx = 190;
summarySheet.getRange("E:E").format.columnWidthPx = 110;

topSheet.getRange("A1:F1").format = {
  fill: "#F3F4F6",
  font: { name: "Arial", size: 15, bold: true, color: "#111827" },
  borders: { preset: "outside", style: "thin", color: "#D1D5DB" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
topSheet.getRange(`A3:F${topRows.length + 3}`).format = {
  borders: { preset: "outside", style: "thin", color: "#E5E7EB" },
  verticalAlignment: "top",
  wrapText: true,
};
topSheet.getRange("A3:F3").format = { fill: "#F3F4F6", font: { bold: true } };
topSheet.getRange("A:A").format.columnWidthPx = 90;
topSheet.getRange("B:B").format.columnWidthPx = 280;
topSheet.getRange("C:C").format.columnWidthPx = 120;
topSheet.getRange("D:D").format.columnWidthPx = 150;
topSheet.getRange("E:E").format.columnWidthPx = 180;
topSheet.getRange("F:F").format.columnWidthPx = 420;
topSheet.getRange("A1:F1").format.rowHeightPx = 42;
topSheet.getRange(`A4:F${topRows.length + 3}`).format.rowHeightPx = 60;

const summaryInspect = await workbook.inspect({
  kind: "table",
  range: "Resumo!A1:E18",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 5,
});
console.log("SUMMARY");
console.log(summaryInspect.ndjson);

const leadInspect = await workbook.inspect({
  kind: "table",
  range: "Leads!A1:O12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 15,
});
console.log("LEADS");
console.log(leadInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("ERRORS");
console.log(errors.ndjson);

await workbook.render({ sheetName: "Resumo", range: "A1:E18", scale: 2 });
await workbook.render({ sheetName: "Leads", range: "A1:O12", scale: 1 });
await workbook.render({ sheetName: "Primeiros contatos", range: "A1:F15", scale: 1 });

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, rows: rows.length }));
