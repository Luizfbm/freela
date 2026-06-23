# Demo Visual Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable visual kit for Presenca Local demos and apply it first to the Espaco Luciene Christo demo.

**Architecture:** Keep demos static and autonomous. Add a public reusable kit under `assets/demo-kit/`, document operating rules in `docs/freelancer/demo-visual-kit.md`, enforce the contract through `tests/paperclip-automation-contract.test.mjs`, and update OZZY/Johan/Atendimento prompts plus agent capabilities.

**Tech Stack:** Static HTML/CSS/JS, JSON manifest, SVG social icons, generated JPG niche images, Node test runner, Paperclip agent sync.

---

## File Structure

Create:

- `assets/demo-kit/manifest.json`: public registry of social assets and niche images.
- `assets/demo-kit/social/README.md`: social-icon source and usage rules.
- `assets/demo-kit/social/instagram-glyph.svg`: Instagram icon asset from official or internally approved source.
- `assets/demo-kit/social/whatsapp-glyph.svg`: WhatsApp icon asset from official or internally approved source.
- `assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg`: neutral generated image for aesthetics/beauty.
- `assets/demo-kit/niches/pilates-fisioterapia/pilates-studio-hero.jpg`: neutral generated image for pilates/fisiotherapy.
- `assets/demo-kit/niches/odontologia/odontologia-consultorio-hero.jpg`: neutral generated image for dentistry.
- `assets/demo-kit/niches/laboratorio-saude/laboratorio-bancada-hero.jpg`: neutral generated image for lab/diagnostic health.
- `docs/freelancer/demo-visual-kit.md`: operating contract for visual quality, assets, fallbacks and QA.

Modify:

- `tests/paperclip-automation-contract.test.mjs`: add contract tests for kit manifest, assets and worker prompts.
- `demos/espaco-luciene-christo/index.html`: apply the kit to the pilot.
- `demos/espaco-luciene-christo/styles.css`: update Luciene palette, social buttons and hero image treatment.
- `demos/espaco-luciene-christo/README.md`: document kit image and limits.
- `docs/freelancer/prompt-thread-criacao-72h.md`: require OZZY to use the kit.
- `docs/freelancer/prompt-thread-qa-demos.md`: require Johan to QA the kit rules.
- `docs/freelancer/prompt-thread-whatsapp-atendimento.md`: require Atendimento to use approved demo-visual context, especially Luciene's card/PDF hook.
- `docs/freelancer/paperclip/agent-presenca72h.json`: mention kit usage in capabilities.
- `docs/freelancer/paperclip/agent-qa-demos.json`: mention kit QA in capabilities.
- `docs/freelancer/paperclip/agent-whatsapp-atendimento.json`: mention approved demo/link context in capabilities.

Do not modify:

- `.scratch/` as source of truth.
- CRM rows directly.
- `demos/gallery.js`, screenshots, thumbnails or `copy-whatsapp.md`.
- WhatsApp Gateway or outbox code.

---

### Task 1: Add Contract Tests First

**Files:**
- Modify: `tests/paperclip-automation-contract.test.mjs`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Add helpers near the existing prompt readers**

Add these constants after `const qaDemos = () => read("docs/freelancer/prompt-thread-qa-demos.md");`:

```js
const whatsappAtendimento = () => read("docs/freelancer/prompt-thread-whatsapp-atendimento.md");
const demoVisualKit = () => read("docs/freelancer/demo-visual-kit.md");
const demoKitManifest = () => JSON.parse(read("assets/demo-kit/manifest.json"));
```

- [ ] **Step 2: Add the manifest/assets contract test**

Add this test after `test("Demos antigas preservam sites sem artefatos operacionais", ...)`:

```js
test("Kit visual de demos declara assets seguros e reutilizaveis", () => {
  const doc = demoVisualKit();
  const manifest = demoKitManifest();

  assert.equal(manifest.version, 1);
  assert.deepEqual(Object.keys(manifest.niches).sort(), [
    "estetica-beleza",
    "laboratorio-saude",
    "odontologia",
    "pilates-fisioterapia",
  ]);

  assert.match(doc, /assets\/demo-kit\/manifest\.json/i);
  assert.match(doc, /sem rostos|sem pessoas identificaveis/i);
  assert.match(doc, /cartao virtual\/PDF|cartão virtual\/PDF/i);
  assert.match(doc, /nao copiar.*Instagram|não copiar.*Instagram/i);
  assert.match(doc, /Johan/i);
  assert.match(doc, /OZZY/i);

  for (const [name, social] of Object.entries(manifest.social)) {
    assert.match(name, /^(instagram|whatsapp)$/);
    assert.equal(existsSync(join(rootDir, social.asset)), true, social.asset);
    assert.match(social.sourceUrl, /^https:\/\/(about\.instagram\.com|www\.whatsapp\.com)\//);
    assert.match(social.usage, /oficial|aprovado/i);
  }

  for (const [slug, niche] of Object.entries(manifest.niches)) {
    assert.equal(niche.safety.facesAllowed, false, `${slug} nao permite rostos`);
    assert.equal(niche.safety.identifiablePeopleAllowed, false, `${slug} nao permite pessoas identificaveis`);
    assert.equal(niche.safety.realClientEnvironmentAllowed, false, `${slug} nao simula ambiente real`);
    assert.ok(niche.images.length >= 1, `${slug} precisa ter ao menos uma imagem`);

    for (const image of niche.images) {
      const imagePath = join(rootDir, image.path);
      assert.equal(existsSync(imagePath), true, image.path);
      assert.ok(statSync(imagePath).size > 1000, `${image.path} deve ser um asset real`);
      assert.match(image.alt, /sem rosto|sem pessoas|sem paciente|sem ambiente real/i, image.path);
    }
  }
});
```

- [ ] **Step 3: Add the worker alignment test**

Add this test near `test("Worker QA de Demos revisa exemplos antes do link ser enviado", ...)`:

```js
test("Workers de demos e atendimento usam o kit visual reutilizavel", () => {
  const criador = criacao72h();
  const qa = qaDemos();
  const atendimentoWa = whatsappAtendimento();
  const presencaAgent = agentConfig("agent-presenca72h.json");
  const qaAgent = agentConfig("agent-qa-demos.json");
  const atendimentoAgent = agentConfig("agent-whatsapp-atendimento.json");

  for (const [name, doc] of [
    ["Criador Presenca 72h", criador],
    ["QA de Demos", qa],
  ]) {
    assert.match(doc, /docs\/freelancer\/demo-visual-kit\.md/i, name);
    assert.match(doc, /assets\/demo-kit\/manifest\.json/i, name);
    assert.match(doc, /sem rostos|sem pessoas identificaveis/i, name);
    assert.match(doc, /icones oficiais|ícones oficiais|asset oficial|asset aprovado/i, name);
    assert.match(doc, /paleta.*Instagram|Instagram.*paleta/i, name);
  }

  assert.match(atendimentoWa, /docs\/freelancer\/demo-visual-kit\.md/i);
  assert.match(atendimentoWa, /cartao virtual\/PDF|cartão virtual\/PDF/i);
  assert.match(atendimentoWa, /Luciene/i);
  assert.match(atendimentoWa, /Outbox/i);
  assert.match(atendimentoWa, /Guardiao|Guardião/i);

  assert.match(presencaAgent.capabilities, /demo-visual-kit|kit visual/i);
  assert.match(qaAgent.capabilities, /demo-visual-kit|kit visual/i);
  assert.match(atendimentoAgent.capabilities, /demo aprovada|kit visual|cartao virtual|cartão virtual/i);
});
```

- [ ] **Step 4: Run the focused test and confirm it fails for missing kit files**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL because `docs/freelancer/demo-visual-kit.md` and/or `assets/demo-kit/manifest.json` do not exist yet.

---

### Task 2: Add Kit Manifest, Social Assets and Operating Doc

**Files:**
- Create: `assets/demo-kit/manifest.json`
- Create: `assets/demo-kit/social/README.md`
- Create: `assets/demo-kit/social/instagram-glyph.svg`
- Create: `assets/demo-kit/social/whatsapp-glyph.svg`
- Create: `docs/freelancer/demo-visual-kit.md`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Create directories**

