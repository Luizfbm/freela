import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/luiz_fbm/Documents/programacao/freela/outputs/vila_velha_saude_leads_20260609";
const outputPath = `${outputDir}/leads_saude_vila_velha_es_2026-06-09.xlsx`;

const leads = [
  {
    score: "Hot",
    business: "VilaFisio Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Itapua",
    distance_km: 4.5,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/vilafisio_24/",
    phone: "+55 27 99205-8920",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/vilafisio_24/",
    why_prospect: "Instagram listado como principal presenca digital; telefone direto.",
    confidence: "High",
    notes: "Busca exata por nome + Vila Velha nao retornou dominio proprio confiavel.",
  },
  {
    score: "Hot",
    business: "Clinica Viva Sem Dor",
    category: "Fisioterapia",
    area: "Centro / Prainha",
    distance_km: 1.5,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/clinicavivasemdor/",
    phone: "+55 27 99810-5020",
    source_urls: "https://www.instagram.com/clinicavivasemdor/; https://www.instagram.com/reel/DGmCCt2PMgY/",
    why_prospect: "Clinca ativa com WhatsApp visivel e sem site proprio encontrado.",
    confidence: "High",
    notes: "Post publico informa endereco em Vila Velha e WhatsApp.",
  },
  {
    score: "Hot",
    business: "CLIFIT",
    category: "Fisioterapia e Terapia Ocupacional",
    area: "Centro / Praia da Costa",
    distance_km: 1.5,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/clifitvv/",
    phone: "+55 27 98827-3408",
    source_urls: "https://www.instagram.com/clifitvv/; https://www.unimed.coop.br/site/web/vitoria/credenciamento-descredenciamento-extensao-de-prestador-unimed-vitoria/-/asset_publisher/eW4DRtThFmYW/content/extens%C3%A3o-de-servi%C3%A7o-fisioterapia-p%C3%A9lvica-prestador-600004-clifit-cl%C3%ADnica-de-fisioterapia-ltda",
    why_prospect: "Atendimento tradicional, mas presenca propria nao apareceu na busca.",
    confidence: "High",
    notes: "Instagram e fonte Unimed confirmam operacao/contato em Vila Velha.",
  },
  {
    score: "Hot",
    business: "Betafisio",
    category: "Fisioterapia e Pilates",
    area: "Paul",
    distance_km: 4.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/betafisio.es/",
    phone: "+55 27 99741-7152; +55 27 3063-6012",
    source_urls: "https://www.instagram.com/betafisio.es/; https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
    why_prospect: "Telefone e WhatsApp publicos; sem dominio proprio encontrado.",
    confidence: "High",
    notes: "Busca exata por Betafisio + Vila Velha retornou Instagram/diretorios.",
  },
  {
    score: "Hot",
    business: "Clinica Restaurar Fisioterapia e Pilates",
    category: "Fisioterapia e Pilates",
    area: "Terra Vermelha",
    distance_km: 12.5,
    website_status: "Social only",
    website_url: "https://bio.site/clinicarestaurar",
    social_urls: "https://www.instagram.com/clinicarestaurar_/",
    phone: "+55 27 98113-2733",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/clinicarestaurar_/",
    why_prospect: "Usa bio link, nao site proprio; boa abertura para landing page.",
    confidence: "High",
    notes: "Dentro do raio estimado de 15 km a partir de Vila Velha.",
  },
  {
    score: "Hot",
    business: "SR Pilates e Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Cidade da Barra / Riviera da Barra",
    distance_km: 12.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/sergiofisio21/",
    phone: "+55 27 99821-2719",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/sergiofisio21/reel/Cqi30DUjHB7/",
    why_prospect: "Instagram aparece como canal principal; telefone direto.",
    confidence: "High",
    notes: "Busca exata nao exibiu dominio proprio.",
  },
  {
    score: "Hot",
    business: "FisioLife Saude Integrada",
    category: "Fisioterapia e Pilates",
    area: "Praia das Gaivotas",
    distance_km: 6.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/clin_fisiolife/",
    phone: "+55 27 99873-7295",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/clin_fisiolife/",
    why_prospect: "Perfil ativo e telefone listado; sem site proprio encontrado.",
    confidence: "High",
    notes: "Pesquisa exata retornou Instagram/diretorio e nao dominio proprio.",
  },
  {
    score: "Hot",
    business: "MoviFisio Clinica de Fisioterapia",
    category: "Fisioterapia",
    area: "Praia de Itaparica",
    distance_km: 7.0,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 99901-1358",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://casadosdados.com.br/solucao/cnpj/lucia-a-de-oliveira-nascimento-centro-de-estudos-38417347000107",
    why_prospect: "Tem telefone e endereco, mas depende de diretorios.",
    confidence: "Medium",
    notes: "CNPJ aparece em fonte publica; site proprio nao apareceu na busca exata.",
  },
  {
    score: "Hot",
    business: "EC Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Jockey de Itaparica",
    distance_km: 7.5,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/ecpilatesfisioterapia/",
    phone: "+55 27 98881-5456",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/reel/DV9qJzCklFT/",
    why_prospect: "Contato publico e presenca social; sem dominio proprio encontrado.",
    confidence: "Medium",
    notes: "Nome tambem aparece como E C Pilates & Fisioterapia.",
  },
  {
    score: "Hot",
    business: "Fisio para Todos",
    category: "Fisioterapia",
    area: "Gloria",
    distance_km: 3.5,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 98159-2656",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/p/DQPsS5-kksK/",
    why_prospect: "Telefone listado e sem site proprio visivel.",
    confidence: "Medium",
    notes: "Pesquisa exata retornou diretorios e posts, nao site proprio.",
  },
  {
    score: "Hot",
    business: "Fisioterapeuta Robson Vaillant",
    category: "Fisioterapia",
    area: "Centro / Prainha",
    distance_km: 1.5,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 99500-4601",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
    why_prospect: "Profissional local com telefone e sem presenca propria forte.",
    confidence: "Medium",
    notes: "Validar canal social antes de contato se quiser demo mais personalizada.",
  },
  {
    score: "Hot",
    business: "Hiaskara Macedo Fisioterapia",
    category: "Fisioterapia",
    area: "Itapua",
    distance_km: 4.8,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 99851-4520",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://localtreino.com/fisioterapeutas-esportivos/vila-velha/itapua/",
    why_prospect: "Telefone publico e sem site proprio encontrado.",
    confidence: "Medium",
    notes: "Busca exata nao retornou dominio oficial.",
  },
  {
    score: "Hot",
    business: "Fisiocorporis",
    category: "Fisioterapia e Pilates",
    area: "Itapua",
    distance_km: 4.8,
    website_status: "Social only",
    website_url: "https://mycardbio.com/fisiocorporis_saude",
    social_urls: "https://www.instagram.com/fisiocorporis_saude/",
    phone: "+55 27 99916-6692",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/fisiocorporis_saude/",
    why_prospect: "Usa cartao/bio link em vez de site proprio.",
    confidence: "High",
    notes: "Instagram informa WhatsApp e agenda de avaliacao.",
  },
  {
    score: "Hot",
    business: "Evolucao Centro de Saude",
    category: "Centro de Saude / Terapias",
    area: "Praia da Costa",
    distance_km: 2.0,
    website_status: "Social only",
    website_url: "https://linktr.ee/evolucao.cs",
    social_urls: "https://linktr.ee/evolucao.cs",
    phone: "+55 27 99244-4185",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.doctoralia.com.br/doencas/sindrome-de-burnout/vila-velha",
    why_prospect: "Usa Linktree/Doctoralia; oportunidade de site proprio.",
    confidence: "High",
    notes: "Doctoralia confirma endereco em Vila Velha.",
  },
  {
    score: "Hot",
    business: "Espaco FisioVida",
    category: "Fisioterapia e Pilates",
    area: "IBES",
    distance_km: 5.0,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/espaco.fisiovida/",
    phone: "+55 27 99846-9349",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/p/DN6S2vuDyn4/",
    why_prospect: "Presenca social/diretorio; sem site proprio encontrado.",
    confidence: "Medium",
    notes: "Telefone vem de diretorio; confirmar no contato.",
  },
  {
    score: "Hot",
    business: "FisioterapiaHD",
    category: "Fisioterapia",
    area: "Praia de Itaparica",
    distance_km: 7.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/fisioterapia.hd/",
    phone: "+55 27 99988-7148",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/fisioterapia.hd/",
    why_prospect: "Instagram listado como canal; telefone direto.",
    confidence: "High",
    notes: "Busca exata nao mostrou dominio proprio.",
  },
  {
    score: "Hot",
    business: "VIAFISIO",
    category: "Fisioterapia, Pilates e Massoterapia",
    area: "Praia de Itaparica",
    distance_km: 7.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/viafisiopilates/",
    phone: "+55 27 99252-1125",
    source_urls: "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/; https://www.instagram.com/viafisiopilates/",
    why_prospect: "Contato e Instagram visiveis; sem site proprio.",
    confidence: "High",
    notes: "Nome completo no diretorio: VIAFISIO Pilates Fisioterapia Massoterapia.",
  },
  {
    score: "Hot",
    business: "Equipe Fisioterapia Especializada",
    category: "Fisioterapia especializada",
    area: "Praia da Costa",
    distance_km: 2.0,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 3329-8339; +55 27 3329-3673",
    source_urls: "https://www.apontador.com.br/local/es/vila_velha/clinicas_de_fisioterapia/XQRMDWYX/equipe_fisioterapia_especializada.html; https://cretovale.coop.br/2021/03/18/ganhadora-do-spa-presente/",
    why_prospect: "Telefone e especialidades publicas; sem dominio proprio encontrado.",
    confidence: "High",
    notes: "Fontes independentes confirmam endereco/telefone em Vila Velha.",
  },
  {
    score: "Hot",
    business: "Center Pilates & Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Ataide",
    distance_km: 4.0,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 3052-1340",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/; https://www.instagram.com/centerpilates_fisioterapia/",
    why_prospect: "Telefone e listagem local; sem site proprio visivel.",
    confidence: "Medium",
    notes: "A busca retornou tambem unidades fora de Vila Velha; validar unidade no contato.",
  },
  {
    score: "Hot",
    business: "Respirar Pilates e Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Santa Monica",
    distance_km: 6.0,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 99950-3365",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/",
    why_prospect: "Contato publico, sem dominio proprio encontrado.",
    confidence: "Medium",
    notes: "Linha extraida de diretorio local; fazer validacao final antes da demo.",
  },
  {
    score: "Hot",
    business: "Mover Saude Pilates e Musculacao Terapeutica",
    category: "Pilates e Musculacao Terapeutica",
    area: "Centro",
    distance_km: 1.5,
    website_status: "Social only",
    website_url: "https://contate.me/ios/moversaude",
    social_urls: "https://www.instagram.com/moversaude_/",
    phone: "+55 27 99905-1156",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/; https://www.instagram.com/reel/DTBbeAdDn0D/",
    why_prospect: "Usa link de contato em vez de site proprio.",
    confidence: "High",
    notes: "Instagram e diretorio confirmam Vila Velha.",
  },
  {
    score: "Hot",
    business: "Studio de Pilates Sabrina Braga",
    category: "Fisioterapia, Pilates e Massagem",
    area: "Itapua",
    distance_km: 5.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/sabrinabragafisio/",
    phone: "+55 27 99825-1293",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/; https://localtreino.com/estudios-de-pilates/vila-velha/itapua/",
    why_prospect: "Instagram listado; sem site proprio encontrado.",
    confidence: "High",
    notes: "Boa candidata para demo simples focada em pilates/fisioterapia.",
  },
  {
    score: "Hot",
    business: "Merinha Braga Studio Pilates",
    category: "Pilates",
    area: "Praia da Costa",
    distance_km: 2.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/merinhabraga/",
    phone: "+55 27 99746-0066",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/",
    why_prospect: "Instagram e telefone, sem dominio proprio encontrado.",
    confidence: "High",
    notes: "Perfil local com oportunidade de site one-page.",
  },
  {
    score: "Hot",
    business: "FisioMovi Pilates e Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Praia de Itaparica",
    distance_km: 7.0,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 99662-2323",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/",
    why_prospect: "Telefone publico; nenhum site proprio listado.",
    confidence: "Medium",
    notes: "Validar rede social antes de personalizar demo.",
  },
  {
    score: "Hot",
    business: "My Space Pilates e Fisioterapia",
    category: "Fisioterapia e Pilates",
    area: "Itapua",
    distance_km: 4.8,
    website_status: "No site found",
    website_url: "Not found",
    social_urls: "Not found",
    phone: "+55 27 98897-0058",
    source_urls: "https://localtreino.com/estudios-de-pilates/vila-velha/; https://localtreino.com/estudios-de-pilates/vila-velha/itapua/",
    why_prospect: "Telefone publico e ausencia de dominio proprio listado.",
    confidence: "Medium",
    notes: "Candidato bom para abordagem com demo enxuta.",
  },
  {
    score: "Hot",
    business: "Odontomax Clinica Odontologica",
    category: "Odontologia",
    area: "Novo Mexico / Vila Velha",
    distance_km: 6.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/odontomaxvv/",
    phone: "+55 27 99811-4067",
    source_urls: "https://www.instagram.com/odontomaxvv/; https://www.instagram.com/p/CX1o_P5FafQ/",
    why_prospect: "Clinica odontologica ativa com WhatsApp e sem site proprio encontrado.",
    confidence: "High",
    notes: "Busca exata retornou Instagram/posts e nao dominio proprio.",
  },
  {
    score: "Warm",
    business: "Odonto DEF",
    category: "Odontologia",
    area: "Santa Ines",
    distance_km: 4.5,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/odontodefvv/",
    phone: "WhatsApp no perfil; numero nao visivel na busca",
    source_urls: "https://www.instagram.com/odontodefvv/; https://www.instagram.com/reel/DXZU2dAjQAN/",
    why_prospect: "Depende do Instagram/WhatsApp em bio; sem site proprio encontrado.",
    confidence: "Medium",
    notes: "Priorizar depois de confirmar numero no perfil.",
  },
  {
    score: "Warm",
    business: "GaHe Clinica Odontologica",
    category: "Odontologia",
    area: "Santa Monica",
    distance_km: 6.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/gahe.clinica/",
    phone: "WhatsApp no perfil; numero nao visivel na busca",
    source_urls: "https://www.instagram.com/gahe.clinica/; https://www.instagram.com/p/DTJGgh2FL4T/",
    why_prospect: "Clinica nova/ativa, sem site proprio encontrado.",
    confidence: "Medium",
    notes: "Boa candidata para demo visual, mas confirmar telefone antes.",
  },
  {
    score: "Hot",
    business: "Dentista do Trabalhador",
    category: "Odontologia",
    area: "Gloria",
    distance_km: 3.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/dentista.do.trabalhador/",
    phone: "+55 27 99947-3831",
    source_urls: "https://www.instagram.com/dentista.do.trabalhador/; https://www.facebook.com/dentistadotrabalhador.es/",
    why_prospect: "Telefone/WhatsApp publico e sem site proprio encontrado.",
    confidence: "High",
    notes: "Facebook/Instagram confirmam unidade em Vila Velha.",
  },
  {
    score: "Warm",
    business: "Laboratorio Popular",
    category: "Laboratorio de analises clinicas",
    area: "Gloria / Praia da Costa",
    distance_km: 3.0,
    website_status: "Social only",
    website_url: "Not found",
    social_urls: "https://www.instagram.com/laboratoriopopularvv/; https://www.facebook.com/labpopular.org/",
    phone: "+55 27 99984-7614; +55 27 3013-8000",
    source_urls: "https://www.instagram.com/laboratoriopopularvv/; https://www.facebook.com/labpopular.org/; https://renascervitoria.com.br/convenios/",
    why_prospect: "Aparece com Instagram/Facebook e telefone; site proprio nao foi encontrado/indexado.",
    confidence: "Medium",
    notes: "Ha dominio citado como email/Facebook, mas busca direta nao encontrou site indexado; validar antes da demo.",
  },
];

