import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const xlsxPath = "/Users/luiz_fbm/Documents/programacao/freela/outputs/vila_velha_saude_leads_20260609/leads_saude_vila_velha_es_2026-06-09.xlsx";

const input = await FileBlob.load(xlsxPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "table",
  range: "Resumo!A1:E25",
  include: "values,formulas",
  tableMaxRows: 28,
  tableMaxCols: 8,
});
console.log("SUMMARY");
console.log(summary.ndjson);

const leads = await workbook.inspect({
  kind: "table",
  range: "Leads!A1:M31",
  include: "values,formulas",
  tableMaxRows: 35,
  tableMaxCols: 13,
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

await workbook.render({ sheetName: "Resumo", range: "A1:E25", scale: 2 });
await workbook.render({ sheetName: "Leads", range: "A1:M12", scale: 1 });
await workbook.render({ sheetName: "Fontes", range: "A1:D11", scale: 2 });

console.log("RENDER_OK");
