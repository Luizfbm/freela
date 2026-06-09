# Novos Demos de Leads de Saude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build five unique static demos for Fisiohealth, Espaco Vitta Saude, EssenceSaude, Viva Odontologia, and CEO Clinica de Especialidades Odontologicas, each with lead-specific visual direction, site copy, research notes, WhatsApp outreach copy, screenshots, and verification.

**Architecture:** Follow the existing one-folder-per-demo pattern. Each lead gets a standalone static site with local `index.html`, `styles.css`, `script.js`, `assets/`, screenshots, and `copy-whatsapp.md`; research notes stay in `demos/research/`. Shared behavior should be copied from the current tiny menu/reveal script instead of adding a shared runtime dependency.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, generated/locally stored PNG hero assets, Playwright or browser automation for verification, Python HTML parser for structural checks.

---

## File Structure

Create:

- `demos/fisiohealth-clinica-fisioterapia-pilates/index.html`: Fisiohealth landing page.
- `demos/fisiohealth-clinica-fisioterapia-pilates/styles.css`: Fisiohealth-specific styling using blue/green healthcare palette.
- `demos/fisiohealth-clinica-fisioterapia-pilates/script.js`: mobile menu and reveal behavior copied from existing demos.
- `demos/fisiohealth-clinica-fisioterapia-pilates/copy-whatsapp.md`: outreach message for Fisiohealth.
- `demos/fisiohealth-clinica-fisioterapia-pilates/assets/hero-fisiohealth.png`: generic raster hero image.
- `demos/fisiohealth-clinica-fisioterapia-pilates/screenshot-desktop.png`: desktop verification screenshot.
- `demos/fisiohealth-clinica-fisioterapia-pilates/screenshot-mobile.png`: mobile verification screenshot.
- `demos/research/fisiohealth-clinica-fisioterapia-pilates.md`: public facts, safe inferences, and do-not-use notes.

- `demos/espaco-vitta-saude/index.html`: Espaco Vitta landing page.
- `demos/espaco-vitta-saude/styles.css`: orange/purple styling based on public Instagram.
- `demos/espaco-vitta-saude/script.js`: mobile menu and reveal behavior copied from existing demos.
- `demos/espaco-vitta-saude/copy-whatsapp.md`: outreach message for Espaco Vitta.
- `demos/espaco-vitta-saude/assets/hero-vitta.png`: generic raster hero image.
- `demos/espaco-vitta-saude/screenshot-desktop.png`: desktop verification screenshot.
- `demos/espaco-vitta-saude/screenshot-mobile.png`: mobile verification screenshot.
- `demos/research/espaco-vitta-saude.md`: public facts, safe inferences, and do-not-use notes.

- `demos/essencesaude/index.html`: EssenceSaude landing page.
- `demos/essencesaude/styles.css`: earth/orange/green styling based on public Instagram and Setmore presence.
- `demos/essencesaude/script.js`: mobile menu and reveal behavior copied from existing demos.
- `demos/essencesaude/copy-whatsapp.md`: outreach message for EssenceSaude.
- `demos/essencesaude/assets/hero-essence.png`: generic raster hero image.
- `demos/essencesaude/screenshot-desktop.png`: desktop verification screenshot.
- `demos/essencesaude/screenshot-mobile.png`: mobile verification screenshot.
- `demos/research/essencesaude.md`: public facts, safe inferences, and do-not-use notes.

- `demos/viva-odontologia/index.html`: Viva Odontologia landing page.
- `demos/viva-odontologia/styles.css`: neutral blue/green dental styling without using the ambiguous Maceio Instagram identity.
- `demos/viva-odontologia/script.js`: mobile menu and reveal behavior copied from existing demos.
- `demos/viva-odontologia/copy-whatsapp.md`: outreach message for Viva Odontologia.
- `demos/viva-odontologia/assets/hero-viva-odontologia.png`: generic raster hero image.
- `demos/viva-odontologia/screenshot-desktop.png`: desktop verification screenshot.
- `demos/viva-odontologia/screenshot-mobile.png`: mobile verification screenshot.
- `demos/research/viva-odontologia.md`: public facts, safe inferences, and do-not-use notes.

- `demos/ceo-clinica-especialidades-odontologicas/index.html`: CEO landing page.
- `demos/ceo-clinica-especialidades-odontologicas/styles.css`: institutional blue/cyan dental styling.
- `demos/ceo-clinica-especialidades-odontologicas/script.js`: mobile menu and reveal behavior copied from existing demos.
- `demos/ceo-clinica-especialidades-odontologicas/copy-whatsapp.md`: outreach message for CEO.
- `demos/ceo-clinica-especialidades-odontologicas/assets/hero-ceo-odontologia.png`: generic raster hero image.
- `demos/ceo-clinica-especialidades-odontologicas/screenshot-desktop.png`: desktop verification screenshot.
- `demos/ceo-clinica-especialidades-odontologicas/screenshot-mobile.png`: mobile verification screenshot.
- `demos/research/ceo-clinica-especialidades-odontologicas.md`: public facts, safe inferences, and do-not-use notes.

Modify:

- `demos/README.md`: add local URLs for the five new demos.

Do not modify:

- Existing COI or Clinica Equilibrio files unless a verification step proves shared documentation needs a small update.
- Portfolio root files.

## Task 1: Prepare lead data and research notes

**Files:**
- Create: `demos/research/fisiohealth-clinica-fisioterapia-pilates.md`
- Create: `demos/research/espaco-vitta-saude.md`
- Create: `demos/research/essencesaude.md`
- Create: `demos/research/viva-odontologia.md`
- Create: `demos/research/ceo-clinica-especialidades-odontologicas.md`