const headers = [
  "score",
  "business",
  "category",
  "area",
  "distance_km",
  "website_status",
  "website_url",
  "social_urls",
  "phone",
  "source_urls",
  "why_prospect",
  "confidence",
  "notes",
];

const rows = leads.map((lead) => headers.map((header) => lead[header]));

const workbook = Workbook.create();
const leadSheet = workbook.worksheets.add("Leads");
const summarySheet = workbook.worksheets.add("Resumo");
const sourceSheet = workbook.worksheets.add("Fontes");

leadSheet.getRange("A1:M1").values = [headers];
leadSheet.getRange(`A2:M${rows.length + 1}`).values = rows;

summarySheet.getRange("A1:H1").merge();
summarySheet.getRange("A1:H1").values = [["Prospeccao de pequenos negocios de saude - Vila Velha/ES"]];
summarySheet.getRange("A3:B9").values = [
  ["Localizacao base", "Vila Velha, Espirito Santo"],
  ["Raio", "15 km"],
  ["Categorias", "Fisioterapeutas, dentistas, pequenos laboratorios e negocios locais de saude"],
  ["Objetivo", "Leads sem site proprio encontrado, social only ou link de bio"],
  ["Data da pesquisa", "2026-06-09"],
  ["Total de leads", ""],
  ["Observacao", "Distancias aproximadas a partir da regiao central de Vila Velha."],
];
summarySheet.getRange("B8").formulas = [["=COUNTA(Leads!B2:B1000)"]];

