import fs from "node:fs/promises";
import path from "node:path";

const root = "/Users/luiz_fbm/Documents/programacao/freela";
const demosDir = path.join(root, "demos");
const researchDir = path.join(demosDir, "research");

const leadData = [
  {
    name: "VilaFisio Fisioterapia",
    slug: "vilafisio-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "Itapuã",
    phone: "+55 27 99205-8920",
    status: "Social only",
    social: "https://www.instagram.com/vilafisio_24/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/vilafisio_24/",
    ],
    confidence: "High",
    note: "Instagram listado como principal presença digital. Busca exata não retornou domínio próprio confiável.",
  },
  {
    name: "Clínica Viva Sem Dor",
    slug: "clinica-viva-sem-dor",
    category: "Fisioterapia",
    segment: "physio",
    area: "Centro / Prainha",
    phone: "+55 27 99810-5020",
    status: "Social only",
    social: "https://www.instagram.com/clinicavivasemdor/",
    sources: [
      "https://www.instagram.com/clinicavivasemdor/",
      "https://www.instagram.com/reel/DGmCCt2PMgY/",
    ],
    confidence: "High",
    note: "Post público informa endereço em Vila Velha e WhatsApp.",
  },
  {
    name: "CLIFIT",
    slug: "clifit",
    category: "Fisioterapia e Terapia Ocupacional",
    segment: "physio",
    area: "Centro / Praia da Costa",
    phone: "+55 27 98827-3408",
    status: "Social only",
    social: "https://www.instagram.com/clifitvv/",
    sources: [
      "https://www.instagram.com/clifitvv/",
      "https://www.unimed.coop.br/site/web/vitoria/credenciamento-descredenciamento-extensao-de-prestador-unimed-vitoria/-/asset_publisher/eW4DRtThFmYW/content/extens%C3%A3o-de-servi%C3%A7o-fisioterapia-p%C3%A9lvica-prestador-600004-clifit-cl%C3%ADnica-de-fisioterapia-ltda",
    ],
    confidence: "High",
    note: "Instagram e fonte Unimed confirmam operação e contato em Vila Velha.",
  },
  {
    name: "Betafisio",
    slug: "betafisio",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "Paul",
    phone: "+55 27 99741-7152",
    secondaryPhone: "+55 27 3063-6012",
    status: "Social only",
    social: "https://www.instagram.com/betafisio.es/",
    sources: [
      "https://www.instagram.com/betafisio.es/",
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
    ],
    confidence: "High",
    note: "Busca exata por Betafisio + Vila Velha retornou Instagram e diretórios, não site próprio.",
  },
  {
    name: "Clínica Restaurar Fisioterapia e Pilates",
    slug: "clinica-restaurar-fisioterapia-pilates",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "Terra Vermelha",
    phone: "+55 27 98113-2733",
    status: "Social only",
    website: "https://bio.site/clinicarestaurar",
    social: "https://www.instagram.com/clinicarestaurar_/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/clinicarestaurar_/",
    ],
    confidence: "High",
    note: "Usa bio link, não site próprio. Dentro do raio estimado de 15 km.",
  },
  {
    name: "SR Pilates e Fisioterapia",
    slug: "sr-pilates-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "pilates",
    area: "Cidade da Barra / Riviera da Barra",
    phone: "+55 27 99821-2719",
    status: "Social only",
    social: "https://www.instagram.com/sergiofisio21/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/sergiofisio21/reel/Cqi30DUjHB7/",
    ],
    confidence: "High",
    note: "Instagram aparece como canal principal. Busca exata não exibiu domínio próprio.",
  },
  {
    name: "FisioLife Saúde Integrada",
    slug: "fisiolife-saude-integrada",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "Praia das Gaivotas",
    phone: "+55 27 99873-7295",
    status: "Social only",
    social: "https://www.instagram.com/clin_fisiolife/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/clin_fisiolife/",
    ],
    confidence: "High",
    note: "Perfil ativo e telefone listado. Pesquisa exata não retornou domínio próprio.",
  },
  {
    name: "MoviFisio Clínica de Fisioterapia",
    slug: "movifisio-clinica-fisioterapia",
    category: "Fisioterapia",
    segment: "physio",
    area: "Praia de Itaparica",
    phone: "+55 27 99901-1358",
    status: "No site found",
    social: "Not found",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://casadosdados.com.br/solucao/cnpj/lucia-a-de-oliveira-nascimento-centro-de-estudos-38417347000107",
    ],
    confidence: "Medium",
    note: "Tem telefone e endereço em fonte pública, mas depende de diretórios.",
  },
  {
    name: "EC Fisioterapia",
    slug: "ec-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "Jockey de Itaparica",
    phone: "+55 27 98881-5456",
    status: "No site found",
    social: "https://www.instagram.com/ecpilatesfisioterapia/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/reel/DV9qJzCklFT/",
    ],
    confidence: "Medium",
    note: "Nome também aparece como E C Pilates & Fisioterapia.",
  },
  {
    name: "Fisio para Todos",
    slug: "fisio-para-todos",
    category: "Fisioterapia",
    segment: "physio",
    area: "Glória",
    phone: "+55 27 98159-2656",
    status: "No site found",
    social: "Not found",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/p/DQPsS5-kksK/",
    ],
    confidence: "Medium",
    note: "Telefone listado e sem site próprio visível na busca.",
  },
  {
    name: "Fisioterapeuta Robson Vaillant",
    slug: "fisioterapeuta-robson-vaillant",
    category: "Fisioterapia",
    segment: "physio",
    area: "Centro / Prainha",
    phone: "+55 27 99500-4601",
    status: "No site found",
    social: "Not found",
    sources: ["https://localtreino.com/fisioterapeutas-esportivos/vila-velha/"],
    confidence: "Medium",
    note: "Profissional local com telefone e sem presença própria forte.",
  },
  {
    name: "Hiáskara Macedo Fisioterapia",
    slug: "hiaskara-macedo-fisioterapia",
    category: "Fisioterapia",
    segment: "physio",
    area: "Itapuã",
    phone: "+55 27 99851-4520",
    status: "No site found",
    social: "Not found",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/itapua/",
    ],
    confidence: "Medium",
    note: "Busca exata não retornou domínio oficial.",
  },
  {
    name: "Fisiocorporis",
    slug: "fisiocorporis",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "Itapuã",
    phone: "+55 27 99916-6692",
    status: "Social only",
    website: "https://mycardbio.com/fisiocorporis_saude",
    social: "https://www.instagram.com/fisiocorporis_saude/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/fisiocorporis_saude/",
    ],
    confidence: "High",
    note: "Usa cartão ou bio link em vez de site próprio.",
  },
  {
    name: "Evolução Centro de Saúde",
    slug: "evolucao-centro-de-saude",
    category: "Centro de Saúde / Terapias",
    segment: "health",
    area: "Praia da Costa",
    phone: "+55 27 99244-4185",
    status: "Social only",
    website: "https://linktr.ee/evolucao.cs",
    social: "https://linktr.ee/evolucao.cs",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.doctoralia.com.br/doencas/sindrome-de-burnout/vila-velha",
    ],
    confidence: "High",
    note: "Usa Linktree e Doctoralia. Oportunidade de site próprio.",
  },
  {
    name: "Espaço FisioVida",
    slug: "espaco-fisiovida",
    category: "Fisioterapia e Pilates",
    segment: "physio",
    area: "IBES",
    phone: "+55 27 99846-9349",
    status: "No site found",
    social: "https://www.instagram.com/espaco.fisiovida/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/p/DN6S2vuDyn4/",
    ],
    confidence: "Medium",
    note: "Telefone vem de diretório. Confirmar no contato antes da publicação oficial.",
  },
  {
    name: "FisioterapiaHD",
    slug: "fisioterapiahd",
    category: "Fisioterapia",
    segment: "physio",
    area: "Praia de Itaparica",
    phone: "+55 27 99988-7148",
    status: "Social only",
    social: "https://www.instagram.com/fisioterapia.hd/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/fisioterapia.hd/",
    ],
    confidence: "High",
    note: "Instagram listado como canal. Busca exata não mostrou domínio próprio.",
  },
  {
    name: "VIAFISIO",
    slug: "viafisio",
    category: "Fisioterapia, Pilates e Massoterapia",
    segment: "physio",
    area: "Praia de Itaparica",
    phone: "+55 27 99252-1125",
    status: "Social only",
    social: "https://www.instagram.com/viafisiopilates/",
    sources: [
      "https://localtreino.com/fisioterapeutas-esportivos/vila-velha/",
      "https://www.instagram.com/viafisiopilates/",
    ],
    confidence: "High",
    note: "Contato e Instagram visíveis. Sem site próprio encontrado.",
  },
  {
    name: "Equipe Fisioterapia Especializada",
    slug: "equipe-fisioterapia-especializada",
    category: "Fisioterapia especializada",
    segment: "physio",
    area: "Praia da Costa",
    phone: "+55 27 3329-8339",
    secondaryPhone: "+55 27 3329-3673",
    status: "No site found",
    social: "Not found",
    sources: [
      "https://www.apontador.com.br/local/es/vila_velha/clinicas_de_fisioterapia/XQRMDWYX/equipe_fisioterapia_especializada.html",
      "https://cretovale.coop.br/2021/03/18/ganhadora-do-spa-presente/",
    ],
    confidence: "High",
    note: "Fontes independentes confirmam endereço e telefone em Vila Velha.",
  },
  {
    name: "Center Pilates & Fisioterapia",
    slug: "center-pilates-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "pilates",
    area: "Ataíde",
    phone: "+55 27 3052-1340",
    status: "No site found",
    social: "Not found",
    sources: [
      "https://localtreino.com/estudios-de-pilates/vila-velha/",
      "https://www.instagram.com/centerpilates_fisioterapia/",
    ],
    confidence: "Medium",
    note: "A busca retornou unidades fora de Vila Velha. Validar unidade no contato.",
  },
  {
    name: "Respirar Pilates e Fisioterapia",
    slug: "respirar-pilates-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "pilates",
    area: "Santa Mônica",
    phone: "+55 27 99950-3365",
    status: "No site found",
    social: "Not found",
    sources: ["https://localtreino.com/estudios-de-pilates/vila-velha/"],
    confidence: "Medium",
    note: "Linha extraída de diretório local. Fazer validação final antes da demo oficial.",
  },
  {
    name: "Mover Saúde Pilates e Musculação Terapêutica",
    slug: "mover-saude-pilates-musculacao-terapeutica",
    category: "Pilates e Musculação Terapêutica",
    segment: "pilates",
    area: "Centro",
    phone: "+55 27 99905-1156",
    status: "Social only",
    website: "https://contate.me/ios/moversaude",
    social: "https://www.instagram.com/moversaude_/",
    sources: [
      "https://localtreino.com/estudios-de-pilates/vila-velha/",
      "https://www.instagram.com/reel/DTBbeAdDn0D/",
    ],
    confidence: "High",
    note: "Usa link de contato em vez de site próprio.",
  },
  {
    name: "Studio de Pilates Sabrina Braga",
    slug: "studio-pilates-sabrina-braga",
    category: "Fisioterapia, Pilates e Massagem",
    segment: "pilates",
    area: "Itapuã",
    phone: "+55 27 99825-1293",
    status: "Social only",
    social: "https://www.instagram.com/sabrinabragafisio/",
    sources: [
      "https://localtreino.com/estudios-de-pilates/vila-velha/",
      "https://localtreino.com/estudios-de-pilates/vila-velha/itapua/",
    ],
    confidence: "High",
    note: "Instagram listado. Sem site próprio encontrado.",
  },
  {
    name: "Merinha Braga Studio Pilates",
    slug: "merinha-braga-studio-pilates",
    category: "Pilates",
    segment: "pilates",
    area: "Praia da Costa",
    phone: "+55 27 99746-0066",
    status: "Social only",
    social: "https://www.instagram.com/merinhabraga/",
    sources: ["https://localtreino.com/estudios-de-pilates/vila-velha/"],
    confidence: "High",
    note: "Instagram e telefone. Sem domínio próprio encontrado.",
  },
  {
    name: "FisioMovi Pilates e Fisioterapia",
    slug: "fisiomovi-pilates-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "pilates",
    area: "Praia de Itaparica",
    phone: "+55 27 99662-2323",
    status: "No site found",
    social: "Not found",
    sources: ["https://localtreino.com/estudios-de-pilates/vila-velha/"],
    confidence: "Medium",
    note: "Telefone público. Nenhum site próprio listado.",
  },
  {
    name: "My Space Pilates e Fisioterapia",
    slug: "my-space-pilates-fisioterapia",
    category: "Fisioterapia e Pilates",
    segment: "pilates",
    area: "Itapuã",
    phone: "+55 27 98897-0058",
    status: "No site found",
    social: "Not found",
    sources: [
      "https://localtreino.com/estudios-de-pilates/vila-velha/",
      "https://localtreino.com/estudios-de-pilates/vila-velha/itapua/",
    ],
    confidence: "Medium",
    note: "Telefone público e ausência de domínio próprio listado.",
  },
  {
    name: "Odontomax Clínica Odontológica",
    slug: "odontomax-clinica-odontologica",
    category: "Odontologia",
    segment: "dental",
    area: "Novo México / Vila Velha",
    phone: "+55 27 99811-4067",
    status: "Social only",
    social: "https://www.instagram.com/odontomaxvv/",
    sources: [
      "https://www.instagram.com/odontomaxvv/",
      "https://www.instagram.com/p/CX1o_P5FafQ/",
    ],
    confidence: "High",
    note: "Clínica odontológica ativa com WhatsApp e sem site próprio encontrado.",
  },
  {
    name: "Dentista do Trabalhador",
    slug: "dentista-do-trabalhador",
    category: "Odontologia",
    segment: "dental",
    area: "Glória",
    phone: "+55 27 99947-3831",
    status: "Social only",
    social: "https://www.instagram.com/dentista.do.trabalhador/",
    sources: [
      "https://www.instagram.com/dentista.do.trabalhador/",
      "https://www.facebook.com/dentistadotrabalhador.es/",
    ],
    confidence: "High",
    note: "Facebook e Instagram confirmam unidade em Vila Velha.",
  },
];

