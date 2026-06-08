import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const xlsxPath = "/Users/luiz_fbm/Documents/programacao/freela/outputs/vitoria_saude_leads_20260605/leads_saude_vitoria_es_2026-06-05.xlsx";

const input = await FileBlob.load(xlsxPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "table",
  range: "Resumo!A1:E21",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 8,
});
console.log("SUMMARY");
console.log(summary.ndjson);

const leads = await workbook.inspect({
  kind: "table",
  range: "Leads!A1:N21",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 14,
});
console.log("LEADS");
console.log(leads.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("ERRORS");
console.log(errors.ndjson);

await workbook.render({ sheetName: "Resumo", range: "A1:E21", scale: 2 });
await workbook.render({ sheetName: "Leads", range: "A1:N12", scale: 1 });
await workbook.render({ sheetName: "Top 3", range: "A1:D7", scale: 2 });

console.log("RENDER_OK");
