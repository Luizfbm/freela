# Freela Luiz FBM

Repositorio de prospeccao e entregas iniciais para sites de pequenos negocios locais.

## Estrutura

```text
.
├── demos/
│   ├── clinica-equilibrio-fisioterapia/
│   ├── coi-odontologia/
│   └── research/
├── docs/
│   └── superpowers/
├── outputs/
│   └── vitoria_saude_leads_20260605/
├── portifolio-luizfbm/
└── skills-lock.json
```

## Pastas

- `portifolio-luizfbm/`: portfolio estatico usado na abordagem comercial.
- `demos/`: sites demo por lead, com uma pasta final para cada negocio.
- `demos/research/`: notas de pesquisa usadas para montar cada demo.
- `docs/superpowers/`: especificacoes e planos do trabalho.
- `outputs/`: planilhas e scripts de apoio gerados durante a prospeccao.
- `skills-lock.json`: registro das skills instaladas para o fluxo de copy/design.

## Rodando localmente

Portfolio:

```bash
cd portifolio-luizfbm
python3 -m http.server 4173
```

Demos:

```bash
python3 -m http.server 4180
```

Depois acesse:

- `http://localhost:4173/`
- `http://localhost:4180/demos/clinica-equilibrio-fisioterapia/`
- `http://localhost:4180/demos/coi-odontologia/`

## Observacao

Os demos sao conceitos visuais nao oficiais, feitos com informacoes publicas e configurados com `noindex`. Antes de publicar um site definitivo, valide textos, imagens, enderecos e autorizacoes com o cliente.