const segmentConfig = {
  physio: {
    theme: "theme-physio",
    sourceImage: path.join(demosDir, "fisiohealth-clinica-fisioterapia-pilates/assets/hero-fisiohealth.jpg"),
    imageAlt: "Sala neutra de fisioterapia e pilates sem pessoas",
    eyebrow: "Fisioterapia em Vila Velha",
    h1: (lead) => `${lead.name} em uma página simples, clara e pronta para contato.`,
    intro: (lead) => `Conceito visual para reunir ${lead.category.toLowerCase()}, bairro, canais públicos e próximos passos em uma presença própria.`,
    sectionTitle: "Informação organizada para quem pesquisa pelo celular.",
    serviceCards: [
      ["Fisioterapia", "Um bloco direto para explicar o serviço principal sem prometer resultado clínico."],
      ["Pilates e movimento", "Espaço para apresentar rotina, acompanhamento e horários depois da confirmação do lead."],
      ["Contato público", "Telefone e bairro aparecem sem depender de diretórios ou de bio do Instagram."],
      ["Dados a confirmar", "Endereço completo, horários e convênios entram somente depois da validação do negócio."],
    ],
    flow: [
      "A pessoa entende rapidamente que encontrou o negócio certo em Vila Velha.",
      "Confere área, telefone e serviços principais em uma página própria.",
      "Chama pelo telefone público para confirmar avaliação, agenda e detalhes.",
    ],
    proofLabel: "Serviços e contato",
    color: "#0f766e",
    dark: "#123f48",
    accent: "#2563eb",
  },
  pilates: {
    theme: "theme-pilates",
    sourceImage: path.join(demosDir, "espaco-vitta-saude/assets/hero-vitta.jpg"),
    imageAlt: "Estúdio de pilates neutro, claro e sem pessoas",
    eyebrow: "Pilates e movimento em Vila Velha",
    h1: (lead) => `${lead.name} com uma página local focada em agendamento.`,
    intro: (lead) => `Uma proposta enxuta para apresentar ${lead.category.toLowerCase()}, localização aproximada e contato sem depender só de links de bio.`,
    sectionTitle: "Um site simples para transformar interesse em conversa.",
    serviceCards: [
      ["Pilates", "A página mostra o serviço logo no início para quem já procura aulas ou acompanhamento."],
      ["Fisioterapia", "Quando a fisioterapia aparece na fonte pública, ela entra de forma segura e sem promessa clínica."],
      ["Bairro e telefone", "O visitante vê onde fica e qual canal usar antes de abrir outra busca."],
      ["Ajuste final", "Fotos, horários, modalidades e planos entram somente com confirmação do negócio."],
    ],
    flow: [
      "A pessoa entende o foco do estúdio sem abrir várias abas.",
      "Vê o telefone em destaque e decide se vale chamar.",
      "O atendimento confirma turma, avaliação, horário e endereço completo.",
    ],
    proofLabel: "Pilates e contato",
    color: "#b45309",
    dark: "#33251b",
    accent: "#6d28d9",
  },
  dental: {
    theme: "theme-dental",
    sourceImage: path.join(demosDir, "viva-odontologia/assets/hero-viva-odontologia.jpg"),
    imageAlt: "Sala odontológica limpa e neutra sem pessoas",
    eyebrow: "Odontologia em Vila Velha",
    h1: (lead) => `${lead.name} com contato claro antes da primeira ligação.`,
    intro: (lead) => `Conceito visual para organizar presença local, telefone e informações públicas sem inventar procedimentos não confirmados.`,
    sectionTitle: "Odontologia apresentada com cuidado e sem exagero.",
    serviceCards: [
      ["Atendimento odontológico", "Descrição ampla e segura até a própria clínica confirmar os tratamentos."],
      ["Contato direto", "Botão de telefone com o canal público encontrado na pesquisa."],
      ["Localização", "Bairro em destaque para pacientes que procuram atendimento perto de casa ou do trabalho."],
      ["Página própria", "Uma presença simples reduz confusão entre redes sociais, diretórios e perfis parecidos."],
    ],
    flow: [
      "A pessoa confirma que está vendo uma clínica de Vila Velha.",
      "Encontra telefone e área de atendimento sem depender de uma listagem externa.",
      "A clínica confirma horários, endereço completo e procedimentos corretos.",
    ],
    proofLabel: "Odontologia e contato",
    color: "#0e7490",
    dark: "#123047",
    accent: "#0f766e",
  },
  health: {
    theme: "theme-health",
    sourceImage: path.join(demosDir, "essencesaude/assets/hero-essence.jpg"),
    imageAlt: "Ambiente neutro de saúde e terapias sem pessoas",
    eyebrow: "Saúde e terapias em Vila Velha",
    h1: (lead) => `${lead.name} com uma presença própria para organizar contato e serviços.`,
    intro: (lead) => `Conceito visual para transformar links soltos em uma página com serviços, bairro e chamada para contato.`,
    sectionTitle: "Clareza para quem quer entender antes de chamar.",
    serviceCards: [
      ["Serviços públicos", "A página reúne apenas o que apareceu em fontes públicas ou diretórios."],
      ["Contato visível", "Telefone e caminho de contato ficam no topo e no fim da página."],
      ["Confirmação", "A equipe pode ajustar serviços, horários e endereço antes de qualquer publicação."],
      ["Presença própria", "O site reduz a dependência de Linktree, Doctoralia ou diretórios."],
    ],
    flow: [
      "A pessoa entende o tipo de atendimento em uma leitura curta.",
      "Confere área e telefone sem abrir outra plataforma.",
      "O negócio confirma serviços e agenda pelo canal oficial.",
    ],
    proofLabel: "Saúde e contato",
    color: "#365314",
    dark: "#26321f",
    accent: "#b45309",
  },
};