- [ ] **Step 1: Write Fisiohealth research note**

Use this structure and content:

```markdown
# Fisiohealth Clinica de Fisioterapia e Pilates research

## Public facts used

- Name: Fisiohealth Clinica de Fisioterapia e Pilates
- Segment: fisioterapia e pilates
- City: Vitoria/ES
- Area: Jardim Camburi
- Public phone from lead sheet/directories: (27) 3014-9801
- Public address from directories: Rua Paschoal Delmaestro, 635, Jardim Camburi, Vitoria/ES
- Services listed by BuscaFisio: Fisioterapia, Pilates, RPG and Terapia Manual
- Public links:
  - https://seniorbemestar.com/clinicas-de-fisioterapia/vitoria/fisiohealth-clinica-de-fisioterapia-e-pilates/
  - https://buscafisio.com.br/fisiohealth-clinica-de-fisioterapia-ltda
  - https://www.solutudo.com.br/empresas/es/vitoria/fisioterapia/fisiohealth-clinica-de-fisioterapia-e-pilates-21761093

## Source notes

- Public directories indicate the business is active and located in Jardim Camburi.
- Search results and directories mention Instagram or social presence, but no reliable Instagram handle was confirmed.
- The demo should not invent an Instagram handle or use visual details from an unrelated profile.

## Safe inferences

- The demo can speak about physiotherapy, pilates, RPG, manual therapy, movement, routine and scheduling.
- The visual direction can be clean, technical and welcoming.

## Do not use

- Patient photos.
- Before/after images.
- Testimonials, review counts or ratings.
- Claims about guaranteed recovery, pain relief or treatment results.
- Instagram identity unless the business confirms the correct handle.

## Site direction

- Blue/green healthcare palette.
- Clear service blocks.
- Phone-first contact path.
- Strong note that the page is a non-official visual concept.
```

- [ ] **Step 2: Write Espaco Vitta research note**

Use this structure and content:

```markdown
# Espaco Vitta Saude research

## Public facts used

- Name: Espaco Vitta Saude
- Segment: fisioterapia, pilates and other therapies
- City: Vitoria/ES
- Area: Jardim da Penha
- Public phone: (27) 2142-1173
- Public Instagram: @vittasaudee
- Public address from Ajudes and Instagram captions: Rua Maria Eleonora Pereira, 555, loja 01, Jardim da Penha, Vitoria/ES
- Public links:
  - https://ajudes.org.br/project/espaco-vitta-saude/
  - https://www.instagram.com/vittasaudee/

## Source notes

- Ajudes lists the lead as a partner and mentions fisioterapia, pilates and other therapies.
- Instagram bio mentions "Mais saude, mais longevidade" and pilates for strength, balance and well-being.
- Instagram highlights include services, testimonials, location, tips, WhatsApp, pregnant patients, scoliosis, doubts and pilates.
- Public Instagram visuals use orange and purple as the strongest brand colors.

## Safe inferences

- The demo can focus on pilates, movement, strength, balance, routine, scheduling and local studio presence.
- The demo can use orange and purple as visual references without copying Instagram art.

## Do not use

- Instagram photos, reels, patient images or highlight art.
- Testimonials or review quotes.
- Promises that pilates fixes pain or clinical conditions.
- Free-class claims unless confirmed by the business before official publication.

## Site direction

- Energetic but professional orange/purple identity.
- Pilates-first hero.
- Clear location and phone path.
- Non-official concept disclaimer.
```

- [ ] **Step 3: Write EssenceSaude research note**

Use this structure and content:

```markdown
# EssenceSaude research

## Public facts used

- Name: EssenceSaude
- Segment: terapias integrativas, fisioterapia and pos-operatorio
- City: Vitoria/ES
- Area: Praia do Sua
- Public phone/WhatsApp: (27) 99779-6437
- Public Instagram: @essencesaude
- Public email from Setmore/SindjudES: essenceterapiasintegrativas@gmail.com
- Public address: Av. Joao Batista Parra, 633, Ed. Enseada Office, sala 1101, Praia do Sua, Vitoria/ES
- Public links:
  - https://centrodeterapiasintegrativasemsadeltda.setmore.com/
  - https://www.sindjud.com.br/featured_item/essencesaude-centro-de-terapias-integrativas-em-saude/
  - https://www.instagram.com/essencesaude/

## Source notes

- Instagram bio mentions terapias integrativas and pos-operatorio plastica.
- Setmore lists services including massagem, fisioterapia, acupuntura + reflexoterapia, drenagem linfatica, tratamento integrativo da dor and procedimento dermatofuncional.
- Public visual identity uses a circular mark with burnt orange, earthy tones and dark green.

## Safe inferences

- The demo can focus on care navigation, booking, post-operative support and integrative therapies.
- The copy can use sober terms such as acompanhamento, avaliacao, protocolo individual and seguranca.

## Do not use

- Patient photos or procedure images.
- Reviews, ratings or testimonials from booking pages.
- Before/after claims.
- Guarantees about surgical recovery, fibrosis, pain or aesthetic outcomes.

## Site direction

- Warm, premium and clinical.
- Earth/orange/dark-green palette.
- WhatsApp and booking-forward flow.
- Non-official concept disclaimer.
```

- [ ] **Step 4: Write Viva Odontologia research note**

Use this structure and content:

```markdown
# Viva Odontologia research

## Public facts used

- Name: Viva Odontologia
- Segment: odontologia
- City: Vitoria/ES
- Area: Santa Lucia
- Public phone: (27) 3026-1235
- Public address: Av. Nossa Sra. da Penha, 549, sala 105, Santa Lucia, Vitoria/ES
- Public links:
  - https://br.todosnegocios.com/pt/viva-odontologia-27-3026-1235

## Source notes

- TodosNegocios lists phone, address, hours and no standalone website.
- TodosNegocios points to Instagram, but the visible handle `@viva.odontologia` opened a profile that appears to be from Maceio.
- The demo must not use the Maceio profile identity for the Vitoria lead.

## Safe inferences

- The demo can speak about odontologia, local contact, phone, location and organizing public information.
- The visual direction should use a neutral dental palette instead of an uncertain brand identity.

## Do not use

- The Maceio Instagram profile as visual reference.
- Any unconfirmed specialty list.
- Patient photos, before/after images, testimonials, ratings or outcome promises.

## Site direction

- Light blue/green dental palette.
- Simple phone-first contact path.
- Conservative service wording.
- Non-official concept disclaimer.
```

- [ ] **Step 5: Write CEO research note**

Use this structure and content:

```markdown
# CEO Clinica de Especialidades Odontologicas research

## Public facts used

- Name: CEO Clinica de Especialidades Odontologicas
- Segment: odontologia
- City: Vitoria/ES
- Area: Jardim da Penha
- Public phone/WhatsApp: (27) 3227-8122
- Public address: Pc Philogomiro Lannes, 200, Jardim da Penha, Vitoria/ES
- Public links:
  - https://br.todosnegocios.com/pt/ceo-cl%C3%ADnica-de-especialidades-27-3227-8122
  - https://dentmap.com.br/dentistas/vitoria/ceo-clinica-de-especialidades-odontologicas-ltda-2aivlyn0
  - https://applocal.com.br/empresa/ceo-clinica-de-especialidades-odontologicas/vitoria/es/9446651

## Source notes

- TodosNegocios lists phone, address, opening hours and no standalone website.
- DentMap lists a WhatsApp link and a generic directory procedure list.
- The demo should not treat directory procedure tags as an official service menu.

## Safe inferences

- The demo can say the clinic works with odontologia and especialidades odontologicas.
- The visual direction can be institutional, organized and direct.

## Do not use

- Procedure lists as official unless the clinic confirms them.
- Reviews, ratings or testimonial quotes.
- Photos from directories or Facebook.
- Before/after images or treatment result promises.

## Site direction

- Deep blue/cyan institutional palette.
- Contact and location clarity.
- Conservative specialty wording.
- Non-official concept disclaimer.
```

- [ ] **Step 6: Run a quick research note check**

Run:

```bash
rg -n "before/after|garant|promessa|TODO|TBD|@viva\\.odontologia|Maceio" demos/research
```

Expected:

- No `TODO` or `TBD`.
- Mentions of `@viva.odontologia` and `Maceio` only inside `demos/research/viva-odontologia.md` as warnings.
- No unsafe promise language except warnings in "Do not use" sections.

## Task 2: Create the five demo folders and base scripts

**Files:**
- Create all five demo directories and their `assets/` subdirectories.
- Create each `script.js`.

- [ ] **Step 1: Create directory skeleton**

Run:

```bash
mkdir -p \
  demos/fisiohealth-clinica-fisioterapia-pilates/assets \
  demos/espaco-vitta-saude/assets \
  demos/essencesaude/assets \
  demos/viva-odontologia/assets \
  demos/ceo-clinica-especialidades-odontologicas/assets
```

Expected: command exits 0 and `find demos -maxdepth 2 -type d | sort` lists all five new folders.

- [ ] **Step 2: Copy the existing small script to each demo**

Use `demos/coi-odontologia/script.js` as the source because it already supports menu toggle and reveal without external dependencies.

Run:

```bash
cp demos/coi-odontologia/script.js demos/fisiohealth-clinica-fisioterapia-pilates/script.js
cp demos/coi-odontologia/script.js demos/espaco-vitta-saude/script.js
cp demos/coi-odontologia/script.js demos/essencesaude/script.js
cp demos/coi-odontologia/script.js demos/viva-odontologia/script.js
cp demos/coi-odontologia/script.js demos/ceo-clinica-especialidades-odontologicas/script.js
```

Expected: all five `script.js` files match the existing behavior and contain no lead-specific text.

- [ ] **Step 3: Verify script files exist**

Run:

```bash
for slug in fisiohealth-clinica-fisioterapia-pilates espaco-vitta-saude essencesaude viva-odontologia ceo-clinica-especialidades-odontologicas; do test -f "demos/$slug/script.js" || exit 1; done
```

Expected: command exits 0.

## Task 3: Create generic raster hero assets

**Files:**
- Create: `demos/fisiohealth-clinica-fisioterapia-pilates/assets/hero-fisiohealth.png`
- Create: `demos/espaco-vitta-saude/assets/hero-vitta.png`
- Create: `demos/essencesaude/assets/hero-essence.png`
- Create: `demos/viva-odontologia/assets/hero-viva-odontologia.png`
- Create: `demos/ceo-clinica-especialidades-odontologicas/assets/hero-ceo-odontologia.png`

- [ ] **Step 1: Generate or create five safe bitmap images**

Create five PNG images with no people, no patient data, no copied Instagram art and no business logos. Each image should show a generic environment or abstract close scene relevant to the lead:

```text
hero-fisiohealth.png: calm physiotherapy and pilates studio, blue/green treatment room, mats and equipment, no people, photographic feel.
hero-vitta.png: bright pilates studio with orange/purple accents, reformer silhouettes or mats, no people, photographic feel.
hero-essence.png: warm integrative therapy room with natural textures, burnt orange and dark green details, no people, photographic feel.
hero-viva-odontologia.png: clean dental room with light blue/green accents, no people, photographic feel.
hero-ceo-odontologia.png: organized dental reception or treatment room with deep blue/cyan accents, no people, photographic feel.
```