summarySheet.getRange("D3:E8").values = [
  ["Metrica", "Valor"],
  ["Hot", ""],
  ["Warm", ""],
  ["High confidence", ""],
  ["Medium confidence", ""],
  ["Sem site proprio claro", ""],
];
summarySheet.getRange("E4:E8").formulas = [
  ['=COUNTIF(Leads!A:A,"Hot")'],
  ['=COUNTIF(Leads!A:A,"Warm")'],
  ['=COUNTIF(Leads!L:L,"High")'],
  ['=COUNTIF(Leads!L:L,"Medium")'],
  ['=COUNTIFS(Leads!F2:F31,"<>Has site")'],
];

summarySheet.getRange("A12:B17").values = [
  ["Leads por status do site", "Qtd."],
  ["Social only", ""],
  ["No site found", ""],
  ["Weak site", ""],
  ["Has site", ""],
  ["Total", ""],
];
summarySheet.getRange("B13:B17").formulas = [
  ['=COUNTIF(Leads!F:F,A13)'],
  ['=COUNTIF(Leads!F:F,A14)'],
  ['=COUNTIF(Leads!F:F,A15)'],
  ['=COUNTIF(Leads!F:F,A16)'],
  ["=SUM(B13:B16)"],
];

summarySheet.getRange("D12:E19").values = [
  ["Leads por macro categoria", "Qtd."],
  ["Fisioterapia/Pilates", ""],
  ["Odontologia", ""],
  ["Laboratorio", ""],
  ["Centro de Saude/Terapias", ""],
  ["Outros", ""],
  ["Total", ""],
  ["", ""],
];
summarySheet.getRange("E13:E18").formulas = [
  ['=COUNTIF(Leads!C2:C31,"Fisioterapia")+COUNTIF(Leads!C2:C31,"Fisioterapia e Pilates")+COUNTIF(Leads!C2:C31,"Fisioterapia e Terapia Ocupacional")+COUNTIF(Leads!C2:C31,"Fisioterapia, Pilates e Massoterapia")+COUNTIF(Leads!C2:C31,"Fisioterapia especializada")+COUNTIF(Leads!C2:C31,"Fisioterapia, Pilates e Massagem")+COUNTIF(Leads!C2:C31,"Pilates")+COUNTIF(Leads!C2:C31,"Pilates e Musculacao Terapeutica")'],
  ['=COUNTIF(Leads!C2:C31,"Odontologia")'],
  ['=COUNTIF(Leads!C2:C31,"Laboratorio de analises clinicas")'],
  ['=COUNTIF(Leads!C2:C31,"Centro de Saude / Terapias")'],
  ['=COUNTA(Leads!B2:B1000)-SUM(E13:E16)'],
  ["=SUM(E13:E17)"],
];