function telHref(phone) {
  return `tel:${phone.replace(/\D/g, "")}`;
}

function whatsappHref(phone) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

function prettyPhone(lead) {
  return lead.secondaryPhone ? `${lead.phone} / ${lead.secondaryPhone}` : lead.phone;
}

function safeLink(url) {
  return url && url !== "Not found";
}

function pageHtml(lead) {
  const config = segmentConfig[lead.segment];
  const socialText = safeLink(lead.social)
    ? `<a href="${lead.social}" target="_blank" rel="noopener">Canal público encontrado</a>`
    : "Canal social não confirmado";
  const siteText = safeLink(lead.website)
    ? `<a href="${lead.website}" target="_blank" rel="noopener">Link atual encontrado</a>`
    : "Site próprio não encontrado";
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="Conceito visual nao oficial para uma pagina local de ${lead.category.toLowerCase()} em Vila Velha.">
  <meta name="theme-color" content="#f7fbfa">
  <title>${lead.name} | Conceito visual</title>
  <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body class="${config.theme}">
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

  <header class="site-header">
    <nav class="nav-shell" aria-label="Navegação principal">
      <a class="brand text-brand" href="#inicio" aria-label="Voltar ao início">
        <span>${lead.name}</span>
      </a>

      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu" data-menu-toggle>
        <span class="sr-only">Abrir menu</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>

      <div class="nav-links" id="menu" data-menu>
        <a href="#servicos">Serviços</a>
        <a href="#como-marcar">Como marcar</a>
        <a href="#contato">Contato</a>
      </div>

      <a class="nav-cta" href="${telHref(lead.phone)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.34 1.9.63 2.8a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.28-1.28a2 2 0 0 1 2.11-.45c.9.29 1.84.5 2.8.63A2 2 0 0 1 22 16.92Z"/></svg>
        Ligar
      </a>
    </nav>
  </header>

  <main id="conteudo">
    <section class="hero" id="inicio">
      <div class="hero-inner">
        <div class="hero-copy reveal">
          <p class="eyebrow">${config.eyebrow}</p>
          <h1>${config.h1(lead)}</h1>
          <p>${config.intro(lead)}</p>
          <div class="hero-actions">
            <a class="button primary" href="${telHref(lead.phone)}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.34 1.9.63 2.8a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6.09 6.09l1.28-1.28a2 2 0 0 1 2.11-.45c.9.29 1.84.5 2.8.63A2 2 0 0 1 22 16.92Z"/></svg>
              Ligar para contato
            </a>
            <a class="button secondary" href="#servicos">Ver informações</a>
          </div>

          <dl class="quick-facts" aria-label="Informações rápidas">
            <div>
              <dt>${lead.area}</dt>
              <dd>Vila Velha/ES</dd>
            </div>
            <div>
              <dt>${lead.category}</dt>
              <dd>segmento público</dd>
            </div>
            <div>
              <dt>Contato público</dt>
              <dd>${lead.phone}</dd>
            </div>
          </dl>
        </div>

        <div class="hero-media reveal">
          <img src="assets/hero.jpg" alt="${config.imageAlt}">
        </div>
      </div>
    </section>

    <section class="section compact-intro">
      <div class="container narrow">
        <p>Quem procura pelo celular precisa entender rápido o que o negócio atende, onde fica e como chamar. Este demo mostra esse caminho sem copiar fotos privadas nem prometer resultado clínico.</p>
      </div>
    </section>

    <section class="section" id="servicos">
      <div class="container">
        <div class="section-heading reveal">
          <p class="eyebrow">Informações públicas</p>
          <h2>${config.sectionTitle}</h2>
          <p>Os blocos abaixo usam dados públicos e pontos seguros. Antes de publicar como site oficial, tudo deve ser confirmado pelo ${lead.name}.</p>
        </div>

        <div class="service-grid">
          ${config.serviceCards.map(([title, text]) => `<article class="service-card reveal">
            <span class="icon-dot" aria-hidden="true"></span>
            <h3>${title}</h3>
            <p>${text}</p>
          </article>`).join("\n          ")}
        </div>
      </div>
    </section>

    <section class="section proof-section">
      <div class="container proof-grid">
        <div class="proof-copy reveal">
          <p class="eyebrow">${config.proofLabel}</p>
          <h2>O que já dá para mostrar com segurança.</h2>
          <p>${lead.note}</p>
        </div>
        <div class="proof-list reveal" aria-label="Resumo dos dados públicos">
          <p><strong>Status do site:</strong> ${lead.status}</p>
          <p><strong>Site atual:</strong> ${siteText}</p>
          <p><strong>Social:</strong> ${socialText}</p>
          <p><strong>Confiança da pesquisa:</strong> ${lead.confidence}</p>
        </div>
      </div>
    </section>

    <section class="section flow-section" id="como-marcar">
      <div class="container split">
        <div class="reveal">
          <p class="eyebrow">Como marcar</p>
          <h2>Uma rota curta entre a busca e o atendimento.</h2>
        </div>
        <ol class="flow-list reveal">
          ${config.flow.map((item, index) => `<li><span>${index + 1}</span><p>${item}</p></li>`).join("\n          ")}
        </ol>
      </div>
    </section>

    <section class="section contact-section" id="contato">
      <div class="container contact-grid">
        <div class="reveal">
          <p class="eyebrow">Contato público</p>
          <h2>Telefone, área e próximos passos no mesmo lugar.</h2>
          <p>O endereço completo precisa ser confirmado pelo negócio antes da publicação oficial. Por enquanto, a página mostra a área encontrada em fonte pública.</p>
        </div>
        <div class="contact-box reveal">
          <span>${lead.name}</span>
          <a class="contact-phone" href="${telHref(lead.phone)}">${prettyPhone(lead)}</a>
          <p>${lead.area}, Vila Velha/ES</p>
          <p>Conceito visual não oficial.</p>
          <a class="button primary full" href="${telHref(lead.phone)}">Ligar agora</a>
          <a class="text-link" href="${whatsappHref(lead.phone)}" target="_blank" rel="noopener">Abrir WhatsApp</a>
        </div>
      </div>
    </section>

    <section class="section faq">
      <div class="container">
        <div class="section-heading reveal">
          <p class="eyebrow">Transparência</p>
          <h2>O que esta página é e o que ela não é.</h2>
        </div>
        <div class="faq-grid">
          <details class="reveal">
            <summary>Esta página é oficial?</summary>
            <p>Não. É um conceito visual criado para demonstrar como uma página própria poderia organizar informações públicas.</p>
          </details>
          <details class="reveal">
            <summary>Os textos precisam de revisão?</summary>
            <p>Sim. Serviços, horários, endereço completo, convênios e fotos devem ser revisados pelo negócio antes de publicar.</p>
          </details>
          <details class="reveal">
            <summary>Foram usadas fotos do estabelecimento?</summary>
            <p>Não. A imagem é neutra e não mostra pacientes, profissionais ou ambiente real do lead.</p>
          </details>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <p>Conceito visual não oficial criado por Luiz FBM com informações públicas. Este site não representa ${lead.name}.</p>
  </footer>

  <script src="script.js"></script>
</body>
</html>
`;
}

function stylesCss(lead) {
  const config = segmentConfig[lead.segment];
  return `body.${config.theme} {
  --bg: #f7fbfa;
  --page-end: #eaf4f2;
  --surface: #ffffff;
  --soft: color-mix(in srgb, ${config.color} 12%, #ffffff 88%);
  --ink: ${config.dark};
  --muted: color-mix(in srgb, ${config.dark} 68%, #ffffff 32%);
  --primary: ${config.color};
  --primary-dark: color-mix(in srgb, ${config.color} 70%, #111827 30%);
  --accent: ${config.accent};
  --line: color-mix(in srgb, ${config.color} 22%, transparent 78%);
  --shadow: 0 24px 80px color-mix(in srgb, ${config.dark} 14%, transparent 86%);
}

* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: "Noto Sans", Arial, sans-serif;
  color: var(--ink);
  background: linear-gradient(180deg, var(--bg) 0%, var(--page-end) 100%);
  line-height: 1.6;
}

body.menu-open {
  overflow: hidden;
}

a {
  color: inherit;
}

img {
  display: block;
  max-width: 100%;
}

svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2;
}

.skip-link {
  position: absolute;
  top: -80px;
  left: 16px;
  z-index: 30;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--ink);
  color: #fff;
  transition: top 0.2s ease;
}

.skip-link:focus {
  top: 16px;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  padding: 12px clamp(16px, 4vw, 42px);
  background: color-mix(in srgb, var(--bg) 88%, #ffffff 12%);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(16px);
}

.nav-shell {
  max-width: 1160px;
  min-height: 62px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 22px;
}

.brand {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  font-family: "Figtree", Arial, sans-serif;
  font-size: clamp(1rem, 2.1vw, 1.2rem);
  font-weight: 800;
  line-height: 1.05;
  text-decoration: none;
  color: var(--primary-dark);
}

.brand span {
  max-width: 310px;
  overflow-wrap: anywhere;
}

.nav-links {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 24px;
  color: var(--muted);
  font-size: 0.94rem;
  font-weight: 700;
}

.nav-links a {
  text-decoration: none;
}

.nav-links a:hover {
  color: var(--primary-dark);
}

.nav-cta,
.button {
  min-height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0 18px;
  font-weight: 800;
  text-decoration: none;
  white-space: nowrap;
}

.nav-cta,
.button.primary {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 12px 32px color-mix(in srgb, var(--primary) 22%, transparent 78%);
}

.button.secondary {
  background: #fff;
  color: var(--primary-dark);
  border-color: var(--line);
}

.button.full {
  width: 100%;
}

.text-link {
  display: inline-flex;
  justify-content: center;
  margin-top: 10px;
  color: var(--primary-dark);
  font-weight: 800;
}

.menu-toggle {
  display: none;
  width: 46px;
  height: 46px;
  margin-left: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
  color: var(--ink);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.hero {
  padding: clamp(42px, 7vw, 86px) clamp(16px, 4vw, 42px) clamp(36px, 6vw, 72px);
}

.hero-inner {
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.03fr) minmax(320px, 0.97fr);
  gap: clamp(28px, 5vw, 58px);
  align-items: center;
}

.hero-copy h1,
.section h2 {
  margin: 0;
  font-family: "Figtree", Arial, sans-serif;
  line-height: 1.02;
  letter-spacing: 0;
}

.hero-copy h1 {
  max-width: 760px;
  font-size: clamp(2.35rem, 5vw, 4.7rem);
}

.hero-copy p {
  max-width: 620px;
  margin: 20px 0 0;
  color: var(--muted);
  font-size: 1.06rem;
}

.eyebrow {
  margin: 0 0 14px;
  color: var(--primary);
  font-family: "Figtree", Arial, sans-serif;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.quick-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 30px 0 0;
}

.quick-facts div,
.service-card,
.contact-box,
.proof-list,
.faq details {
  background: color-mix(in srgb, var(--surface) 90%, var(--soft) 10%);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 12px 34px color-mix(in srgb, var(--ink) 7%, transparent 93%);
}

.quick-facts div {
  min-height: 94px;
  padding: 16px;
}

.quick-facts dt {
  font-weight: 800;
}

.quick-facts dd {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
}

.hero-media {
  position: relative;
}

.hero-media img {
  width: 100%;
  aspect-ratio: 1.18 / 1;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--line);
  box-shadow: var(--shadow);
}

.section {
  padding: clamp(46px, 7vw, 86px) clamp(16px, 4vw, 42px);
}

.container {
  max-width: 1160px;
  margin: 0 auto;
}

.container.narrow {
  max-width: 860px;
}

.compact-intro {
  padding-top: 10px;
  padding-bottom: 20px;
}

.compact-intro p {
  margin: 0;
  color: var(--primary-dark);
  font-family: "Figtree", Arial, sans-serif;
  font-size: clamp(1.2rem, 2vw, 1.55rem);
  font-weight: 700;
  line-height: 1.35;
}

.section-heading {
  max-width: 720px;
  margin-bottom: 28px;
}

.section h2 {
  font-size: clamp(2rem, 4vw, 3.35rem);
}

.section-heading p,
.contact-grid p,
.proof-copy p,
.faq p {
  color: var(--muted);
}

.service-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.service-card {
  min-height: 224px;
  padding: 22px;
}

.service-card h3 {
  margin: 18px 0 10px;
  font-family: "Figtree", Arial, sans-serif;
  font-size: 1.15rem;
}

.service-card p {
  margin: 0;
  color: var(--muted);
}

.icon-dot {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--soft);
}