Run:

```bash
mkdir -p assets/demo-kit/social \
  assets/demo-kit/niches/estetica-beleza \
  assets/demo-kit/niches/pilates-fisioterapia \
  assets/demo-kit/niches/odontologia \
  assets/demo-kit/niches/laboratorio-saude
```

- [ ] **Step 2: Add `assets/demo-kit/manifest.json`**

Use this exact starting structure:

```json
{
  "version": 1,
  "lastUpdated": "2026-06-23",
  "rules": {
    "facesAllowed": false,
    "identifiablePeopleAllowed": false,
    "realClientEnvironmentAllowed": false,
    "privateClientAssetsAllowed": false
  },
  "social": {
    "instagram": {
      "label": "Instagram",
      "asset": "assets/demo-kit/social/instagram-glyph.svg",
      "sourceUrl": "https://about.instagram.com/brand",
      "usage": "asset oficial ou aprovado internamente; manter forma, proporcao e texto no botao"
    },
    "whatsapp": {
      "label": "WhatsApp",
      "asset": "assets/demo-kit/social/whatsapp-glyph.svg",
      "sourceUrl": "https://www.whatsapp.com/legal",
      "usage": "asset oficial ou aprovado internamente; manter forma, proporcao e texto no botao"
    }
  },
  "niches": {
    "estetica-beleza": {
      "label": "Estetica e beleza",
      "defaultImage": "assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg",
      "safety": {
        "facesAllowed": false,
        "identifiablePeopleAllowed": false,
        "realClientEnvironmentAllowed": false
      },
      "images": [
        {
          "path": "assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg",
          "alt": "Imagem neutra de bancada de estetica e beleza, sem rosto, sem pessoas e sem ambiente real do cliente",
          "source": "AI-generated neutral concept image"
        }
      ]
    },
    "pilates-fisioterapia": {
      "label": "Pilates e fisioterapia",
      "defaultImage": "assets/demo-kit/niches/pilates-fisioterapia/pilates-studio-hero.jpg",
      "safety": {
        "facesAllowed": false,
        "identifiablePeopleAllowed": false,
        "realClientEnvironmentAllowed": false
      },
      "images": [
        {
          "path": "assets/demo-kit/niches/pilates-fisioterapia/pilates-studio-hero.jpg",
          "alt": "Imagem neutra de studio de pilates e fisioterapia, sem rosto, sem pessoas e sem paciente",
          "source": "AI-generated neutral concept image"
        }
      ]
    },
    "odontologia": {
      "label": "Odontologia",
      "defaultImage": "assets/demo-kit/niches/odontologia/odontologia-consultorio-hero.jpg",
      "safety": {
        "facesAllowed": false,
        "identifiablePeopleAllowed": false,
        "realClientEnvironmentAllowed": false
      },
      "images": [
        {
          "path": "assets/demo-kit/niches/odontologia/odontologia-consultorio-hero.jpg",
          "alt": "Imagem neutra de consultorio odontologico, sem rosto, sem pessoas e sem paciente",
          "source": "AI-generated neutral concept image"
        }
      ]
    },
    "laboratorio-saude": {
      "label": "Laboratorio e saude diagnostica",
      "defaultImage": "assets/demo-kit/niches/laboratorio-saude/laboratorio-bancada-hero.jpg",
      "safety": {
        "facesAllowed": false,
        "identifiablePeopleAllowed": false,
        "realClientEnvironmentAllowed": false
      },
      "images": [
        {
          "path": "assets/demo-kit/niches/laboratorio-saude/laboratorio-bancada-hero.jpg",
          "alt": "Imagem neutra de bancada de laboratorio e saude diagnostica, sem rosto, sem pessoas e sem paciente",
          "source": "AI-generated neutral concept image"
        }
      ]
    }
  }
}
```

- [ ] **Step 3: Add social README**

Create `assets/demo-kit/social/README.md` with:

```md
# Social icons for demo kit

These files are public demo assets for Presenca Local pages.

Rules:

- Use Instagram and WhatsApp marks only as social/contact affordances.
- Keep text labels in buttons, for example "Ver Instagram" and "Chamar no WhatsApp".
- Do not imply sponsorship, endorsement or affiliation.
- Do not download replacements from random icon sites.
- If an official asset must be replaced, record the source URL in `assets/demo-kit/manifest.json`.

References:

- Instagram Brand Refresh: https://about.instagram.com/brand
- WhatsApp Legal Resources: https://www.whatsapp.com/legal
```

- [ ] **Step 4: Add SVG assets**

Add the current approved SVGs to:

- `assets/demo-kit/social/instagram-glyph.svg`
- `assets/demo-kit/social/whatsapp-glyph.svg`

Use internally approved simple glyphs for this iteration. If official SVGs are obtained directly from Meta/WhatsApp, replace these files unchanged and update only `sourceUrl`/notes.

`assets/demo-kit/social/instagram-glyph.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="instagram-title" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9">
  <title id="instagram-title">Instagram</title>
  <rect x="3" y="3" width="18" height="18" rx="5.2"/>
  <circle cx="12" cy="12" r="4.1"/>
  <circle cx="17.25" cy="6.75" r="1.1" fill="currentColor" stroke="none"/>
</svg>
```

`assets/demo-kit/social/whatsapp-glyph.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="whatsapp-title" fill="currentColor">
  <title id="whatsapp-title">WhatsApp</title>
  <path d="M20.47 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.31-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89a11.82 11.82 0 0 0-3.48-8.42Zm-8.42 18.29h-.01a9.88 9.88 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35Z"/>
</svg>
```

- [ ] **Step 5: Add operating documentation**

Create `docs/freelancer/demo-visual-kit.md` with sections:

```md
# Kit visual para demos Presenca Local

## Objetivo

Usar um padrao pequeno para demos parecerem feitas para o cliente, sem copiar fotos, posts, artes, logos ou dados privados.

## Uso por OZZY

1. Leia o brief e o Bio Evidence Pack.
2. Separe fatos publicos de dados a confirmar.
3. Escolha o nicho em `assets/demo-kit/manifest.json`.
4. Defina paleta inspirada no Instagram publico, sem copiar arte.
5. Use imagem segura do kit: sem rostos, sem pessoas identificaveis, sem paciente e sem simular ambiente real.
6. Use botoes sociais com texto e icones oficiais/aprovados.
7. Registre fallback quando a paleta, imagem ou dado comercial nao for confiavel.

## Uso por Johan

Bloqueie ou devolva para ajuste quando houver rosto, paciente, equipe, ambiente real simulado, promessa clinica/estetica, copia de Instagram, iconografia de fonte aleatoria, dado oficial nao confirmado ou mobile quebrado.

## Uso por Atendimento WhatsApp

Quando uma demo aprovada for mencionada no WhatsApp, use apenas o gancho aprovado pela demo e pelo QA. Para Luciene, o gancho seguro e que a pagina simplifica o caminho que hoje passa por cartao virtual/PDF, deixando tratamentos, regiao e primeiro contato mais claros.

Atendimento continua sem enviar WhatsApp diretamente. Toda mensagem passa por Outbox, Humanizer, Guardiao e Gateway.

## Fallbacks

- Sem paleta confiavel: usar paleta neutra do nicho.
- Sem icone oficial/aprovado: usar botao textual e registrar lacuna.
- Sem imagem do nicho: usar imagem conceitual neutra e registrar no manifest.
- Dado comercial duvidoso: remover ou marcar como "a confirmar".
```

- [ ] **Step 6: Run tests and confirm only image assets are still missing**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL only for missing JPG files referenced by the manifest.

---

### Task 3: Generate and Verify Niche Images

**Files:**
- Create: `assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg`
- Create: `assets/demo-kit/niches/pilates-fisioterapia/pilates-studio-hero.jpg`
- Create: `assets/demo-kit/niches/odontologia/odontologia-consultorio-hero.jpg`
- Create: `assets/demo-kit/niches/laboratorio-saude/laboratorio-bancada-hero.jpg`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Generate aesthetics/beauty image**