summarySheet.getRange("A22:D25").values = [
  ["Melhores primeiros contatos", "Categoria", "Telefone", "Motivo pratico"],
  ["Betafisio", "Fisioterapia e Pilates", "+55 27 99741-7152", "WhatsApp claro, servicos bem definidos e sem dominio proprio encontrado."],
  ["Odontomax Clinica Odontologica", "Odontologia", "+55 27 99811-4067", "Clinica odontologica com WhatsApp publico e dependente de Instagram."],
  ["VilaFisio Fisioterapia", "Fisioterapia e Pilates", "+55 27 99205-8920", "Boa presenca social, telefone direto e oportunidade de site local."],
];

sourceSheet.getRange("A1:D1").merge();
sourceSheet.getRange("A1:D1").values = [["Criterios, fontes e observacoes"]];
sourceSheet.getRange("A3:D11").values = [
  ["Campo", "Valor", "Uso", "Observacao"],
  ["Base", "Vila Velha, ES", "Filtro geografico", "Todos os leads ficam em Vila Velha e dentro do raio estimado."],
  ["Raio", "15 km", "Filtro geografico", "Distancia na aba Leads e aproximada."],
  ["Hot", "Sem site proprio claro + telefone/WhatsApp publico", "Priorizacao", "Nao usar Hot quando site proprio foi encontrado."],
  ["Warm", "Sem site proprio claro, mas contato incompleto ou evidencia parcial", "Priorizacao", "Confirmar telefone antes de demo personalizada."],
  ["Social only", "Instagram, Facebook, Linktree, bio.site, mycardbio ou contate.me", "Status do site", "Nao conta como site proprio para esta prospeccao."],
  ["No site found", "Busca exata nao retornou dominio proprio confiavel", "Status do site", "Fazer validacao manual antes do disparo final."],
  ["Fontes usadas", "Instagram, Facebook, LocalTreino, Doctoralia, Apontador, Unimed, diretorios locais", "Auditoria", "URLs linha a linha estao em Leads!J:J."],
  ["Excluidos", "Fisiomed, Laboratorio Flama, Instituto Oral Premium e outros com site proprio", "Qualidade", "Candidatos com site proprio claro nao entraram como leads principais."],
];

