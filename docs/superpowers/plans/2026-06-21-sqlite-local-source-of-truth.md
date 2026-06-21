# SQLite Local Source Of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the official Freelancer/Paperclip SQLite source of truth out of the sync/offload-prone `Documents` tree and make the migration repeatable, validated, and reversible.

**Architecture:** The physical database directory will live at `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db`, which is local application data rather than a synced project folder. The existing path `/Users/luiz_fbm/Documents/programacao/freela/.scratch/db` remains the compatibility entrypoint as a symlink to the local directory, so current scripts keep using `.scratch/db/freela.sqlite`. A tested localizer script performs snapshot, checkpoint, copy, validation, atomic switch, and post-migration healthcheck.

**Tech Stack:** Node.js ESM, `node:test`, `node:sqlite` `DatabaseSync`, macOS filesystem/symlink semantics, SQLite `pragma integrity_check` and `wal_checkpoint`.

---

## File Structure

- Create: `scripts/freela-sqlite-localize.mjs`
  - One-purpose operational script for localizing `.scratch/db`.
  - It must be idempotent and fail closed.
  - It must never delete the original DB directory.
- Modify: `tests/freela-crm-cli.test.mjs`
  - Add tests for symlinked DB operation and localizer behavior.
- Modify: `docs/freelancer/data-contract.md`
  - Define `.scratch/db/freela.sqlite` as compatibility path and `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite` as physical local source.
- Modify: `docs/freelancer/paperclip/README.md`
  - Update Paperclip operator instructions so agents know not to treat `.scratch/db` as a physical data directory after migration.
- Modify: `docs/freelancer/prompt-thread-*.md` and `docs/freelancer/checklist-entrega.md`
  - Any prompt that names `.scratch/db/freela.sqlite` must mention it is the compatibility path and that all writes still go through `node scripts/freela-crm.mjs`.
- Modify: `tests/paperclip-automation-contract.test.mjs`
  - Add contract assertions that Paperclip instructions describe the physical DB location, compatibility symlink, and mandatory CLI access.
- Runtime/private outputs only:
  - `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db`
  - `/Users/luiz_fbm/Documents/programacao/freela/.scratch/forensics/sqlite-localize-<timestamp>`
  - `/Users/luiz_fbm/Documents/programacao/freela/.scratch/db` symlink

No private data goes into `docs/`, `demos/`, or `outputs/`.

## Task 1: Add Localizer Regression Tests First

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Create later: `scripts/freela-sqlite-localize.mjs`

- [ ] **Step 1: Add imports for symlink assertions**

Change the `node:fs` import in `tests/freela-crm-cli.test.mjs` to include:

```js
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
```

- [ ] **Step 2: Add a localizer path constant**

Near the existing `cli` and `crm` constants, add:

```js
const localizer = join(repoRoot, "scripts/freela-sqlite-localize.mjs");
```

- [ ] **Step 3: Add the failing test**

Add this test after the existing SQLite health/backup tests:

```js
test("sqlite localizer moves official DB to local app data and leaves compatibility symlink", () => {
  const root = makeRoot();
  const target = join(root, "local-app-support/freela-paperclip/db");

  assert.equal(run(root, ["init"]).status, 0);
  const leadFile = writeJson(root, "localize-lead.json", [
    {
      canonical_name: "Localizer Lead",
      city: "Vitoria",
      phone_or_contact: "27 99999-7777",
      recommended_offer: "Presenca Local em 72h",
    },
  ]);
  assert.equal(run(root, ["lead", "upsert", "--file", leadFile]).status, 0);

  const result = runNode([localizer, "--root", root, "--target-dir", target]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SQLite localizado: ok/i);
  assert.equal(lstatSync(join(root, ".scratch/db")).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(root, ".scratch/db")), target);
  assert.equal(existsSync(join(target, "freela.sqlite")), true);

  const health = run(root, ["healthcheck"]);
  assert.equal(health.status, 0, health.stderr);
  assert.match(health.stdout, /integrity_check: ok/i);

  const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"), { readOnly: true });
  assert.equal(
    database.prepare("select count(*) as count from leads where canonical_name = ?").get("Localizer Lead").count,
    1,
  );
  database.close();

  const snapshots = readdirSync(join(root, ".scratch/forensics")).filter((name) =>
    name.startsWith("sqlite-localize-"),
  );
  assert.equal(snapshots.length, 1);
  assert.equal(existsSync(join(root, ".scratch/forensics", snapshots[0], "original-db/freela.sqlite")), true);
});
```