Use image generation with this prompt and save the result as `assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg`:

```text
Photorealistic editorial image of an empty aesthetics and beauty clinic counter in Brazil, clean warm lighting, skincare tools and soft towels, rose and plum accents, no people, no faces, no hands, no logos, no text, no brand names, no before-and-after, professional but not luxury hotel style, horizontal hero image.
```

- [ ] **Step 2: Generate pilates/fisiotherapy image**

Use image generation with this prompt and save the result as `assets/demo-kit/niches/pilates-fisioterapia/pilates-studio-hero.jpg`:

```text
Photorealistic editorial image of an empty pilates and physiotherapy studio, reformer equipment and therapy mat visible, natural daylight, clean local clinic atmosphere, no people, no faces, no patients, no logos, no text, no medical claims, horizontal hero image.
```

- [ ] **Step 3: Generate dentistry image**

Use image generation with this prompt and save the result as `assets/demo-kit/niches/odontologia/odontologia-consultorio-hero.jpg`:

```text
Photorealistic editorial image of an empty dental treatment room, clean dental chair and organized instruments, soft blue and white tones, no people, no faces, no patient, no logos, no text, no before-and-after, horizontal hero image.
```

- [ ] **Step 4: Generate lab/diagnostic health image**

Use image generation with this prompt and save the result as `assets/demo-kit/niches/laboratorio-saude/laboratorio-bancada-hero.jpg`:

```text
Photorealistic editorial image of a clean diagnostic laboratory bench with generic tubes and equipment, bright clinical lighting, teal and white accents, no people, no faces, no patient samples with labels, no logos, no text, horizontal hero image.
```

- [ ] **Step 5: Inspect images visually**

Use `view_image` or local preview for each generated image.

Expected: no faces, no people, no readable labels, no logos, no medical before/after.

- [ ] **Step 6: Verify file existence and manifest test**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: the new kit manifest test passes. Other existing tests must still pass.

- [ ] **Step 7: Commit the kit foundation**

Run:

```bash
git add tests/paperclip-automation-contract.test.mjs assets/demo-kit docs/freelancer/demo-visual-kit.md
git commit -m "Add reusable demo visual kit"
```

---

### Task 4: Apply the Kit to Luciene Pilot

**Files:**
- Modify: `demos/espaco-luciene-christo/index.html`
- Modify: `demos/espaco-luciene-christo/styles.css`
- Modify: `demos/espaco-luciene-christo/README.md`
- Test: local static validation and `node --check demos/espaco-luciene-christo/script.js`

- [ ] **Step 1: Update hero image and social button markup**

In `demos/espaco-luciene-christo/index.html`, replace the hero image source:

```html
<img src="../../assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg" alt="Imagem neutra de bancada de estetica e beleza, sem rosto, sem pessoas e sem representar o espaco real">
```

Update social/action buttons to include icons:

```html
<a class="button primary" href="#contato">
  <img class="social-icon" src="../../assets/demo-kit/social/whatsapp-glyph.svg" alt="" aria-hidden="true">
  <span>Chamar no WhatsApp</span>
</a>
<a class="button secondary" href="https://www.instagram.com/lucienechristo/" target="_blank" rel="noopener noreferrer">
  <img class="social-icon" src="../../assets/demo-kit/social/instagram-glyph.svg" alt="" aria-hidden="true">
  <span>Ver Instagram</span>
</a>
```

Keep `href="#contato"` for WhatsApp until the public WhatsApp is confirmed.

- [ ] **Step 2: Strengthen Luciene copy around the card/PDF hook**

Update the hero h1 to:

```html
<h1>Do perfil ao atendimento, sem depender de cartao ou PDF.</h1>
```

Update the hero paragraph to:

```html
<p>Conceito visual para organizar tratamentos, regiao e primeiro contato do Espaco Luciene Christo em uma pagina simples, com caminho mais claro do que abrir varios links no cartao virtual.</p>
```

Update the contact section paragraph to:

```html
<p>A proposta e reduzir a friccao do cartao virtual/PDF: a pessoa entende os tratamentos, ve a regiao e sabe qual caminho seguir antes de chamar.</p>
```

- [ ] **Step 3: Update Luciene palette and social button CSS**

In `demos/espaco-luciene-christo/styles.css`, update root variables to a less generic aesthetics palette:

```css
:root {
  --bg: #fff7f4;
  --surface: #fffdfb;
  --soft: #f4e3df;
  --ink: #2d252c;
  --muted: #715f6b;
  --primary: #7a4d73;
  --primary-dark: #2f2530;
  --accent: #c45f78;
  --accent-soft: #f6d8df;
  --rose: #a94465;
  --whatsapp: #25d366;
  --instagram: #c13584;
  --line: rgba(47, 37, 48, 0.15);
  --shadow: 0 24px 70px rgba(84, 43, 72, 0.14);
}
```

Add social icon styling:

```css
.social-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  object-fit: contain;
}

.button,
.nav-cta {
  gap: 9px;
}
```

Keep text readable and avoid negative letter spacing.

- [ ] **Step 4: Update README**

In `demos/espaco-luciene-christo/README.md`, replace the old asset line:

```md
- `assets/presenca-local-conceito.jpg`
```

with:

```md
- imagem segura do kit visual: `../../assets/demo-kit/niches/estetica-beleza/estetica-bancada-hero.jpg`
```

Add under "Limites da demonstracao":

```md
- A imagem do kit e gerada/neutra, sem rosto, sem paciente, sem equipe e sem representar o espaco real.
- A paleta foi inspirada no clima publico do Instagram, sem copiar post, foto, arte ou logo.
```

- [ ] **Step 5: Run static validation**

Run:

```bash
node --check demos/espaco-luciene-christo/script.js
node --test tests/paperclip-automation-contract.test.mjs
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Serve and smoke-test Luciene locally**

Run:

```bash
python3 -m http.server 4173
```

Open:

```text
http://127.0.0.1:4173/demos/espaco-luciene-christo/
```

Verify:

- no broken hero image;
- Instagram icon appears;
- WhatsApp icon appears;
- WhatsApp button does not use unconfirmed phone;
- mobile layout has no obvious overlap or overflow;
- no private CRM data appears.

Stop the server before continuing.

- [ ] **Step 7: Commit the Luciene pilot**

Run:

```bash
git add demos/espaco-luciene-christo
git commit -m "Apply visual kit to Luciene demo"
```

---

### Task 5: Align Workers and Paperclip Agent Capabilities

**Files:**
- Modify: `docs/freelancer/prompt-thread-criacao-72h.md`
- Modify: `docs/freelancer/prompt-thread-qa-demos.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
- Modify: `docs/freelancer/paperclip/agent-presenca72h.json`
- Modify: `docs/freelancer/paperclip/agent-qa-demos.json`
- Modify: `docs/freelancer/paperclip/agent-whatsapp-atendimento.json`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Update OZZY prompt**

In `docs/freelancer/prompt-thread-criacao-72h.md`, add `docs/freelancer/demo-visual-kit.md` to "Documentos que você deve usar como base".

Add this section before "Estrutura recomendada da página":

```md
Kit visual obrigatorio:

- Leia `docs/freelancer/demo-visual-kit.md` antes de criar ou ajustar demos.
- Use `assets/demo-kit/manifest.json` para escolher imagem segura por nicho quando houver asset adequado.
- A paleta deve ser inspirada no Instagram publico do cliente, sem copiar foto, post, arte, logo ou captura.
- Imagens devem evitar rostos, pessoas identificaveis, pacientes, equipe, antes/depois e simulacao do ambiente real do cliente.
- Botoes de Instagram e WhatsApp devem ter texto claro e usar icones oficiais/aprovados quando disponiveis.
- Se faltar paleta confiavel, icone aprovado ou imagem do nicho, use fallback documentado e registre a limitacao no README publico da demo.
```

- [ ] **Step 2: Update Johan QA prompt**

In `docs/freelancer/prompt-thread-qa-demos.md`, add `docs/freelancer/demo-visual-kit.md` to "Documentos base".

