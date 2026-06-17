const demos = [
  {
    name: "Dilma Santana Podóloga",
    slug: "dilma-santana-podologa",
    segment: "Podologia",
    area: "Jardim Camburi, Vitória/ES",
    group: "Hot Vitória",
    tags: ["hot", "podologia", "vitoria", "jardim camburi"],
  },
  {
    name: "VilaFisio Fisioterapia",
    slug: "vilafisio-fisioterapia",
    segment: "Fisioterapia",
    area: "Itapuã, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "pilates", "vila velha", "itapua"],
  },
  {
    name: "Clínica Viva Sem Dor",
    slug: "clinica-viva-sem-dor",
    segment: "Fisioterapia",
    area: "Centro / Prainha, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "centro", "prainha"],
  },
  {
    name: "CLIFIT",
    slug: "clifit",
    segment: "Fisioterapia",
    area: "Centro / Praia da Costa, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "terapia ocupacional", "vila velha"],
  },
  {
    name: "Betafisio",
    slug: "betafisio",
    segment: "Fisioterapia",
    area: "Paul, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "pilates", "vila velha", "paul"],
  },
  {
    name: "Clínica Restaurar Fisioterapia e Pilates",
    slug: "clinica-restaurar-fisioterapia-pilates",
    segment: "Fisioterapia",
    area: "Terra Vermelha, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "pilates", "vila velha", "terra vermelha"],
  },
  {
    name: "SR Pilates e Fisioterapia",
    slug: "sr-pilates-fisioterapia",
    segment: "Pilates",
    area: "Cidade da Barra / Riviera da Barra, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "fisioterapia", "vila velha"],
  },
  {
    name: "FisioLife Saúde Integrada",
    slug: "fisiolife-saude-integrada",
    segment: "Fisioterapia",
    area: "Praia das Gaivotas, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "pilates", "saude", "vila velha"],
  },
  {
    name: "MoviFisio Clínica de Fisioterapia",
    slug: "movifisio-clinica-fisioterapia",
    segment: "Fisioterapia",
    area: "Praia de Itaparica, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "itaparica"],
  },
  {
    name: "EC Fisioterapia",
    slug: "ec-fisioterapia",
    segment: "Fisioterapia",
    area: "Jockey de Itaparica, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "pilates", "vila velha"],
  },
  {
    name: "Fisio para Todos",
    slug: "fisio-para-todos",
    segment: "Fisioterapia",
    area: "Glória, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "gloria"],
  },
  {
    name: "Fisioterapeuta Robson Vaillant",
    slug: "fisioterapeuta-robson-vaillant",
    segment: "Fisioterapia",
    area: "Centro / Prainha, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "centro", "prainha"],
  },
  {
    name: "Hiáskara Macedo Fisioterapia",
    slug: "hiaskara-macedo-fisioterapia",
    segment: "Fisioterapia",
    area: "Itapuã, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "itapua"],
  },
  {
    name: "Fisiocorporis",
    slug: "fisiocorporis",
    segment: "Fisioterapia",
    area: "Itapuã, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "pilates", "vila velha", "itapua"],
  },
  {
    name: "Evolução Centro de Saúde",
    slug: "evolucao-centro-de-saude",
    segment: "Saúde",
    area: "Praia da Costa, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "saude", "terapias", "vila velha", "praia da costa"],
  },
  {
    name: "Espaço FisioVida",
    slug: "espaco-fisiovida",
    segment: "Fisioterapia",
    area: "IBES, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "ibes"],
  },
  {
    name: "FisioterapiaHD",
    slug: "fisioterapiahd",
    segment: "Fisioterapia",
    area: "Praia de Itaparica, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "itaparica"],
  },
  {
    name: "VIAFISIO",
    slug: "viafisio",
    segment: "Fisioterapia",
    area: "Praia de Itaparica, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "itaparica"],
  },
  {
    name: "Equipe Fisioterapia Especializada",
    slug: "equipe-fisioterapia-especializada",
    segment: "Fisioterapia",
    area: "Praia da Costa, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "fisioterapia", "vila velha", "praia da costa"],
  },
  {
    name: "Center Pilates & Fisioterapia",
    slug: "center-pilates-fisioterapia",
    segment: "Pilates",
    area: "Ataíde, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "fisioterapia", "vila velha", "ataide"],
  },
  {
    name: "Respirar Pilates e Fisioterapia",
    slug: "respirar-pilates-fisioterapia",
    segment: "Pilates",
    area: "Santa Mônica, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "fisioterapia", "vila velha", "santa monica"],
  },
  {
    name: "Mover Saúde Pilates e Musculação Terapêutica",
    slug: "mover-saude-pilates-musculacao-terapeutica",
    segment: "Pilates",
    area: "Centro, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "musculacao terapeutica", "saude", "vila velha"],
  },
  {
    name: "Studio de Pilates Sabrina Braga",
    slug: "studio-pilates-sabrina-braga",
    segment: "Pilates",
    area: "Itapuã, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "vila velha", "itapua"],
  },
  {
    name: "Merinha Braga Studio Pilates",
    slug: "merinha-braga-studio-pilates",
    segment: "Pilates",
    area: "Praia da Costa, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "vila velha", "praia da costa"],
  },
  {
    name: "FisioMovi Pilates e Fisioterapia",
    slug: "fisiomovi-pilates-fisioterapia",
    segment: "Pilates",
    area: "Praia de Itaparica, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "fisioterapia", "vila velha", "itaparica"],
  },
  {
    name: "My Space Pilates e Fisioterapia",
    slug: "my-space-pilates-fisioterapia",
    segment: "Pilates",
    area: "Itapuã, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "pilates", "fisioterapia", "vila velha", "itapua"],
  },
  {
    name: "Odontomax Clínica Odontológica",
    slug: "odontomax-clinica-odontologica",
    segment: "Odontologia",
    area: "Novo México / Vila Velha, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "odontologia", "dentista", "vila velha", "novo mexico"],
  },
  {
    name: "Dentista do Trabalhador",
    slug: "dentista-do-trabalhador",
    segment: "Odontologia",
    area: "Glória, Vila Velha/ES",
    group: "Hot Vila Velha",
    tags: ["hot", "odontologia", "dentista", "vila velha", "gloria"],
  },
  {
    name: "COI Odontologia",
    slug: "coi-odontologia",
    segment: "Odontologia",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "odontologia", "dentista"],
  },
  {
    name: "Clínica Equilíbrio Fisioterapia",
    slug: "clinica-equilibrio-fisioterapia",
    segment: "Fisioterapia",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "fisioterapia"],
  },
  {
    name: "Fisiohealth",
    slug: "fisiohealth-clinica-fisioterapia-pilates",
    segment: "Fisioterapia",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "fisioterapia", "pilates"],
  },
  {
    name: "Espaço Vitta Saúde",
    slug: "espaco-vitta-saude",
    segment: "Saúde",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "saude"],
  },
  {
    name: "EssenceSaúde",
    slug: "essencesaude",
    segment: "Saúde",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "saude"],
  },
  {
    name: "Viva Odontologia",
    slug: "viva-odontologia",
    segment: "Odontologia",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "odontologia", "dentista"],
  },
  {
    name: "CEO Clínica de Especialidades Odontológicas",
    slug: "ceo-clinica-especialidades-odontologicas",
    segment: "Odontologia",
    area: "Demo anterior",
    group: "Anteriores",
    tags: ["anteriores", "odontologia", "dentista"],
  },
];