If using AI image generation, save the generated raster output into the exact paths listed above. If using local procedural generation, use a raster PNG with enough detail to read as a real page asset, not a flat icon.

- [ ] **Step 2: Verify assets are valid PNGs**

Run:

```bash
file demos/fisiohealth-clinica-fisioterapia-pilates/assets/hero-fisiohealth.png \
  demos/espaco-vitta-saude/assets/hero-vitta.png \
  demos/essencesaude/assets/hero-essence.png \
  demos/viva-odontologia/assets/hero-viva-odontologia.png \
  demos/ceo-clinica-especialidades-odontologicas/assets/hero-ceo-odontologia.png
```

Expected: each line includes `PNG image data`.

## Task 4: Build Fisiohealth demo

**Files:**
- Create: `demos/fisiohealth-clinica-fisioterapia-pilates/index.html`
- Create: `demos/fisiohealth-clinica-fisioterapia-pilates/styles.css`
- Create: `demos/fisiohealth-clinica-fisioterapia-pilates/copy-whatsapp.md`

- [ ] **Step 1: Create Fisiohealth HTML**

Use this content shape:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="Conceito visual nao oficial para uma pagina local da Fisiohealth em Vitoria.">
  <meta name="theme-color" content="#edfdfa">
  <title>Fisiohealth | Conceito visual</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Noto+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <header class="site-header">
    <nav class="nav-shell" aria-label="Navegação principal">
      <a class="brand" href="#inicio" aria-label="Voltar ao início">
        <span class="brand-mark" aria-hidden="true">FH</span>
        <span>Fisiohealth</span>
      </a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="menu" data-menu-toggle>
        <span class="sr-only">Abrir menu</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <div class="nav-links" id="menu" data-menu>
        <a href="#cuidados">Cuidados</a>
        <a href="#servicos">Serviços</a>
        <a href="#contato">Contato</a>
      </div>
      <a class="nav-cta" href="tel:+552730149801">Ligar</a>
    </nav>
  </header>
  <main id="conteudo">
    <section class="hero" id="inicio">
      <div class="hero-copy reveal">
        <p class="eyebrow">Fisioterapia e pilates em Jardim Camburi</p>
        <h1>Movimento, cuidado e contato reunidos em uma página simples.</h1>
        <p>Conceito de site para organizar os serviços públicos da Fisiohealth e facilitar a primeira ligação de quem pesquisa pelo celular.</p>
        <div class="hero-actions">
          <a class="button primary" href="tel:+552730149801">Ligar para a clínica</a>
          <a class="button secondary" href="#servicos">Ver serviços</a>
        </div>
      </div>
      <div class="hero-media reveal">
        <img src="assets/hero-fisiohealth.png" alt="Imagem fotográfica de uma sala de fisioterapia e pilates sem pessoas">
      </div>
    </section>
    <section class="section intro" id="cuidados">
      <div class="container split">
        <div>
          <p class="eyebrow">Antes da primeira conversa</p>
          <h2>O paciente entende o básico sem depender de diretórios.</h2>
        </div>
        <p>A proposta do demo é mostrar serviço, localização geral, telefone e próximos passos em uma leitura curta. O texto final deve ser confirmado pela clínica antes de uma publicação oficial.</p>
      </div>
    </section>
    <section class="section" id="servicos">
      <div class="container">
        <div class="section-heading reveal">
          <p class="eyebrow">Serviços citados publicamente</p>
          <h2>Uma apresentação limpa para fisioterapia, pilates e rotina de cuidado.</h2>
        </div>
        <div class="service-grid">
          <article class="service-card reveal"><span>01</span><h3>Fisioterapia</h3><p>Espaço para explicar avaliação, acompanhamento e contato sem prometer resultado clínico.</p></article>
          <article class="service-card reveal"><span>02</span><h3>Pilates</h3><p>Bloco para quem busca força, mobilidade e orientação em uma rotina guiada.</p></article>
          <article class="service-card reveal"><span>03</span><h3>RPG e terapia manual</h3><p>Serviços aparecem em diretório público e devem ser confirmados pela clínica antes da versão final.</p></article>
        </div>
      </div>
    </section>
    <section class="section contact-section" id="contato">
      <div class="container contact-grid">
        <div class="reveal">
          <p class="eyebrow">Contato público</p>
          <h2>Um caminho curto para falar com a clínica.</h2>
          <p>Os diretórios consultados citam Jardim Camburi e telefone público. A versão oficial deve confirmar endereço, horários e canais digitais corretos.</p>
        </div>
        <div class="contact-box reveal">
          <span>Fisiohealth</span>
          <a class="contact-phone" href="tel:+552730149801">(27) 3014-9801</a>
          <p>Jardim Camburi, Vitória/ES</p>
          <a class="button primary full" href="tel:+552730149801">Ligar agora</a>
        </div>
      </div>
    </section>
    <section class="section faq">
      <div class="container">
        <div class="section-heading reveal"><p class="eyebrow">Nota do demo</p><h2>Pontos mantidos com cuidado.</h2></div>
        <div class="faq-grid">
          <details class="reveal"><summary>Esta página é oficial?</summary><p>Não. É um conceito visual criado com informações públicas para mostrar uma possibilidade de presença própria.</p></details>
          <details class="reveal"><summary>Os serviços foram inventados?</summary><p>Não. Eles aparecem em diretórios públicos, mas precisam de confirmação da clínica antes da publicação oficial.</p></details>
          <details class="reveal"><summary>Por que não há fotos da clínica?</summary><p>Porque fotos de equipe, pacientes ou ambiente real exigem autorização. O demo usa uma imagem genérica sem pessoas.</p></details>
        </div>
      </div>
    </section>
  </main>
  <footer class="site-footer">
    <p>Conceito visual não oficial criado por Luiz FBM com informações públicas. Este site não representa a Fisiohealth.</p>
  </footer>
  <script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create Fisiohealth CSS**

