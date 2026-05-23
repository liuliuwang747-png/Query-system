import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { ParsedItem, ParsedOldMapping, ParsedWorkbookData } from "./excelParser";
import { buildDefaultRules } from "./defaultRules";

const root = path.resolve(process.cwd());
export const dataDir = path.join(root, "data");
export const uploadDir = path.join(dataDir, "uploads");
export const draftPath = path.join(dataDir, "draft-import.json");
const dbPath = process.env.DB_PATH || path.join(dataDir, "cath-lab-billing.sqlite");

let db: DatabaseSync | null = null;

function ensureDirs() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const input = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), input);
}

function nowIso() {
  return new Date().toISOString();
}

function runSchema(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      system_category TEXT NOT NULL,
      source_file TEXT NOT NULL,
      new_code TEXT NOT NULL,
      new_name TEXT NOT NULL,
      item_type TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      billing_note TEXT NOT NULL,
      price REAL,
      old_codes_json TEXT NOT NULL,
      old_names_json TEXT NOT NULL,
      parent_item TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      is_interventional INTEGER NOT NULL DEFAULT 0,
      is_common_cath_lab_item INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      manual_review INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS old_item_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      old_code TEXT NOT NULL,
      old_name TEXT NOT NULL,
      new_code TEXT NOT NULL,
      new_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS billing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      title TEXT NOT NULL,
      trigger_keywords_json TEXT NOT NULL,
      target_item_name TEXT NOT NULL,
      rule_text TEXT NOT NULL,
      risk_level TEXT NOT NULL DEFAULT 'normal',
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS procedure_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_item_name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version_no INTEGER NOT NULL,
      note TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      rule_count INTEGER NOT NULL,
      published_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS change_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      summary TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function seed(database: DatabaseSync) {
  const admin = database.prepare("SELECT id FROM admin_users WHERE username = ?").get("admin");
  if (!admin) {
    const password = process.env.ADMIN_PASSWORD || "admin123456";
    database
      .prepare("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)")
      .run("admin", hashPassword(password), nowIso());
  }

  const ruleCount = database.prepare("SELECT COUNT(*) AS count FROM billing_rules").get() as { count: number };
  if (!ruleCount.count) {
    const stmt = database.prepare(`
      INSERT INTO billing_rules
      (rule_type, scope, title, trigger_keywords_json, target_item_name, rule_text, risk_level, active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const rule of buildDefaultRules()) {
      stmt.run(
        rule.rule_type,
        rule.scope,
        rule.title,
        JSON.stringify(rule.trigger_keywords),
        rule.target_item_name,
        rule.rule_text,
        rule.risk_level,
        rule.active,
        nowIso(),
      );
    }
  }

  const versionCount = database.prepare("SELECT COUNT(*) AS count FROM versions").get() as { count: number };
  if (!versionCount.count) {
    database
      .prepare("INSERT INTO versions (version_no, note, item_count, rule_count, published_at) VALUES (?, ?, ?, ?, ?)")
      .run(1, "系统初始化", 0, Number(ruleCount.count || buildDefaultRules().length), nowIso());
  }
}

export function getDb() {
  if (db) return db;
  ensureDirs();
  db = new DatabaseSync(dbPath);
  runSchema(db);
  seed(db);
  return db;
}

export function loginAdmin(username: string, password: string) {
  const row = getDb().prepare("SELECT username, password_hash FROM admin_users WHERE username = ?").get(username) as
    | { username: string; password_hash: string }
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  return row.username;
}

export function getLatestVersion() {
  const row = getDb()
    .prepare("SELECT version_no, note, item_count, rule_count, published_at FROM versions ORDER BY version_no DESC LIMIT 1")
    .get() as { version_no: number; note: string; item_count: number; rule_count: number; published_at: string };
  return {
    version: row.version_no,
    note: row.note,
    itemCount: row.item_count,
    ruleCount: row.rule_count,
    publishedAt: row.published_at,
  };
}

function toItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    systemCategory: row.system_category,
    sourceFile: row.source_file,
    newCode: row.new_code,
    newName: row.new_name,
    itemType: row.item_type,
    description: row.description,
    unit: row.unit,
    billingNote: row.billing_note,
    price: row.price,
    oldCodes: JSON.parse(String(row.old_codes_json || "[]")),
    oldNames: JSON.parse(String(row.old_names_json || "[]")),
    parentItem: row.parent_item,
    keywords: JSON.parse(String(row.keywords_json || "[]")),
    isInterventional: Boolean(row.is_interventional),
    isCommonCathLabItem: Boolean(row.is_common_cath_lab_item),
    active: Boolean(row.active),
    manualReview: Boolean(row.manual_review),
  };
}

export function listItems() {
  return getDb()
    .prepare("SELECT * FROM items WHERE active = 1 ORDER BY system_category, new_code")
    .all()
    .map((row) => toItem(row as Record<string, unknown>));
}

export function getItemCount() {
  return (getDb().prepare("SELECT COUNT(*) AS count FROM items WHERE active = 1").get() as { count: number }).count;
}

export function searchItems(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return listItems().slice(0, 80);
  return listItems()
    .filter((item) => {
      const haystack = [
        item.newCode,
        item.newName,
        item.parentItem,
        item.description,
        item.billingNote,
        ...item.oldCodes,
        ...item.oldNames,
        ...item.keywords,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 120);
}

export function listRules() {
  return getDb()
    .prepare("SELECT * FROM billing_rules WHERE active = 1 ORDER BY id")
    .all()
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id,
        ruleType: r.rule_type,
        scope: r.scope,
        title: r.title,
        triggerKeywords: JSON.parse(String(r.trigger_keywords_json || "[]")),
        targetItemName: r.target_item_name,
        ruleText: r.rule_text,
        riskLevel: r.risk_level,
        active: Boolean(r.active),
      };
    });
}

export function listOldMappings() {
  return getDb()
    .prepare("SELECT * FROM old_item_mappings WHERE active = 1 ORDER BY old_code")
    .all();
}

export function saveDraftImport(data: ParsedWorkbookData) {
  ensureDirs();
  fs.writeFileSync(draftPath, JSON.stringify(data, null, 2), "utf8");
}

export function readDraftImport(): ParsedWorkbookData | null {
  if (!fs.existsSync(draftPath)) return null;
  return JSON.parse(fs.readFileSync(draftPath, "utf8")) as ParsedWorkbookData;
}

export function replaceDataFromImport(data: ParsedWorkbookData, note: string, username: string) {
  const database = getDb();
  const now = nowIso();
  database.exec("BEGIN");
  try {
    database.exec("DELETE FROM items; DELETE FROM old_item_mappings;");
    const itemStmt = database.prepare(`
      INSERT INTO items
      (system_category, source_file, new_code, new_name, item_type, description, unit, billing_note, price,
       old_codes_json, old_names_json, parent_item, keywords_json, is_interventional, is_common_cath_lab_item,
       active, manual_review, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)
    `);
    for (const item of data.items) {
      itemStmt.run(
        item.systemCategory,
        item.sourceFile,
        item.newCode,
        item.newName,
        item.itemType,
        item.description,
        item.unit,
        item.billingNote,
        item.price,
        JSON.stringify(item.oldCodes),
        JSON.stringify(item.oldNames),
        item.parentItem,
        JSON.stringify(item.keywords),
        item.isInterventional ? 1 : 0,
        item.isCommonCathLabItem ? 1 : 0,
        now,
      );
    }

    const mappingStmt = database.prepare(`
      INSERT INTO old_item_mappings (old_code, old_name, new_code, new_name, active)
      VALUES (?, ?, ?, ?, 1)
    `);
    for (const mapping of data.oldMappings) {
      mappingStmt.run(mapping.oldCode, mapping.oldName, mapping.newCode, mapping.newName);
    }

    const latest = getLatestVersion();
    const ruleCount = (database.prepare("SELECT COUNT(*) AS count FROM billing_rules WHERE active = 1").get() as { count: number }).count;
    database
      .prepare("INSERT INTO versions (version_no, note, item_count, rule_count, published_at) VALUES (?, ?, ?, ?, ?)")
      .run(latest.version + 1, note, data.items.length, ruleCount, now);
    database
      .prepare("INSERT INTO change_logs (action, target_type, target_id, summary, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("publish", "version", String(latest.version + 1), note, username, now);
    database.exec("COMMIT");
    if (fs.existsSync(draftPath)) fs.unlinkSync(draftPath);
    return getLatestVersion();
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function upsertItem(payload: Record<string, unknown>, username: string) {
  const database = getDb();
  const now = nowIso();
  const id = Number(payload.id || 0);
  if (id) {
    database
      .prepare(
        `UPDATE items SET new_name=?, item_type=?, description=?, unit=?, billing_note=?, price=?, manual_review=?, active=?, updated_at=? WHERE id=?`,
      )
      .run(
        String(payload.newName || ""),
        String(payload.itemType || "main"),
        String(payload.description || ""),
        String(payload.unit || ""),
        String(payload.billingNote || ""),
        payload.price === null || payload.price === "" ? null : Number(payload.price),
        payload.manualReview ? 1 : 0,
        payload.active === false ? 0 : 1,
        now,
        id,
      );
  }
  database
    .prepare("INSERT INTO change_logs (action, target_type, target_id, summary, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id ? "update" : "create", "item", String(id || ""), `维护收费项目：${payload.newName || ""}`, username, now);
}

export function upsertRule(payload: Record<string, unknown>, username: string) {
  const database = getDb();
  const now = nowIso();
  const id = Number(payload.id || 0);
  const keywords = Array.isArray(payload.triggerKeywords)
    ? payload.triggerKeywords
    : String(payload.triggerKeywords || "")
        .split(/[,，、\s]+/)
        .filter(Boolean);
  if (id) {
    database
      .prepare(
        `UPDATE billing_rules SET rule_type=?, scope=?, title=?, trigger_keywords_json=?, target_item_name=?, rule_text=?, risk_level=?, active=?, updated_at=? WHERE id=?`,
      )
      .run(
        String(payload.ruleType || "manual_review_rule"),
        String(payload.scope || "all"),
        String(payload.title || ""),
        JSON.stringify(keywords),
        String(payload.targetItemName || ""),
        String(payload.ruleText || ""),
        String(payload.riskLevel || "normal"),
        payload.active === false ? 0 : 1,
        now,
        id,
      );
  } else {
    database
      .prepare(
        `INSERT INTO billing_rules
        (rule_type, scope, title, trigger_keywords_json, target_item_name, rule_text, risk_level, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        String(payload.ruleType || "manual_review_rule"),
        String(payload.scope || "all"),
        String(payload.title || ""),
        JSON.stringify(keywords),
        String(payload.targetItemName || ""),
        String(payload.ruleText || ""),
        String(payload.riskLevel || "normal"),
        now,
      );
  }
  database
    .prepare("INSERT INTO change_logs (action, target_type, target_id, summary, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id ? "update" : "create", "rule", String(id || ""), `维护规则：${payload.title || ""}`, username, now);
}

export function listChangeLogs() {
  return getDb().prepare("SELECT * FROM change_logs ORDER BY id DESC LIMIT 100").all();
}

export function exportBackup() {
  return {
    version: getLatestVersion(),
    items: listItems(),
    rules: listRules(),
    oldMappings: listOldMappings(),
    changeLogs: listChangeLogs(),
  };
}
