#!/usr/bin/env node
import {
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
import { dirname, join, resolve } from "node:path";
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