Use the existing demo CSS patterns and these variables:

```css
:root {
  --bg: #edfdfa;
  --surface: #ffffff;
  --soft: #d9f7f0;
  --ink: #123c43;
  --muted: #557179;
  --primary: #087f8c;
  --primary-dark: #065f68;
  --accent: #059669;
  --line: rgba(8, 127, 140, 0.18);
  --shadow: 0 24px 70px rgba(18, 60, 67, 0.14);
  --radius: 18px;
}
```

The CSS must include: sticky header, mobile menu, two-column hero on desktop, single-column hero under 900px, stable button dimensions, `.contact-phone` with `clamp(1.85rem, 3vw, 2.4rem)`, focus-visible outline and reduced-motion block.

- [ ] **Step 3: Create Fisiohealth WhatsApp copy**

Use:

```markdown
# Mensagem para WhatsApp

Oi, pessoal da Fisiohealth. Tudo bem?

Sou Luiz, aqui de Vitória. Encontrei a clínica em diretórios locais e vi que aparecem serviços como fisioterapia, pilates, RPG e terapia manual, mas não achei um site próprio claro reunindo essas informações.

Montei um conceito visual de como poderia ficar uma página simples para organizar os serviços e facilitar o contato de quem pesquisa pelo celular:
{{DEMO_URL}}

Não é um site oficial de vocês, só uma ideia visual feita com informações públicas. Também não usei fotos de pacientes, equipe ou promessas de resultado. Se fizer sentido, posso ajustar com os dados corretos e publicar no domínio de vocês. Se preferirem que eu remova, sem problema.
```

## Task 5: Build Espaco Vitta demo

**Files:**
- Create: `demos/espaco-vitta-saude/index.html`
- Create: `demos/espaco-vitta-saude/styles.css`
- Create: `demos/espaco-vitta-saude/copy-whatsapp.md`

- [ ] **Step 1: Create Espaco Vitta HTML**

Create a complete static HTML page with this structure: skip link, sticky header with brand/nav/mobile menu button, hero section, short intro section, service-card grid, contact section, FAQ section, footer disclaimer and `script.js` include. Use these lead-specific values:

```text
title: Espaco Vitta Saude | Conceito visual
theme-color: #fff7ed
brand mark: VS
brand text: Espaço Vitta Saúde
nav anchors: Pilates, Serviços, Contato
CTA href: tel:+552721421173
hero eyebrow: Pilates em Jardim da Penha
hero h1: Mais força, equilíbrio e clareza para quem quer começar pelo celular.
hero paragraph: Conceito de site para transformar a energia do Instagram do Espaço Vitta em uma página própria, com serviços, localização e contato em um caminho direto.
hero image: assets/hero-vitta.png
hero alt: Imagem fotográfica de um estúdio de pilates sem pessoas
service cards:
  01 Pilates para força e equilíbrio
  02 Fisioterapia e terapias
  03 Localização e WhatsApp
contact phone: (27) 2142-1173
contact area: Rua Maria Eleonora Pereira, 555, loja 01, Jardim da Penha
footer business name: Espaço Vitta Saúde
```

Add a short intro section saying the Instagram already comunica movimento, longevidade e bem-estar, and the page organizes that into a route that is easier to send, find and open outside the feed.

- [ ] **Step 2: Create Espaco Vitta CSS**

Use the existing demo CSS patterns and these variables:

```css
:root {
  --bg: #fff7ed;
  --surface: #ffffff;
  --soft: #ffedd5;
  --ink: #3d213f;
  --muted: #725a73;
  --primary: #ea580c;
  --primary-dark: #9a3412;
  --accent: #7c3aed;
  --line: rgba(234, 88, 12, 0.2);
  --shadow: 0 24px 70px rgba(61, 33, 63, 0.14);
  --radius: 20px;
}
```

Use orange for primary blocks, purple for secondary buttons and icon/number chips, white cards and no gradient-orb decoration.

- [ ] **Step 3: Create Espaco Vitta WhatsApp copy**

Use:

```markdown
# Mensagem para WhatsApp

Oi, pessoal do Espaço Vitta Saúde. Tudo bem?

Sou Luiz, aqui de Vitória. Encontrei vocês pela página da Ajudes e pelo Instagram. O perfil já passa bem a ideia de pilates, força, equilíbrio e bem-estar, mas não encontrei um site próprio reunindo serviços, localização e contato em uma página simples.

Montei um conceito visual usando essa identidade laranja e roxa que aparece no Instagram, sem copiar fotos ou artes do perfil:
{{DEMO_URL}}

Não é um site oficial de vocês, só uma ideia feita com informações públicas. Se fizer sentido, posso ajustar com os dados corretos, textos aprovados e publicar no domínio de vocês. Se preferirem que eu remova, sem problema.
```

## Task 6: Build EssenceSaude demo

**Files:**
- Create: `demos/essencesaude/index.html`
- Create: `demos/essencesaude/styles.css`
- Create: `demos/essencesaude/copy-whatsapp.md`

- [ ] **Step 1: Create EssenceSaude HTML**

