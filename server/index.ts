import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { createToken, requireAdmin } from "./auth";
import { parseExcelFiles } from "./excelParser";
import {
  dataDir,
  uploadDir,
  exportBackup,
  getDb,
  getItemCount,
  getLatestVersion,
  listChangeLogs,
  listItems,
  listOldMappings,
  listRules,
  loginAdmin,
  readDraftImport,
  replaceDataFromImport,
  saveDraftImport,
  searchItems,
  upsertItem,
  upsertRule,
} from "./db";

const app = express();
const port = Number(process.env.PORT || 8080);
const root = process.cwd();
const distDir = path.join(root, "dist");

getDb();

function importInitialExcelIfEmpty() {
  if (getItemCount() > 0) return;
  const excelFiles = fs
    .readdirSync(root)
    .filter((name) => name.endsWith(".xlsx"))
    .filter((name) => name.includes("心血管") || name.includes("神经系统"))
    .map((name) => path.join(root, name));
  if (!excelFiles.length) return;
  const parsed = parseExcelFiles(excelFiles);
  replaceDataFromImport(parsed, "初始化导入项目目录 Excel", "system");
}

importInitialExcelIfEmpty();

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024, files: 6 },
});

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/version", (_req, res) => {
  res.json(getLatestVersion());
});

app.get("/api/items", (_req, res) => {
  res.json({ items: listItems(), version: getLatestVersion() });
});

app.get("/api/rules", (_req, res) => {
  res.json({ rules: listRules(), version: getLatestVersion() });
});

app.get("/api/search", (req, res) => {
  res.json({ items: searchItems(String(req.query.q || "")), version: getLatestVersion() });
});

app.get("/api/old-mappings", (_req, res) => {
  res.json({ mappings: listOldMappings(), version: getLatestVersion() });
});

app.post("/api/admin/login", (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  const admin = loginAdmin(username, password);
  if (!admin) {
    res.status(401).json({ error: "账号或密码错误" });
    return;
  }
  res.json({ token: createToken(admin), username: admin });
});

app.get("/api/admin/items", requireAdmin, (_req, res) => {
  res.json({ items: listItems(), version: getLatestVersion() });
});

app.post("/api/admin/upload-excel", requireAdmin, upload.array("files", 6), (req, res) => {
  const files = (req.files || []) as Express.Multer.File[];
  if (!files.length) {
    res.status(400).json({ error: "请上传 Excel 文件" });
    return;
  }
  const savedFiles = files.map((file, index) => {
    const safeName = file.originalname.replace(/[\\/:*?"<>|]/g, "_");
    const target = path.join(uploadDir, `${Date.now()}-${index}-${safeName}`);
    fs.renameSync(file.path, target);
    return target;
  });
  const parsed = parseExcelFiles(savedFiles);
  saveDraftImport(parsed);
  res.json({
    ok: true,
    draft: {
      itemCount: parsed.items.length,
      mappingCount: parsed.oldMappings.length,
      fileNames: files.map((file) => file.originalname),
    },
  });
});

app.get("/api/admin/draft", requireAdmin, (_req, res) => {
  const draft = readDraftImport();
  res.json({
    hasDraft: Boolean(draft),
    itemCount: draft?.items.length ?? 0,
    mappingCount: draft?.oldMappings.length ?? 0,
  });
});

app.post("/api/admin/publish-version", requireAdmin, (req, res) => {
  const draft = readDraftImport();
  if (!draft) {
    res.status(400).json({ error: "没有待发布的 Excel 草稿，请先上传 Excel" });
    return;
  }
  const note = String(req.body.note || "").trim();
  if (!note) {
    res.status(400).json({ error: "发布新版本必须填写更新说明" });
    return;
  }
  const version = replaceDataFromImport(draft, note, req.adminUser || "admin");
  res.json({ ok: true, version });
});

app.put("/api/admin/items/:id", requireAdmin, (req, res) => {
  upsertItem({ ...req.body, id: req.params.id }, req.adminUser || "admin");
  res.json({ ok: true });
});

app.post("/api/admin/rules", requireAdmin, (req, res) => {
  upsertRule(req.body, req.adminUser || "admin");
  res.json({ ok: true });
});

app.put("/api/admin/rules/:id", requireAdmin, (req, res) => {
  upsertRule({ ...req.body, id: req.params.id }, req.adminUser || "admin");
  res.json({ ok: true });
});

app.get("/api/admin/rules", requireAdmin, (_req, res) => {
  res.json({ rules: listRules() });
});

app.get("/api/admin/change-logs", requireAdmin, (_req, res) => {
  res.json({ logs: listChangeLogs() });
});

app.get("/api/admin/backup.json", requireAdmin, (_req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=cath-lab-billing-backup.json");
  res.json(exportBackup());
});

app.post("/api/admin/rollback", requireAdmin, (_req, res) => {
  res.status(501).json({ error: "最小可用版暂未启用自动回滚；请使用备份 JSON 或重新上传上一版 Excel 发布。" });
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.use((_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send(`
      <h1>导管室收费查询系统 API 已启动</h1>
      <p>请先执行 <code>npm run build</code> 生成前端页面，再执行 <code>npm start</code>。</p>
      <p>当前数据目录：${dataDir}</p>
    `);
  });
}

app.listen(port, "0.0.0.0", () => {
  console.log(`导管室收费查询系统已启动：http://localhost:${port}`);
  console.log(`管理员初始账号：admin，默认密码：admin123456（可用 ADMIN_PASSWORD 环境变量修改）`);
});