const sheets = [leadSheet, summarySheet, sourceSheet];
for (const sheet of sheets) {
  sheet.getRange("A1:Z200").format.font = { name: "Arial", size: 10, color: "#111827" };
}

leadSheet.getRange("A1:M1").format = {
  fill: "#E5F2F0",
  font: { name: "Arial", size: 10, bold: true, color: "#0F172A" },
  borders: { preset: "outside", style: "thin", color: "#94A3B8" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
leadSheet.getRange(`A2:M${leads.length + 1}`).format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
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
leadSheet.getRange(`F2:F${leads.length + 1}`).conditionalFormats.add("containsText", {
  text: "Social only",
  format: { fill: "#E0F2FE", font: { color: "#075985", bold: true } },
});
leadSheet.getRange(`F2:F${leads.length + 1}`).conditionalFormats.add("containsText", {
  text: "No site found",
  format: { fill: "#F1F5F9", font: { color: "#334155", bold: true } },
});
leadSheet.getRange(`L2:L${leads.length + 1}`).conditionalFormats.add("containsText", {
  text: "High",
  format: { fill: "#DBEAFE", font: { color: "#1D4ED8", bold: true } },
});

const leadWidths = [70, 230, 170, 155, 95, 135, 220, 250, 170, 390, 280, 105, 330];
leadWidths.forEach((width, idx) => {
  const col = String.fromCharCode("A".charCodeAt(0) + idx);
  leadSheet.getRange(`${col}1:${col}${leads.length + 1}`).format.columnWidthPx = width;
});
leadSheet.getRange("A1:M1").format.rowHeightPx = 36;
leadSheet.getRange(`A2:M${leads.length + 1}`).format.rowHeightPx = 72;

summarySheet.getRange("A1:H1").format = {
  fill: "#E5F2F0",
  font: { name: "Arial", size: 15, bold: true, color: "#0F172A" },
  borders: { preset: "outside", style: "thin", color: "#94A3B8" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summarySheet.getRange("A3:B9").format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
  verticalAlignment: "top",
  wrapText: true,
};
summarySheet.getRange("A3:A9").format = { fill: "#F8FAFC", font: { bold: true } };
summarySheet.getRange("D3:E8").format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
  horizontalAlignment: "left",
};
summarySheet.getRange("D3:E3").format = { fill: "#F8FAFC", font: { bold: true } };
summarySheet.getRange("A12:B17").format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
};
summarySheet.getRange("D12:E19").format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
};
summarySheet.getRange("A12:B12").format = { fill: "#F8FAFC", font: { bold: true } };
summarySheet.getRange("D12:E12").format = { fill: "#F8FAFC", font: { bold: true } };
summarySheet.getRange("A22:D25").format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
  verticalAlignment: "top",
  wrapText: true,
};
summarySheet.getRange("A22:D22").format = { fill: "#E5F2F0", font: { bold: true } };
summarySheet.getRange("A1:H1").format.rowHeightPx = 42;
summarySheet.getRange("A:A").format.columnWidthPx = 210;
summarySheet.getRange("B:B").format.columnWidthPx = 410;
summarySheet.getRange("C:C").format.columnWidthPx = 22;
summarySheet.getRange("D:D").format.columnWidthPx = 200;
summarySheet.getRange("E:E").format.columnWidthPx = 115;
summarySheet.getRange("F:F").format.columnWidthPx = 22;
summarySheet.getRange("G:G").format.columnWidthPx = 180;
summarySheet.getRange("H:H").format.columnWidthPx = 180;

