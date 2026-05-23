import type { BillingItem } from "./types";

export type ApiVersion = {
  version: number;
  note: string;
  itemCount: number;
  ruleCount: number;
  publishedAt: string;
};

export type ApiRule = {
  id: number;
  ruleType: string;
  scope: string;
  title: string;
  triggerKeywords: string[];
  targetItemName: string;
  ruleText: string;
  riskLevel: "normal" | "warning" | "high";
  active: boolean;
};

const itemCacheKey = "cath_lab_items_cache";
const ruleCacheKey = "cath_lab_rules_cache";
const versionCacheKey = "cath_lab_version_cache";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  return response.json() as Promise<T>;
}

function normalizeStaticRules(payload: unknown): ApiRule[] {
  const source = payload as Partial<Record<"countRules" | "addonRules" | "exclusionRules" | "extensionRules" | "mappingRules" | "manualReviewRules", unknown[]>>;
  return Object.values(source)
    .filter(Array.isArray)
    .flatMap((rules) => rules as Record<string, unknown>[])
    .map((rule, index) => ({
      id: index + 1,
      ruleType: String(rule.type || ""),
      scope: String(rule.scope || "all"),
      title: String(rule.title || ""),
      triggerKeywords: Array.isArray(rule.triggerKeywords) ? rule.triggerKeywords.map(String) : [],
      targetItemName: String(rule.targetItemNameIncludes || rule.itemNameIncludes || ""),
      ruleText: String(rule.ruleText || rule.reason || ""),
      riskLevel: "normal" as const,
      active: true,
    }));
}

export async function loadRuntimeData() {
  try {
    const [version, itemPayload, rulePayload] = await Promise.all([
      getJson<ApiVersion>("/api/version"),
      getJson<{ items: BillingItem[] }>("/api/items"),
      getJson<{ rules: ApiRule[] }>("/api/rules"),
    ]);
    localStorage.setItem(itemCacheKey, JSON.stringify(itemPayload.items));
    localStorage.setItem(ruleCacheKey, JSON.stringify(rulePayload.rules));
    localStorage.setItem(versionCacheKey, JSON.stringify(version));
    return {
      items: itemPayload.items,
      rules: rulePayload.rules,
      version,
      offline: false,
    };
  } catch {
    try {
      const [items, staticRules] = await Promise.all([
        getJson<BillingItem[]>("/items.json"),
        getJson<unknown>("/billingRules.json").catch(() => ({})),
      ]);
      const rules = normalizeStaticRules(staticRules);
      const version: ApiVersion = {
        version: 0,
        note: "静态公开版本",
        itemCount: items.length,
        ruleCount: rules.length,
        publishedAt: "static",
      };
      localStorage.setItem(itemCacheKey, JSON.stringify(items));
      localStorage.setItem(ruleCacheKey, JSON.stringify(rules));
      localStorage.setItem(versionCacheKey, JSON.stringify(version));
      return { items, rules, version, offline: false };
    } catch {
      // 静态文件也不可用时，才使用浏览器缓存。
    }
    const items = JSON.parse(localStorage.getItem(itemCacheKey) || "[]") as BillingItem[];
    const rules = JSON.parse(localStorage.getItem(ruleCacheKey) || "[]") as ApiRule[];
    const version = JSON.parse(localStorage.getItem(versionCacheKey) || "null") as ApiVersion | null;
    return { items, rules, version, offline: true };
  }
}

export async function checkVersion() {
  return getJson<ApiVersion>("/api/version");
}

export async function adminLogin(username: string, password: string) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("账号或密码错误");
  return response.json() as Promise<{ token: string; username: string }>;
}

export async function adminUploadExcel(token: string, files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const response = await fetch("/api/admin/upload-excel", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "上传失败");
  return payload as { draft: { itemCount: number; mappingCount: number; fileNames: string[] } };
}

export async function adminPublish(token: string, note: string) {
  const response = await fetch("/api/admin/publish-version", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "发布失败");
  return payload as { version: ApiVersion };
}

export async function adminLoadLogs(token: string) {
  const response = await fetch("/api/admin/change-logs", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { logs: [] };
  return response.json() as Promise<{ logs: unknown[] }>;
}