Create a complete static HTML page with this structure: skip link, sticky header with brand/nav/mobile menu button, hero section, short intro section, service-card grid, contact section, FAQ section, footer disclaimer and `script.js` include. Use these lead-specific values:

```text
title: EssenceSaude | Conceito visual
theme-color: #fbf7ef
brand mark: ES
brand text: EssenceSaúde
nav anchors: Cuidados, Terapias, Contato
CTA href: https://wa.me/5527997796437?text=Oi%2C%20EssenceSaude.%20Vim%20pela%20pagina%20e%20quero%20conversar%20sobre%20atendimento.
hero eyebrow: Terapias integrativas em Vitória
hero h1: Um caminho mais claro para agendar cuidado integrativo.
hero paragraph: Conceito de site para reunir pós-operatório, terapias integrativas, contato e reserva em uma página própria, fora do fluxo do feed e do booking externo.
hero image: assets/hero-essence.png
hero alt: Imagem fotográfica de uma sala de terapias integrativas sem pessoas
service cards:
  01 Pós-operatório com acompanhamento
  02 Drenagem, fisioterapia e cuidado dermatofuncional
  03 Terapias integrativas e reserva
contact phone: (27) 99779-6437
contact area: Av. João Batista Parra, 633, Praia do Suá
footer business name: EssenceSaúde
```

Keep medical wording sober. Do not include claims about accelerating cicatrization, resolving fibrosis, reducing pain or guaranteeing surgical outcomes.

- [ ] **Step 2: Create EssenceSaude CSS**

Use the existing demo CSS patterns and these variables:

```css
:root {
  --bg: #fbf7ef;
  --surface: #ffffff;
  --soft: #efe3d2;
  --ink: #233b32;
  --muted: #6f6659;
  --primary: #b85c38;
  --primary-dark: #78351f;
  --accent: #315f4b;
  --line: rgba(184, 92, 56, 0.2);
  --shadow: 0 24px 70px rgba(35, 59, 50, 0.13);
  --radius: 18px;
}
```

Use warmer spacing and a quieter hero. Avoid a one-note brown/orange page by balancing with dark green accents and white space.

- [ ] **Step 3: Create EssenceSaude WhatsApp copy**

Use:

```markdown
# Mensagem para WhatsApp

Oi, pessoal da EssenceSaúde. Tudo bem?

Sou Luiz, aqui de Vitória. Encontrei vocês pelo Instagram e pela página de reservas. Vi que a Essence já comunica terapias integrativas, pós-operatório e cuidado dermatofuncional, mas hoje a informação fica dividida entre feed, booking e diretórios.

Montei um conceito visual de como poderia ficar uma página própria para organizar os principais caminhos de atendimento e levar a pessoa direto para reserva ou WhatsApp:
{{DEMO_URL}}

Não é um site oficial de vocês, só uma ideia feita com informações públicas. Também não usei fotos do Instagram, pacientes, depoimentos ou promessa de resultado. Se fizer sentido, posso ajustar com os dados corretos e publicar no domínio de vocês. Se preferirem que eu remova, sem problema.
```

## Task 7: Build Viva Odontologia demo

**Files:**
- Create: `demos/viva-odontologia/index.html`
- Create: `demos/viva-odontologia/styles.css`
- Create: `demos/viva-odontologia/copy-whatsapp.md`

- [ ] **Step 1: Create Viva Odontologia HTML**

Create a complete static HTML page with this structure: skip link, sticky header with brand/nav/mobile menu button, hero section, short intro section, service-card grid, contact section, FAQ section, footer disclaimer and `script.js` include. Use these lead-specific values:

```text
title: Viva Odontologia | Conceito visual
theme-color: #effcff
brand mark: VO
brand text: Viva Odontologia
nav anchors: Atendimento, Informações, Contato
CTA href: tel:+552730261235
hero eyebrow: Odontologia em Santa Lúcia
hero h1: Informações odontológicas reunidas para facilitar o primeiro contato.
hero paragraph: Conceito de site para organizar telefone, localização e dados públicos da Viva Odontologia em uma página simples e fácil de abrir no celular.
hero image: assets/hero-viva-odontologia.png
hero alt: Imagem fotográfica de uma sala odontológica clara sem pessoas
service cards:
  01 Odontologia
  02 Localização em Santa Lúcia
  03 Telefone e horário em destaque
contact phone: (27) 3026-1235
contact area: Av. Nossa Sra. da Penha, 549, sala 105, Santa Lúcia
footer business name: Viva Odontologia
```

Include an FAQ item explaining that the Instagram found in the listing looked ambiguous and should be confirmed by the clinic before any official publication.

- [ ] **Step 2: Create Viva Odontologia CSS**

Use the existing demo CSS patterns and these variables:

```css
:root {
  --bg: #effcff;
  --surface: #ffffff;
  --soft: #dff7fb;
  --ink: #123d4a;
  --muted: #55717a;
  --primary: #0891b2;
  --primary-dark: #0e5f73;
  --accent: #14b8a6;
  --line: rgba(8, 145, 178, 0.18);
  --shadow: 0 24px 70px rgba(18, 61, 74, 0.13);
  --radius: 8px;
}
```

Keep it lighter and more conservative than COI. Do not claim specific dental procedures.

- [ ] **Step 3: Create Viva Odontologia WhatsApp copy**

Use:

```markdown
# Mensagem para WhatsApp

Oi, pessoal da Viva Odontologia. Tudo bem?

Sou Luiz, aqui de Vitória. Encontrei a clínica em uma listagem local com telefone e endereço, mas não achei um site próprio claro. A listagem também aponta Instagram, mas o perfil que abriu parece ser de outra cidade, então preferi não usar essa identidade no demo.

Montei um conceito visual simples para organizar as informações públicas da Viva em uma página própria:
{{DEMO_URL}}

Não é um site oficial de vocês, só uma ideia feita com informações públicas. Também não usei fotos de pacientes, equipe ou promessas de resultado. Se fizer sentido, posso ajustar com os dados corretos e publicar no domínio de vocês. Se preferirem que eu remova, sem problema.
```

## Task 8: Build CEO demo

**Files:**
- Create: `demos/ceo-clinica-especialidades-odontologicas/index.html`
- Create: `demos/ceo-clinica-especialidades-odontologicas/styles.css`
- Create: `demos/ceo-clinica-especialidades-odontologicas/copy-whatsapp.md`

- [ ] **Step 1: Create CEO HTML**

Create a complete static HTML page with this structure: skip link, sticky header with brand/nav/mobile menu button, hero section, short intro section, service-card grid, contact section, FAQ section, footer disclaimer and `script.js` include. Use these lead-specific values:

```text
title: CEO Clínica de Especialidades Odontológicas | Conceito visual
theme-color: #f2f8ff
brand mark: CEO
brand text: CEO Odontologia
nav anchors: Clínica, Agendamento, Contato
CTA href: https://wa.me/552732278122?text=Oi%2C%20CEO.%20Vim%20pela%20pagina%20e%20quero%20conversar%20sobre%20atendimento.
hero eyebrow: Especialidades odontológicas em Jardim da Penha
hero h1: Uma página direta para transformar busca local em contato.
hero paragraph: Conceito de site para reunir telefone, localização e informações públicas da CEO Clínica de Especialidades Odontológicas em um caminho simples para atendimento.
hero image: assets/hero-ceo-odontologia.png
hero alt: Imagem fotográfica de uma clínica odontológica organizada sem pessoas
service cards:
  01 Especialidades odontológicas
  02 Informações reunidas
  03 WhatsApp em destaque
contact phone: (27) 3227-8122
contact area: Pc Philogomiro Lannes, 200, Jardim da Penha
footer business name: CEO Clínica de Especialidades Odontológicas
```

Do not list specific procedures from DentMap as official services.

- [ ] **Step 2: Create CEO CSS**

Use the existing demo CSS patterns and these variables:

```css
:root {
  --bg: #f2f8ff;
  --surface: #ffffff;
  --soft: #dbeafe;
  --ink: #102a43;
  --muted: #526b81;
  --primary: #155e9f;
  --primary-dark: #0f3f68;
  --accent: #06b6d4;
  --line: rgba(21, 94, 159, 0.18);
  --shadow: 0 24px 70px rgba(16, 42, 67, 0.13);
  --radius: 8px;
}
```

Use an institutional, squared-off feel: 8px cards, strong headings and restrained color.

- [ ] **Step 3: Create CEO WhatsApp copy**

Use:

```markdown
# Mensagem para WhatsApp

Oi, pessoal da CEO Clínica de Especialidades Odontológicas. Tudo bem?

Sou Luiz, aqui de Vitória. Encontrei a clínica em diretórios locais com telefone e endereço, mas não achei um site próprio claro reunindo as informações principais.

Montei um conceito visual de como poderia ficar uma página institucional simples, com localização, contato e chamada direta para WhatsApp:
{{DEMO_URL}}

Não é um site oficial de vocês, só uma ideia feita com informações públicas. Também não usei fotos de pacientes, equipe, avaliações ou promessas de resultado. Se fizer sentido, posso ajustar com os dados corretos e publicar no domínio de vocês. Se preferirem que eu remova, sem problema.
```

## Task 9: Update demos README

**Files:**
- Modify: `demos/README.md`

- [ ] **Step 1: Add local URLs**

Add these bullets under "Acesse":

```markdown
- http://localhost:4173/demos/fisiohealth-clinica-fisioterapia-pilates/
- http://localhost:4173/demos/espaco-vitta-saude/
- http://localhost:4173/demos/essencesaude/
- http://localhost:4173/demos/viva-odontologia/
- http://localhost:4173/demos/ceo-clinica-especialidades-odontologicas/
```

- [ ] **Step 2: Keep usage rules intact**

Verify the rules section still says:

```markdown
- Os demos usam informacoes publicas.
- Os demos nao sao sites oficiais dos negocios.
- As paginas usam `noindex`.
- As imagens de ambiente sao geradas em estilo fotografico e nao copiam fotos do Instagram.
```

Expected: rules remain present and accurate.

## Task 10: Run static verification

**Files:**
- Verify: all five new `index.html`, all new `copy-whatsapp.md`, all new research notes.

- [ ] **Step 1: Parse all five HTML files**

Run:

```bash
python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path

class Parser(HTMLParser):
    pass

paths = [
    Path("demos/fisiohealth-clinica-fisioterapia-pilates/index.html"),
    Path("demos/espaco-vitta-saude/index.html"),
    Path("demos/essencesaude/index.html"),
    Path("demos/viva-odontologia/index.html"),
    Path("demos/ceo-clinica-especialidades-odontologicas/index.html"),
]
for path in paths:
    parser = Parser()
    parser.feed(path.read_text(encoding="utf-8"))
    print(f"parsed {path}")
PY
```

Expected: five `parsed ...` lines and exit 0.

- [ ] **Step 2: Verify noindex in all five files**

Run:

```bash
for slug in fisiohealth-clinica-fisioterapia-pilates espaco-vitta-saude essencesaude viva-odontologia ceo-clinica-especialidades-odontologicas; do
  rg -q '<meta name="robots" content="noindex, nofollow">' "demos/$slug/index.html" || exit 1
done
```