sourceSheet.getRange("A1:D1").format = {
  fill: "#E5F2F0",
  font: { name: "Arial", size: 15, bold: true, color: "#0F172A" },
  borders: { preset: "outside", style: "thin", color: "#94A3B8" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sourceSheet.getRange("A3:D11").format = {
  borders: { preset: "outside", style: "thin", color: "#E2E8F0" },
  verticalAlignment: "top",
  wrapText: true,
};
sourceSheet.getRange("A3:D3").format = { fill: "#F8FAFC", font: { bold: true } };
sourceSheet.getRange("A:A").format.columnWidthPx = 150;
sourceSheet.getRange("B:B").format.columnWidthPx = 320;
sourceSheet.getRange("C:C").format.columnWidthPx = 180;
sourceSheet.getRange("D:D").format.columnWidthPx = 430;
sourceSheet.getRange("A1:D1").format.rowHeightPx = 42;
sourceSheet.getRange("A4:D11").format.rowHeightPx = 48;

await fs.mkdir(outputDir, { recursive: true });

await workbook.render({ sheetName: "Resumo", range: "A1:E25", scale: 2 });
await workbook.render({ sheetName: "Leads", range: "A1:M12", scale: 1 });
await workbook.render({ sheetName: "Fontes", range: "A1:D11", scale: 2 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({ outputPath, rows: leads.length, sheets: ["Leads", "Resumo", "Fontes"] }, null, 2));
