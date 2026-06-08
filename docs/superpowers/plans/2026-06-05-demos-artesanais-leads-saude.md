# Demos Artesanais Leads Saude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two static, handcrafted demo websites for Clinica Equilibrio Fisioterapia and COI Odontologia, each with a private demo page and a personalized WhatsApp outreach message.

**Architecture:** Each lead gets a standalone folder under `demos/` with its own HTML, CSS, JavaScript, assets, screenshots, and WhatsApp copy. Shared code stays minimal so the demos do not feel like repeated templates.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, local Python HTTP server, Google Sheets connector, public web research, in-app browser verification.

---

### Task 1: Ground the source data

**Files:**
- Read: Google Sheet `17KNjGWVFfjzhed9gk6FT-cUfyHl6wBXiYTFttPsfNQc`, tab `Hot High`, range `A1:N9`
- Create: `demos/research/clinica-equilibrio-fisioterapia.md`
- Create: `demos/research/coi-odontologia.md`

- [ ] **Step 1: Read the Hot High lead rows**

Use the Google Sheets connector to read:

```text
Spreadsheet: 17KNjGWVFfjzhed9gk6FT-cUfyHl6wBXiYTFttPsfNQc
Sheet: Hot High
Range: A1:N9
```

Expected: row data for 8 high confidence hot leads, including the two pilot leads.

- [ ] **Step 2: Validate public sources for Clinica Equilibrio**

Search the public web for:

```text
"Clínica Equilíbrio Fisioterapia" Vitória
"Clinica Equilibrio Fisioterapia" "3235-1857"
```

Capture only facts that are visible publicly: name, service category, neighborhood, phone, social/profile links, and whether a site is listed.

- [ ] **Step 3: Validate public sources for COI Odontologia**

Search the public web for:

```text
"COI Odontologia" Vitória "99610-5491"
"coiodontovix"
```

Capture only facts that are visible publicly: name, service category, neighborhood, phone, social/profile links, and whether a site is listed.

- [ ] **Step 4: Write research notes**

Create one markdown note per lead using this structure for Clinica Equilibrio:

```markdown
# Clinica Equilibrio Fisioterapia research

## Public facts used

- Name: Clinica Equilibrio Fisioterapia
- Segment: Fisioterapia/Terapias
- Area: Enseada do Sua
- Public phone: (27) 3235-1857
- Public links:
  - https://br.todosnegocios.com/pt/clinica-equilibrio-fisioterapia-e_1m-27-3235-1857

## Safe inferences

- The demo can speak about local physiotherapy care and WhatsApp contact.

## Do not use

- Patient photos
- Before/after claims
- Testimonials or review counts unless verified from source
- Medical outcomes or guarantees

## Site direction

- Calm, careful, movement-oriented local service page.
```

Create one markdown note per lead using this structure for COI Odontologia:

```markdown
# COI Odontologia research

## Public facts used

- Name: COI Odontologia
- Segment: Odontologia
- Area: Praia do Sua
- Public phone: (27) 99610-5491
- Public links:
  - https://ajudes.org.br/project/coi-odontologia/

## Safe inferences

- The demo can speak about dental care, organized services, and WhatsApp scheduling.

## Do not use

- Patient photos
- Before/after claims
- Testimonials or review counts unless verified from source
- Medical outcomes or guarantees

## Site direction

- Clean, confident, appointment-oriented local dental page.
```

Expected: research notes have source URLs and a clear boundary between fact and inference.

### Task 2: Create project folders and docs

**Files:**
- Create: `demos/README.md`
- Create: `demos/shared/assets/`
- Create: `demos/shared/snippets/`
- Create: `demos/clinica-equilibrio-fisioterapia/assets/`
- Create: `demos/coi-odontologia/assets/`

- [ ] **Step 1: Create folders**

Run:

```bash
mkdir -p demos/shared/assets demos/shared/snippets \
  demos/research \
  demos/clinica-equilibrio-fisioterapia/assets \
  demos/coi-odontologia/assets
```

Expected: all folders exist.

- [ ] **Step 2: Write demos README**

Create `demos/README.md` with this content:

```markdown
# Demos de prospeccao

Sites demo privados criados para abordagem comercial. Cada pasta representa um lead.

## Como abrir localmente

Rode a partir da raiz do projeto:

    python3 -m http.server 4180

Acesse:

- http://localhost:4180/demos/clinica-equilibrio-fisioterapia/
- http://localhost:4180/demos/coi-odontologia/

## Regras de uso

- Os demos usam informacoes publicas.
- Os demos nao sao sites oficiais dos negocios.
- As paginas usam `noindex`.
- Antes de publicar oficialmente, substituir textos, imagens e informacoes com materiais aprovados pelo cliente.
```

Expected: README tells Luiz how to open and publish later without exposing the pages as official sites.

### Task 3: Build Clinica Equilibrio demo

**Files:**
- Create: `demos/clinica-equilibrio-fisioterapia/index.html`
- Create: `demos/clinica-equilibrio-fisioterapia/styles.css`
- Create: `demos/clinica-equilibrio-fisioterapia/script.js`
- Create: `demos/clinica-equilibrio-fisioterapia/copy-whatsapp.md`

- [ ] **Step 1: Define UI direction with ui-ux-pro-max**

Run:

```bash
python3 /Users/luiz_fbm/.codex/skills/ui-ux-pro-max/scripts/search.py "physiotherapy clinic local service calm healthcare trustworthy mobile" --design-system -p "Clinica Equilibrio Fisioterapia"
```