Expected: command exits 0.

- [ ] **Step 3: Scan for unsafe text patterns**

Run:

```bash
rg -n "garant|cura|resultado garantido|antes e depois|depoimento|avaliações|⭐|—|–|TBD|TODO" \
  demos/fisiohealth-clinica-fisioterapia-pilates \
  demos/espaco-vitta-saude \
  demos/essencesaude \
  demos/viva-odontologia \
  demos/ceo-clinica-especialidades-odontologicas \
  demos/research
```

Expected: no `TODO`, `TBD`, em dash or en dash; any match for "depoimento" must appear only as a warning or in "não usei ... depoimentos" outreach copy.

- [ ] **Step 4: Verify WhatsApp placeholders**

Run:

```bash
for slug in fisiohealth-clinica-fisioterapia-pilates espaco-vitta-saude essencesaude viva-odontologia ceo-clinica-especialidades-odontologicas; do
  rg -q '{{DEMO_URL}}' "demos/$slug/copy-whatsapp.md" || exit 1
done
```

Expected: command exits 0.

- [ ] **Step 5: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit 0.

## Task 11: Browser verification and screenshots

**Files:**
- Create/Update: all ten screenshot PNG files.

- [ ] **Step 1: Start local server**

Run:

```bash
python3 -m http.server 4173
```

Expected: server prints `Serving HTTP on :: port 4173` or equivalent. Keep it running until screenshots finish.

- [ ] **Step 2: Open each page at desktop size**

For each URL:

```text
http://localhost:4173/demos/fisiohealth-clinica-fisioterapia-pilates/
http://localhost:4173/demos/espaco-vitta-saude/
http://localhost:4173/demos/essencesaude/
http://localhost:4173/demos/viva-odontologia/
http://localhost:4173/demos/ceo-clinica-especialidades-odontologicas/
```

Use viewport `1440x1100`. Save screenshots to:

```text
demos/fisiohealth-clinica-fisioterapia-pilates/screenshot-desktop.png
demos/espaco-vitta-saude/screenshot-desktop.png
demos/essencesaude/screenshot-desktop.png
demos/viva-odontologia/screenshot-desktop.png
demos/ceo-clinica-especialidades-odontologicas/screenshot-desktop.png
```

Expected: each screenshot shows the hero, header, CTA and no broken image icon.

- [ ] **Step 3: Open each page at mobile size**

Use viewport `390x900`. Save screenshots to:

```text
demos/fisiohealth-clinica-fisioterapia-pilates/screenshot-mobile.png
demos/espaco-vitta-saude/screenshot-mobile.png
demos/essencesaude/screenshot-mobile.png
demos/viva-odontologia/screenshot-mobile.png
demos/ceo-clinica-especialidades-odontologicas/screenshot-mobile.png
```

Expected: each screenshot shows a readable hero, no clipped CTA text and no horizontal overflow.

- [ ] **Step 4: Run console, image and overflow checks**

Use Playwright or browser automation to evaluate each page with:

```js
({
  title: document.title,
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  brokenImages: [...document.images].filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src),
  robots: document.querySelector('meta[name="robots"]')?.content || "",
})
```

Expected for each page:

```text
scrollWidth <= clientWidth + 1
brokenImages.length === 0
robots === "noindex, nofollow"
no relevant console errors
```

## Task 12: Final audit and commit

**Files:**
- Stage all new demo files, research notes, README update and screenshots.

- [ ] **Step 1: Confirm complete file set**

Run:

```bash
for slug in fisiohealth-clinica-fisioterapia-pilates espaco-vitta-saude essencesaude viva-odontologia ceo-clinica-especialidades-odontologicas; do
  for file in index.html styles.css script.js copy-whatsapp.md screenshot-desktop.png screenshot-mobile.png; do
    test -f "demos/$slug/$file" || { echo "missing demos/$slug/$file"; exit 1; }
  done
done
for note in fisiohealth-clinica-fisioterapia-pilates espaco-vitta-saude essencesaude viva-odontologia ceo-clinica-especialidades-odontologicas; do
  test -f "demos/research/$note.md" || { echo "missing demos/research/$note.md"; exit 1; }
done
```

Expected: command exits 0.

- [ ] **Step 2: Review diff**

Run:

```bash
git diff --stat
git diff -- demos/README.md
```

Expected: diff only covers new demos, new research notes, screenshots/assets and README URL additions.

- [ ] **Step 3: Run final verification commands**

Run again:

```bash
git diff --check
python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path

class Parser(HTMLParser):
    pass

for path in sorted(Path("demos").glob("*/index.html")):
    if path.parts[1] in {
        "fisiohealth-clinica-fisioterapia-pilates",
        "espaco-vitta-saude",
        "essencesaude",
        "viva-odontologia",
        "ceo-clinica-especialidades-odontologicas",
    }:
        parser = Parser()
        parser.feed(path.read_text(encoding="utf-8"))
        print(f"parsed {path}")
PY
```

Expected: `git diff --check` has no output; parser prints all five new HTML paths.

- [ ] **Step 4: Commit implementation**

Run:

```bash
git add demos docs/superpowers/plans/2026-06-09-demos-novos-leads-saude.md
git commit -m "Add new health lead demos"
```

Expected: commit succeeds with new demo files included.

- [ ] **Step 5: Report status without pushing**

Run:

```bash
git status --short --branch
git log --oneline --decorate -3
```

Expected: branch is ahead of `origin/main`; no uncommitted files remain. Do not push unless Luiz explicitly asks for deploy.