const state = {
  filter: "all",
  query: "",
  sort: "group",
};

const grid = document.querySelector("#demo-grid");
const template = document.querySelector("#demo-card-template");
const searchInput = document.querySelector("#search");
const resultStatus = document.querySelector("#result-status");
const visibleCount = document.querySelector("#visible-count");
const totalCount = document.querySelector("#total-count");
const hotCount = document.querySelector("#hot-count");
const emptyState = document.querySelector("#empty-state");
const sortSelect = document.querySelector("#sort");
const filterButtons = document.querySelectorAll("[data-filter]");

function normalize(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function demoText(demo) {
  return normalize([demo.name, demo.segment, demo.area, demo.group, ...demo.tags].join(" "));
}

function matchesFilter(demo) {
  if (state.filter === "all") {
    return true;
  }
  return demo.tags.includes(state.filter);
}

function matchesQuery(demo) {
  if (!state.query) {
    return true;
  }
  return demoText(demo).includes(normalize(state.query));
}

function sortDemos(items) {
  return [...items].sort((a, b) => {
    if (state.sort === "name") {
      return a.name.localeCompare(b.name, "pt-BR");
    }
    if (state.sort === "segment") {
      return `${a.segment} ${a.name}`.localeCompare(`${b.segment} ${b.name}`, "pt-BR");
    }
    return `${a.group} ${a.name}`.localeCompare(`${b.group} ${b.name}`, "pt-BR");
  });
}

function setLink(anchor, href) {
  anchor.href = href;
}

function buildWhatsappHref(demo) {
  const whatsappData = window.demoWhatsappLinks?.[demo.slug];
  if (!whatsappData?.phone || !whatsappData?.message) {
    return `./${demo.slug}/copy-whatsapp.md`;
  }
  return `https://wa.me/${whatsappData.phone}?text=${encodeURIComponent(whatsappData.message)}`;
}

function renderCard(demo) {
  const item = template.content.cloneNode(true);
  const card = item.querySelector(".demo-card");
  const thumb = item.querySelector(".thumb-link");
  const image = item.querySelector("img");
  const title = item.querySelector("h2");
  const location = item.querySelector(".demo-location");
  const segment = item.querySelector(".segment-pill");
  const status = item.querySelector(".status-pill");

  const demoUrl = `./${demo.slug}/`;
  card.dataset.search = demoText(demo);
  setLink(thumb, demoUrl);
  image.loading = "eager";
  image.decoding = "async";
  image.src = `./thumbnails/${demo.slug}.jpg`;
  image.alt = `Screenshot desktop de ${demo.name}`;
  title.textContent = demo.name;
  location.textContent = demo.area;
  segment.textContent = demo.segment;
  status.textContent = demo.group;

  setLink(item.querySelector(".demo-link"), demoUrl);
  setLink(item.querySelector(".screenshot-desktop"), `./${demo.slug}/screenshot-desktop.png`);
  setLink(item.querySelector(".screenshot-mobile"), `./${demo.slug}/screenshot-mobile.png`);
  setLink(item.querySelector(".whatsapp-link"), buildWhatsappHref(demo));

  return item;
}

function render() {
  const filtered = sortDemos(demos.filter((demo) => matchesFilter(demo) && matchesQuery(demo)));
  grid.replaceChildren(...filtered.map(renderCard));
  visibleCount.textContent = String(filtered.length);
  resultStatus.textContent = `${filtered.length} ${filtered.length === 1 ? "demo encontrada" : "demos encontradas"}.`;
  emptyState.hidden = filtered.length !== 0;
}

totalCount.textContent = String(demos.length);
hotCount.textContent = String(demos.filter((demo) => demo.tags.includes("hot")).length);

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  render();
});

sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  render();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("is-active", item === button));
    render();
  });
});

render();
