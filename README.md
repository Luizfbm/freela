# Freela Luiz FBM

Repositorio privado para o portfolio comercial de Luiz FBM e para os sites demo usados na prospeccao de pequenos negocios locais.

## Cliente e contato

- Responsavel: Luiz FBM
- WhatsApp: `+55 27 99311-2102`
- Email: `contatoluizfbm@gmail.com`
- Localidade base: Vitoria, Espirito Santo
- Oferta principal: sites simples, bonitos e claros para pequenos negocios locais
- Nicho inicial: fisioterapeutas, dentistas, pequenos laboratorios, clinicas e servicos locais de saude

## Estrategia comercial

A abordagem e freelancer direto, sem foco inicial em trafego pago. A ideia e pesquisar negocios sem site proprio, montar um demo artesanal com informacoes publicas e apresentar algo pronto para o possivel cliente visualizar.

Fluxo atual:

1. Encontrar leads locais sem site proprio.
2. Separar os leads mais quentes na planilha.
3. Criar uma pasta demo por lead.
4. Preparar uma copy exclusiva de WhatsApp para cada abordagem.
5. Publicar o demo em um subdominio ou caminho especifico para o cliente avaliar.

## Hospedagem

O portfolio esta na raiz do repositorio para ser a tela principal da hospedagem estatica.

Arquivos principais:

- `index.html`
- `styles.css`
- `script.js`
- `assets/`

Ao hospedar este repositorio, a pagina inicial deve abrir direto no portfolio de Luiz FBM.

## Estrutura

```text
.
├── index.html
├── styles.css
├── script.js
├── assets/
├── demos/
│   ├── clinica-equilibrio-fisioterapia/
│   ├── coi-odontologia/
│   └── research/
├── docs/
│   ├── portfolio-referencias.md
│   ├── screenshots/
│   └── superpowers/
├── outputs/
│   └── vitoria_saude_leads_20260605/
└── skills-lock.json
```

## Demos piloto

### Clinica Equilibrio Fisioterapia

- Pasta: `demos/clinica-equilibrio-fisioterapia/`
- Segmento: fisioterapia e terapias
- CTA usado no demo: telefone
- Observacao: fontes publicas apresentaram dados de endereco inconsistentes, entao o demo evita afirmar endereco exato.

### COI Odontologia

- Pasta: `demos/coi-odontologia/`
- Segmento: odontologia
- CTA usado no demo: WhatsApp
- Observacao: o demo usa servicos listados em fonte publica, mas evita copiar fotos, logo ou identidade visual oficial sem autorizacao.

## Rodando localmente

Na raiz do repositorio:

```bash
python3 -m http.server 4173
```

Acesse:

- Portfolio: `http://localhost:4173/`
- Demo Clinica Equilibrio: `http://localhost:4173/demos/clinica-equilibrio-fisioterapia/`
- Demo COI Odontologia: `http://localhost:4173/demos/coi-odontologia/`

## Regras de uso

- Os demos usam informacoes publicas.
- Os demos nao sao sites oficiais dos negocios.
- As paginas demo usam `noindex`.
- As imagens dos demos sao geradas e nao copiam fotos do Instagram.
- Antes de publicar um site definitivo, validar textos, imagens, enderecos e autorizacoes com o cliente.