.icon-dot::after {
  content: "";
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 14px 0 0 var(--accent);
}

.proof-section,
.flow-section {
  background: color-mix(in srgb, var(--soft) 44%, transparent 56%);
}

.proof-grid,
.contact-grid,
.split {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(320px, 1.05fr);
  gap: clamp(24px, 5vw, 54px);
  align-items: start;
}

.proof-list {
  padding: 24px;
}

.proof-list p {
  margin: 0;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.proof-list p:last-child {
  border-bottom: 0;
}

.flow-list {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.flow-list li {
  display: grid;
  grid-template-columns: 42px 1fr;
  gap: 16px;
  align-items: start;
  padding: 18px;
  border-top: 1px solid var(--line);
}

.flow-list span {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-weight: 800;
}

.flow-list p {
  margin: 0;
  color: var(--muted);
}

.contact-box {
  padding: 26px;
}

.contact-box span {
  display: block;
  font-weight: 800;
}

.contact-phone {
  display: inline-block;
  margin: 8px 0 12px;
  color: var(--primary-dark);
  font-family: "Figtree", Arial, sans-serif;
  font-size: clamp(1.45rem, 3vw, 2.1rem);
  font-weight: 800;
  text-decoration: none;
}

.faq-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.faq details {
  padding: 18px;
}

.faq summary {
  cursor: pointer;
  font-family: "Figtree", Arial, sans-serif;
  font-weight: 800;
}

.site-footer {
  padding: 28px clamp(16px, 4vw, 42px);
  border-top: 1px solid var(--line);
  color: var(--muted);
  text-align: center;
}

.site-footer p {
  max-width: 880px;
  margin: 0 auto;
  font-size: 0.9rem;
}

.reveal {
  opacity: 0;
  transform: translateY(12px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}

.reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

@media (max-width: 940px) {
  .nav-links,
  .nav-cta {
    display: none;
  }

  .menu-toggle {
    display: inline-grid;
    place-items: center;
  }

  .nav-links.is-open {
    position: fixed;
    inset: 87px 16px auto 16px;
    display: grid;
    gap: 0;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    box-shadow: var(--shadow);
  }

  .nav-links.is-open a {
    padding: 14px;
  }

  .hero-inner,
  .proof-grid,
  .contact-grid,
  .split {
    grid-template-columns: 1fr;
  }

  .service-grid,
  .faq-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .site-header {
    padding-inline: 14px;
  }

  .nav-shell {
    gap: 12px;
  }

  .brand span {
    max-width: min(58vw, 260px);
  }

  .hero {
    padding-top: 34px;
  }

  .hero-copy h1 {
    font-size: clamp(2.15rem, 12vw, 3.05rem);
  }

  .hero-actions {
    display: grid;
  }

  .quick-facts,
  .service-grid,
  .faq-grid {
    grid-template-columns: 1fr;
  }

  .service-card {
    min-height: auto;
  }
}
`;
}

const scriptJs = `const menuToggle = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("[data-menu]");

if (menuToggle && menu) {
  menuToggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("is-open");
    document.body.classList.toggle("menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  menu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      menu.classList.remove("is-open");
      document.body.classList.remove("menu-open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
`;

function whatsappCopy(lead) {
  const current = lead.status === "Social only"
    ? "vi que o contato aparece mais por rede social ou link de bio do que por uma página própria"
    : "não encontrei uma página própria simples com as informações principais";
  return `# Mensagem para WhatsApp

Oi, pessoal da ${lead.name}. Tudo bem?

Sou Luiz, aqui da Grande Vitória. Encontrei vocês em fontes públicas enquanto pesquisava negócios de saúde em Vila Velha e ${current}.

Montei um conceito visual não oficial de como essa página poderia ficar:

{{DEMO_URL}}

Usei apenas informações públicas. Não usei fotos privadas, fotos de pacientes, imagens do perfil, depoimentos ou promessa de resultado. A ideia é mostrar um caminho mais claro para quem procura vocês pelo celular.

Se fizer sentido, eu ajusto com os dados corretos, logo oficial, fotos aprovadas e publico em um domínio próprio. Se preferirem que eu remova, sem problema.
`;
}

function researchNote(lead) {
  const sources = lead.sources.map((source) => `  - ${source}`).join("\n");
  return `# ${lead.name} research

## Public facts used

- Name: ${lead.name}
- Segment: ${lead.category}
- City: Vila Velha/ES
- Area: ${lead.area}
- Public phone: ${prettyPhone(lead)}
- Website status: ${lead.status}
- Social or current link: ${lead.social || lead.website || "Not found"}
- Confidence: ${lead.confidence}
- Public links:
${sources}

## Source notes

- ${lead.note}
- The demo uses only public information and does not treat directory text as confirmed official copy.
- Official logo was not provided and was not recreated.

## Safe inferences

- The demo can show the segment, area, public phone and a direct contact path.
- The copy can explain that services, address, schedule and photos need confirmation before official publication.

## Do not use

- Patient photos.
- Before and after images.
- Private Instagram assets.
- Testimonials, ratings or review counts.
- Promises of treatment result, recovery, pain relief or clinical outcome.
- A generated or recreated logo.

## Site direction

- Local, professional and direct.
- Header with the business name as text, not a fake logo.
- Neutral segment photo, no real people or customer environment.
- Footer clearly states that this is a non-official visual concept.
`;
}

function readmeBlock() {
  return leadData.map((lead) => `- http://localhost:4173/demos/${lead.slug}/`).join("\n");
}

async function copyFileSafe(src, dest) {
  await fs.copyFile(src, dest);
}

await fs.mkdir(researchDir, { recursive: true });

for (const lead of leadData) {
  const dir = path.join(demosDir, lead.slug);
  const assetsDir = path.join(dir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), pageHtml(lead), "utf8");
  await fs.writeFile(path.join(dir, "styles.css"), stylesCss(lead), "utf8");
  await fs.writeFile(path.join(dir, "script.js"), scriptJs, "utf8");
  await fs.writeFile(path.join(dir, "copy-whatsapp.md"), whatsappCopy(lead), "utf8");
  await fs.writeFile(path.join(researchDir, `${lead.slug}.md`), researchNote(lead), "utf8");
  await copyFileSafe(segmentConfig[lead.segment].sourceImage, path.join(assetsDir, "hero.jpg"));
}

const readmePath = path.join(demosDir, "README.md");
let readme = await fs.readFile(readmePath, "utf8");
const start = "<!-- vila-velha-hot-demos:start -->";
const end = "<!-- vila-velha-hot-demos:end -->";
const block = `${start}\n\n## Demos Vila Velha, saúde, leads Hot\n\n${readmeBlock()}\n\n${end}`;
if (readme.includes(start) && readme.includes(end)) {
  readme = readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block);
} else {
  readme = `${readme.trim()}\n\n${block}\n`;
}
await fs.writeFile(readmePath, readme, "utf8");

console.log(JSON.stringify({ generated: leadData.length, slugs: leadData.map((lead) => lead.slug) }, null, 2));