Add these bullets under `5. Tecnico e visual`:

```md
   - Verificar `docs/freelancer/demo-visual-kit.md` e `assets/demo-kit/manifest.json` quando a demo usar assets do kit.
   - Verificar que a imagem do kit pertence ao nicho correto e nao mostra rosto, paciente, equipe, pessoa identificavel, antes/depois ou ambiente real simulado.
   - Verificar que a paleta parece inspirada no Instagram publico, mas nao copia post, foto, arte, logo ou captura.
   - Verificar que botoes de Instagram e WhatsApp tem texto acessivel e icones oficiais/aprovados quando houver icone.
```

- [ ] **Step 3: Update Atendimento WhatsApp prompt**

In `docs/freelancer/prompt-thread-whatsapp-atendimento.md`, add this under "Demo ja aprovada":

```md
Contexto visual aprovado:

- Quando a demo usar o kit visual, consulte `docs/freelancer/demo-visual-kit.md` para manter o gancho seguro.
- Para Espaco Luciene Christo/Luciene, o gancho aprovado e que a pagina reduz a dependencia do cartao virtual/PDF e deixa tratamentos, regiao e primeiro contato mais claros.
- Nao envie o link do cartao/PDF, nao copie conteudo do PDF e nao prometa resultado.
```

- [ ] **Step 4: Update agent capabilities**

Update `docs/freelancer/paperclip/agent-presenca72h.json` capabilities to include:

```text
usa docs/freelancer/demo-visual-kit.md e assets/demo-kit/manifest.json para paleta inspirada no Instagram, imagens seguras por nicho e botoes sociais com icones oficiais/aprovados
```

Update `docs/freelancer/paperclip/agent-qa-demos.json` capabilities to include:

```text
revisa o kit visual, imagens sem rostos/pacientes, paleta inspirada sem copiar Instagram e botoes sociais com icones oficiais/aprovados
```

Update `docs/freelancer/paperclip/agent-whatsapp-atendimento.json` capabilities to include:

```text
usa contexto de demo aprovada e kit visual; para Luciene preserva o gancho do cartao virtual/PDF sem enviar PDF nem sair do fluxo Outbox/Guardiao/Gateway
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Sync Paperclip agents**

Run:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected: dry-run shows safe capability patches for OZZY, Johan and Atendimento WhatsApp only, unless another intentional local change exists.

Then run:

```bash
node scripts/paperclip-sync-agents.mjs --apply
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected: final dry-run has no remaining unexpected changes.

- [ ] **Step 7: Commit worker alignment**

Run:

```bash
git add docs/freelancer/prompt-thread-criacao-72h.md \
  docs/freelancer/prompt-thread-qa-demos.md \
  docs/freelancer/prompt-thread-whatsapp-atendimento.md \
  docs/freelancer/paperclip/agent-presenca72h.json \
  docs/freelancer/paperclip/agent-qa-demos.json \
  docs/freelancer/paperclip/agent-whatsapp-atendimento.json
git commit -m "Align workers with demo visual kit"
```

---

### Task 6: Final Verification and Push

**Files:**
- Verify all touched files

- [ ] **Step 1: Run focused checks**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
node --check demos/espaco-luciene-christo/script.js
node -e 'JSON.parse(require("fs").readFileSync("assets/demo-kit/manifest.json", "utf8")); console.log("manifest ok")'
git diff --check
```

Expected: all pass and `manifest ok` prints.

- [ ] **Step 2: Confirm worktree and commits**

Run:

```bash
git -c core.fsmonitor=false status --short --branch
git log --oneline --max-count=6
```

Expected: branch is ahead of `origin/main` by the new implementation commits, with no unstaged changes.

- [ ] **Step 3: Push to origin/main**

Run:

```bash
git push origin main
```

If rejected because remote advanced, run:

```bash
git fetch origin main
git rebase origin/main
node --test tests/paperclip-automation-contract.test.mjs
git push origin main
```

- [ ] **Step 4: Final status**

Run:

```bash
git -c core.fsmonitor=false status --short --branch
```

Expected: `## main...origin/main`.