Expected: design guidance for a calm healthcare service landing page.

- [ ] **Step 2: Write website copy**

Use copywriting principles:

```text
Primary action: open WhatsApp conversation.
Audience: people in Vitoria looking for local physiotherapy or pilates.
Tone: calm, direct, careful.
Avoid: cure promises, guaranteed outcomes, exaggerated claims.
```

Expected: copy includes hero, service blocks, location/contact, FAQ, and final CTA.

- [ ] **Step 3: Humanize copy**

Review the copy with `humanizer` rules:

```text
No em dashes or en dashes.
No generic "vibrant", "transformative", "crucial" phrasing.
No fabricated proof.
No robotic rule-of-three rhythm.
```

Expected: text reads like a small local clinic page, not AI marketing copy.

- [ ] **Step 4: Implement static files**

Create a responsive static site with:

```text
index.html: semantic sections, noindex meta, WhatsApp CTAs, unofficial concept footer
styles.css: unique visual language for this lead, mobile-first layout
script.js: only small interactions such as mobile menu or scroll reveal
copy-whatsapp.md: personalized outreach message for Luiz
```

Expected: the demo opens at `/demos/clinica-equilibrio-fisioterapia/`.

### Task 4: Build COI Odontologia demo

**Files:**
- Create: `demos/coi-odontologia/index.html`
- Create: `demos/coi-odontologia/styles.css`
- Create: `demos/coi-odontologia/script.js`
- Create: `demos/coi-odontologia/copy-whatsapp.md`

- [ ] **Step 1: Define UI direction with ui-ux-pro-max**

Run:

```bash
python3 /Users/luiz_fbm/.codex/skills/ui-ux-pro-max/scripts/search.py "dental clinic local service clean trustworthy appointment mobile" --design-system -p "COI Odontologia"
```

Expected: design guidance for a clean dental service landing page.

- [ ] **Step 2: Write website copy**

Use copywriting principles:

```text
Primary action: open WhatsApp conversation.
Audience: people in Vitoria looking for dental care.
Tone: clean, confident, professional.
Avoid: before/after language, beauty guarantees, invented expertise, invented review counts.
```

Expected: copy includes hero, treatment/service organization, appointment flow, location/contact, FAQ, and final CTA.

- [ ] **Step 3: Humanize copy**

Review the copy with `humanizer` rules:

```text
No em dashes or en dashes.
No generic "renowned", "state-of-the-art", or vague authority claims.
No fabricated proof.
No pressure-heavy sales tone.
```

Expected: text sounds like a grounded local dental clinic page.

- [ ] **Step 4: Implement static files**

Create a responsive static site with:

```text
index.html: semantic sections, noindex meta, WhatsApp CTAs, unofficial concept footer
styles.css: unique visual language for this lead, mobile-first layout
script.js: only small interactions such as mobile menu or scroll reveal
copy-whatsapp.md: personalized outreach message for Luiz
```

Expected: the demo opens at `/demos/coi-odontologia/`.

### Task 5: Verify locally and capture screenshots

**Files:**
- Create: `demos/clinica-equilibrio-fisioterapia/screenshot-mobile.png`
- Create: `demos/clinica-equilibrio-fisioterapia/screenshot-desktop.png`
- Create: `demos/coi-odontologia/screenshot-mobile.png`
- Create: `demos/coi-odontologia/screenshot-desktop.png`

- [ ] **Step 1: Start local server**

Run from project root:

```bash
python3 -m http.server 4180
```

Expected: server serves `http://localhost:4180/`.

- [ ] **Step 2: Validate each page**

Open both URLs in the in-app browser:

```text
http://localhost:4180/demos/clinica-equilibrio-fisioterapia/
http://localhost:4180/demos/coi-odontologia/
```

Check at widths:

```text
390px mobile
768px tablet
1280px desktop
```

Expected: no horizontal overflow, text does not overlap, CTAs are visible, and pages load without console errors.

- [ ] **Step 3: Capture screenshots**

Save mobile and desktop screenshots into each lead folder.

Expected: four screenshot files exist and show the rendered pages.

### Task 6: Final audit

**Files:**
- Read: `docs/superpowers/specs/2026-06-05-demos-artesanais-leads-saude-design.md`
- Read: all files under `demos/clinica-equilibrio-fisioterapia/`
- Read: all files under `demos/coi-odontologia/`

- [ ] **Step 1: Check required files**

Run:

```bash
find demos -maxdepth 3 -type f | sort
```

Expected: both lead folders contain HTML, CSS, JS, WhatsApp copy, and screenshots.

- [ ] **Step 2: Check safety requirements**

Run:

```bash
rg -n "noindex|conceito visual|nao oficial|não oficial|wa.me|api.whatsapp.com" demos
```

Expected: each HTML contains noindex, unofficial concept copy, and WhatsApp CTAs.

- [ ] **Step 3: Check for risky copy**

Run:

```bash
rg -n "garant|cura|resultado garantido|antes e depois|depoimento|avaliações|avaliacoes|renomad|state-of-the-art|transformador|revolucion" demos
```

Expected: no risky or fabricated claims in user-facing copy. Any matching safe sentence must be inspected manually.

- [ ] **Step 4: Final browser check**

Reload both demos in the browser after all edits.

Expected: both demos are visually usable and ready for Luiz to publish privately.