- [ ] **Step 4: Verify RED**

Run:

```bash
node --test --test-name-pattern 'sqlite localizer' tests/freela-crm-cli.test.mjs
```

Expected: FAIL because `scripts/freela-sqlite-localize.mjs` does not exist.

## Task 2: Implement The Localizer Script

**Files:**
- Create: `scripts/freela-sqlite-localize.mjs`
- Test: `tests/freela-crm-cli.test.mjs`

- [ ] **Step 1: Create the executable script**

Create `scripts/freela-sqlite-localize.mjs` with:

```js
#!/usr/bin/env node
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_TARGET_DIR = "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db";

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = resolve(flags.root ?? process.cwd());
  const sourceDir = join(root, ".scratch/db");
  const sourceDb = join(sourceDir, "freela.sqlite");
  const targetDir = resolve(flags["target-dir"] ?? DEFAULT_TARGET_DIR);
  const targetDb = join(targetDir, "freela.sqlite");

  if (existsSync(sourceDir) && lstatSync(sourceDir).isSymbolicLink()) {
    const currentTarget = readlinkSync(sourceDir);
    if (resolve(dirname(sourceDir), currentTarget) !== targetDir && currentTarget !== targetDir) {
      throw new Error(`.scratch/db ja e symlink para outro destino: ${currentTarget}`);
    }
    validateDatabase(targetDb);
    console.log(`SQLite localizado: ok (${targetDb})`);
    return;
  }

  if (!existsSync(sourceDb)) {
    throw new Error(`SQLite oficial nao encontrado em ${sourceDb}`);
  }

  validateDatabase(sourceDb);
  checkpoint(sourceDb);
  validateDatabase(sourceDb);

  const snapshotDir = join(root, ".scratch/forensics", `sqlite-localize-${timestampForFile()}`);
  mkdirSync(join(snapshotDir, "original-db"), { recursive: true });
  cpSync(sourceDir, join(snapshotDir, "original-db"), { recursive: true, preserveTimestamps: true });
  writeFileSync(
    join(snapshotDir, "metadata.txt"),
    `created_at=${new Date().toISOString()}\nsource=${sourceDir}\ntarget=${targetDir}\n`,
    "utf8",
  );

  mkdirSync(dirname(targetDir), { recursive: true });
  const stagingDir = `${targetDir}.staging-${process.pid}-${timestampForFile()}`;
  rmSync(stagingDir, { recursive: true, force: true });
  cpSync(sourceDir, stagingDir, { recursive: true, preserveTimestamps: true });
  validateDatabase(join(stagingDir, "freela.sqlite"));

  if (existsSync(targetDir)) {
    const existingArchive = `${targetDir}.previous-${timestampForFile()}`;
    renameSync(targetDir, existingArchive);
  }
  renameSync(stagingDir, targetDir);
  validateDatabase(targetDb);

  const archivedSource = join(snapshotDir, "documents-db-after-copy");
  renameSync(sourceDir, archivedSource);
  symlinkSync(targetDir, sourceDir, "dir");
  validateDatabase(sourceDb);

  const stat = statSync(targetDb);
  console.log(`SQLite localizado: ok (${targetDb})`);
  console.log(`Snapshot forense: ${snapshotDir}`);
  console.log(`Target size=${stat.size} blocks=${stat.blocks ?? "unknown"}`);
}

function parseFlags(args) {
  const flags = {};
  const rest = [...args];
  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw new Error(`Opcao invalida: ${token}`);
    const key = token.slice(2);
    const value = rest.shift();
    if (!value || value.startsWith("--")) throw new Error(`Valor obrigatorio para --${key}`);
    flags[key] = value;
  }
  return flags;
}

function validateDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 10000;");
    const result = db.prepare("pragma integrity_check").get().integrity_check;
    if (result !== "ok") throw new Error(`integrity_check=${result}`);
  } finally {
    db.close();
  }
}

function checkpoint(path) {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout = 10000;");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  } finally {
    db.close();
  }
}

function timestampForFile() {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.hrtime.bigint().toString(36)}`;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
```

- [ ] **Step 2: Make the script executable**

Run:

```bash
chmod +x scripts/freela-sqlite-localize.mjs
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
node --test --test-name-pattern 'sqlite localizer' tests/freela-crm-cli.test.mjs
```

Expected: PASS.

## Task 3: Update Paperclip Operational Contract

**Files:**
- Modify: `tests/paperclip-automation-contract.test.mjs`
- Modify: `docs/freelancer/data-contract.md`
- Modify: `docs/freelancer/paperclip/README.md`
- Modify: prompt docs under `docs/freelancer/`

- [ ] **Step 1: Add the failing Paperclip contract test**

Add this test near the existing data-contract/Paperclip worker contract tests in `tests/paperclip-automation-contract.test.mjs`:

```js
test("Paperclip instructions know SQLite physical path and compatibility symlink", () => {
  const dataContract = read("docs/freelancer/data-contract.md");
  const paperclipReadme = read("docs/freelancer/paperclip/README.md");

  for (const doc of [dataContract, paperclipReadme]) {
    assert.match(doc, /Application Support\/freela-paperclip\/db\/freela\.sqlite/i);
    assert.match(doc, /\.scratch\/db\/freela\.sqlite/i);
    assert.match(doc, /compatibilidade|symlink/i);
    assert.match(doc, /node scripts\/freela-crm\.mjs/i);
  }

  const promptFiles = [
    "docs/freelancer/prompt-thread-atendimento-clientes.md",
    "docs/freelancer/prompt-thread-ceo-prospeccao.md",
    "docs/freelancer/prompt-thread-coo-freelancer.md",
    "docs/freelancer/prompt-thread-criacao-72h.md",
    "docs/freelancer/prompt-thread-diagnostico-3-pontos.md",
    "docs/freelancer/prompt-thread-followup-crm.md",
    "docs/freelancer/prompt-thread-intake-conversas.md",
    "docs/freelancer/prompt-thread-prospeccao-leads.md",
    "docs/freelancer/prompt-thread-qa-demos.md",
    "docs/freelancer/prompt-thread-qa-mensagens.md",
    "docs/freelancer/prompt-thread-redator-primeira-mensagem.md",
    "docs/freelancer/prompt-thread-validador-dados-leads.md",
    "docs/freelancer/checklist-entrega.md",
  ];

  for (const file of promptFiles) {
    const prompt = read(file);
    assert.match(prompt, /\.scratch\/db\/freela\.sqlite/i, file);
    assert.match(prompt, /compatibilidade|symlink|data-contract/i, file);
  }
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --test-name-pattern 'Paperclip instructions know SQLite physical path' tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL because the docs still describe only `.scratch/db/freela.sqlite`.

- [ ] **Step 3: Update `docs/freelancer/data-contract.md`**

Replace the current "Fonte de Verdade" path block with:

```markdown
## Fonte de Verdade

A fonte de verdade operacional e o SQLite privado acessado pela CLI.

Caminho de compatibilidade usado por scripts e workers:

```txt
.scratch/db/freela.sqlite
```

Na instancia local principal, esse caminho deve ser um symlink para o arquivo fisico local, fora de `Documents` e fora de storage sincronizado/offloadavel:

```txt
/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite
```

Workers devem tratar `.scratch/db/freela.sqlite` como ponto de acesso estavel, nao como garantia de diretorio fisico. Nao mover, copiar, restaurar ou recriar o SQLite manualmente. Toda escrita de estado deve passar pela CLI:

```bash
node scripts/freela-crm.mjs <comando>
```

Antes de operar em caso de duvida, rode:

```bash
node scripts/freela-crm.mjs healthcheck
```
```

- [ ] **Step 4: Update `docs/freelancer/paperclip/README.md`**

In `## Consistencia de dados`, replace the existing source-of-truth bullets with:

```markdown
- Contrato oficial: `docs/freelancer/data-contract.md`.
- Fonte de verdade local: SQLite acessado por `.scratch/db/freela.sqlite`.
- Na instancia local principal, `.scratch/db` deve ser symlink para `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db`.
- Workers devem usar sempre `node scripts/freela-crm.mjs`; nao devem mover, copiar, restaurar ou recriar o SQLite manualmente.
- Verificacao obrigatoria quando houver duvida: `node scripts/freela-crm.mjs healthcheck`.
- Espelhos como `.scratch/leads/master-leads.csv` e `.scratch/crm/pipeline.md` sao gerados pela CLI.
- Workers nao devem editar arquivos em `.scratch` manualmente como fonte oficial de estado.
- Issues do Paperclip coordenam trabalho; elas nao substituem o SQLite como memoria operacional.
```

Also replace the later sentence:

```markdown
`commercial export` gera `.scratch/crm/commercial-funnel.md` e `.scratch/ops/commercial-status.md`. Esses arquivos sao espelhos privados; a fonte oficial continua sendo as views do SQLite em `.scratch/db/freela.sqlite`.
```

with:

```markdown
`commercial export` gera `.scratch/crm/commercial-funnel.md` e `.scratch/ops/commercial-status.md`. Esses arquivos sao espelhos privados; a fonte oficial continua sendo as views do SQLite acessadas pela CLI em `.scratch/db/freela.sqlite`, caminho de compatibilidade que aponta para o DB fisico local.
```

- [ ] **Step 5: Update agent prompt docs**

For every file under `docs/freelancer/` that currently says SQLite lives at `.scratch/db/freela.sqlite`, replace that sentence with this exact wording:

```markdown
- SQLite oficial acessado pela CLI em `.scratch/db/freela.sqlite`; na instancia local principal esse caminho e compatibilidade/symlink para `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite`. Nunca mover/copiar/restaurar o DB manualmente; use `node scripts/freela-crm.mjs` e `node scripts/freela-crm.mjs healthcheck`.
```

Then verify no stale wording remains:

```bash
rg -n "SQLite em `\\.scratch/db/freela\\.sqlite`|fonte de verdade operacional" docs/freelancer
```

Expected: no stale source-location wording. Mentions that explicitly describe compatibility are allowed.

- [ ] **Step 6: Verify Paperclip contract GREEN**

Run:

```bash
node --test --test-name-pattern 'Paperclip instructions know SQLite physical path' tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Check whether live Paperclip agent sync is needed**

Run dry-run:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run \
  --company-id 50a2756c-2942-40c1-90f8-b16807a62ef3 \
  --api-base http://127.0.0.1:3100
```

Expected: JSON audit report. If only prompt `.md` files changed and agent JSON is unchanged, no live agent patch may be needed because agents load `adapterConfig.instructionsFilePath` from the repo at run time.

- [ ] **Step 8: Apply live Paperclip sync if agent JSON/capabilities changed**

Only if the dry-run reports changed agents, run:

```bash
node scripts/paperclip-sync-agents.mjs --apply \
  --company-id 50a2756c-2942-40c1-90f8-b16807a62ef3 \
  --api-base http://127.0.0.1:3100
```

Expected: Paperclip local at `http://127.0.0.1:3100` has updated agent metadata/instructions paths. If this command fails, stop and do not proceed to migration until the live Paperclip config is understood.

## Task 4: Run The Full Automated Validation Before Touching The Real DB

**Files:**
- Read/execute only.

- [ ] **Step 1: Run CRM tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check scripts/freela-crm.mjs scripts/freela-sqlite-localize.mjs scripts/paperclip-sync-agents.mjs scripts/whatsapp-local-gateway.mjs
```

Expected: exit 0.

- [ ] **Step 3: Verify the current official DB still opens**

Run:

```bash
node scripts/freela-crm.mjs healthcheck
sqlite3 .scratch/db/freela.sqlite 'pragma integrity_check;'
```

Expected: both report `ok`.

## Task 5: Quiesce Writers And Execute The Real Migration

**Files/Paths:**
- Move physical data from: `/Users/luiz_fbm/Documents/programacao/freela/.scratch/db`
- Move physical data to: `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db`
- Leave compatibility symlink at: `/Users/luiz_fbm/Documents/programacao/freela/.scratch/db`

- [ ] **Step 1: Confirm no process is using the DB**

Run:

```bash
lsof /Users/luiz_fbm/Documents/programacao/freela/.scratch/db/freela.sqlite || true
lsof /Users/luiz_fbm/Documents/programacao/freela/.scratch/db/freela.sqlite-wal || true
```

Expected: no active writer. If Paperclip or another worker is listed, stop it before continuing.

- [ ] **Step 2: Create one last CLI backup**

Run:

```bash
node scripts/freela-crm.mjs init
```

Expected: `SQLite pronto...` and a fresh file under `.scratch/db/backups/`.

- [ ] **Step 3: Execute the localizer**

Run:

```bash
node scripts/freela-sqlite-localize.mjs \
  --root /Users/luiz_fbm/Documents/programacao/freela \
  --target-dir "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db"
```

Expected:

```text
SQLite localizado: ok (/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite)
Snapshot forense: /Users/luiz_fbm/Documents/programacao/freela/.scratch/forensics/sqlite-localize-...
Target size=... blocks=...
```

- [ ] **Step 4: Verify the filesystem shape**

Run:

```bash
ls -la /Users/luiz_fbm/Documents/programacao/freela/.scratch/db
stat -f 'path=%N size=%z blocks=%b flags=%f' "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite"
```

Expected: `.scratch/db` is a symlink and target `blocks` is greater than 0.

## Task 6: Post-Migration Operational Validation

**Files:**
- Read/execute only.

- [ ] **Step 1: Validate through official CLI path**

Run:

```bash
node scripts/freela-crm.mjs healthcheck
sqlite3 .scratch/db/freela.sqlite 'pragma integrity_check;'
```

Expected: both report `ok`.

- [ ] **Step 2: Validate target directly**

Run:

```bash
sqlite3 "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite" 'pragma integrity_check;'
sqlite3 "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite" \
  "select 'leads', count(*) from leads union all select 'audit_log', count(*) from audit_log union all select 'whatsapp_outbox', count(*) from whatsapp_outbox;"
```

Expected: `ok`, with counts matching the pre-migration baseline.

- [ ] **Step 3: Run required project validations**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs
node --test tests/paperclip-automation-contract.test.mjs
node --check scripts/freela-crm.mjs scripts/freela-sqlite-localize.mjs scripts/paperclip-sync-agents.mjs scripts/whatsapp-local-gateway.mjs
jq empty docs/freelancer/paperclip/*.json
git -c core.fsmonitor=false -c core.untrackedCache=false -c core.preloadIndex=false diff --check
```

Expected: all exit 0.

## Task 7: Make The New Location Hard To Misuse

**Files:**
- Runtime/private: `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/README.txt`

- [ ] **Step 1: Add a private marker in the local DB directory**

Use `apply_patch` to add the private marker:

```patch
*** Begin Patch
*** Add File: /Users/luiz_fbm/Library/Application Support/freela-paperclip/db/README.txt
+Official Freelancer/Paperclip SQLite source of truth.
+
+The project compatibility path is:
+/Users/luiz_fbm/Documents/programacao/freela/.scratch/db/freela.sqlite
+
+That path is expected to be a symlink into this local, non-synced app data directory.
+Do not move this directory back under Documents/iCloud/File Provider storage.
*** End Patch
```

Then run:

```bash
test -f "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/README.txt"
```

Expected: marker file exists only in private local app data, not in git-tracked docs.

- [ ] **Step 2: Re-run healthcheck after marker creation**

Run:

```bash
node scripts/freela-crm.mjs healthcheck
```

Expected: `SQLite healthcheck: ok`.

## Task 8: Final Report

**Files:**
- No file modifications.

- [ ] **Step 1: Report exact outcomes**

Include:

```text
Physical DB path: /Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite
Compatibility path: /Users/luiz_fbm/Documents/programacao/freela/.scratch/db/freela.sqlite
Forensic migration snapshot: .scratch/forensics/sqlite-localize-...
Post-migration integrity_check: ok
Test result: node --test tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs -> pass
Paperclip contract: tests/paperclip-automation-contract.test.mjs -> pass
Paperclip live sync: dry-run/apply result
```

- [ ] **Step 2: State residual risk**

Residual risk should be limited to:

```text
The repository itself can still contain offloaded private mirrors under .scratch, but the official SQLite source is no longer physically stored there.
```

## Self-Review

- Spec coverage: The plan removes the official SQLite DB from the offload-prone `Documents` path, keeps compatibility for existing scripts, preserves forensic snapshots, validates before and after, and avoids private tracked outputs.
- Placeholder scan: No implementation step uses TBD/TODO or unspecified validation.
- Type consistency: Script names, flags, paths, and test helpers are consistent across tasks.
