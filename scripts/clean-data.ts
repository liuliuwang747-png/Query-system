import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { inferQuantityMeta } from "../src/quantity";
import type { QuantityType } from "../src/types";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

type ItemType = "main" | "add_on" | "extension" | "reduction";

type BillingItem = {
  systemCategory: string;
  sourceFile: string;
  newCode: string;
  newName: string;
  itemType: ItemType;
  description: string;
  unit: string;
  billingNote: string;
  price: number | null;
  oldCodes: string[];
  oldNames: string[];
  parentItem: string;
  keywords: string[];
  isInterventional: boolean;
  isCommonCathLabItem: boolean;
  needsQuantityConfirmation?: boolean;
  quantityType?: QuantityType;
  quantityRuleText?: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const interventionalWords = [
  "介入",
  "造影",
  "支架",
  "球囊",
  "栓塞",
  "溶栓",
  "取栓",
  "导管",
  "腔内",
  "逆向再通",
  "消融",
  "封堵",
  "起搏",
  "穿刺",
  "血流储备",
  "微循环",
  "腔内影像",
  "动脉瘤",
  "静脉窦",
];

const cathLabWords = [
  ...interventionalWords,
  "冠状动脉",
  "冠脉",
  "脑血管",
  "脊髓血管",
  "电生理",
  "心律",
  "心脏",
  "左心耳",
  "房间隔",
  "肾动脉",
];

function cellText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCode(value: unknown): string {
  const text = cellText(value);
  if (!text) return "";
  return text.replace(/\.0$/, "").trim();
}

function parsePrice(value: unknown): number | null {
  const text = cellText(value).replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function detectItemType(name: string): ItemType {
  if (name.includes("加收")) return "add_on";
  if (name.includes("扩展")) return "extension";
  if (name.includes("减收")) return "reduction";
  return "main";
}

function detectParentItem(name: string, itemType: ItemType): string {
  if (itemType === "main") return name;
  const parts = name.split(/[-－]/);
  return parts[0]?.trim() || name;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function buildKeywords(item: Omit<BillingItem, "keywords">): string[] {
  const parts = [
    item.newCode,
    item.newName,
    item.parentItem,
    item.description,
    item.billingNote,
    ...item.oldCodes,
    ...item.oldNames,
  ];
  const splitWords = parts
    .join(" ")
    .split(/[｜|,，、;；\s（）()【】\[\]《》<>:：/+-]+/);
  return uniq([...parts, ...splitWords]);
}

function readSheetRows(filePath: string, sheetName: string): string[][] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
}

function extractMappings(filePath: string, sheetName: string): Map<string, { oldCodes: string[]; oldNames: string[] }> {
  const rows = readSheetRows(filePath, sheetName);
  const mappings = new Map<string, { oldCodes: string[]; oldNames: string[] }>();
  let currentNewName = "";

  for (const row of rows.slice(2)) {
    const newName = cellText(row[1]);
    const oldCode = normalizeCode(row[2]);
    const oldName = cellText(row[3]);
    if (newName) currentNewName = newName;
    if (!currentNewName) continue;
    const entry = mappings.get(currentNewName) ?? { oldCodes: [], oldNames: [] };
    if (oldCode) entry.oldCodes.push(oldCode);
    if (oldName) entry.oldNames.push(oldName);
    mappings.set(currentNewName, entry);
  }

  for (const [key, value] of mappings.entries()) {
    mappings.set(key, {
      oldCodes: uniq(value.oldCodes),
      oldNames: uniq(value.oldNames),
    });
  }

  return mappings;
}

function buildRules() {
  return {
    version: 1,
    source: "辽宁省心血管类、神经系统类医疗服务项目价格信息表",
    localOnly: true,
    ruleTypes: [
      "count_rule",
      "addon_rule",
      "exclusion_rule",
      "extension_rule",
      "mapping_rule",
      "manual_review_rule",
    ],
    groups: [
      { id: "home", name: "首页", enabled: true },
      { id: "coronary", name: "冠脉", enabled: true },
      { id: "neuro", name: "神经介入", enabled: true },
      { id: "ep", name: "电生理", enabled: true },
      { id: "pacemaker", name: "起搏器", enabled: true },
      { id: "structural", name: "先心病/结构性心脏病", enabled: true },
      { id: "renal", name: "高血压/肾动脉", enabled: true },
      {
        id: "tumor",
        name: "肿瘤介入",
        enabled: false,
        unavailableReason: "该组收费标准尚未导入，请上传对应价格表后启用",
      },
      {
        id: "peripheral",
        name: "下肢/外周血管",
        enabled: false,
        unavailableReason: "该组收费标准尚未导入，请上传对应价格表后启用",
      },
      { id: "mapping", name: "特殊术式挂靠", enabled: true },
      { id: "old", name: "旧项目查询", enabled: true },
    ],
    countRules: [
      {
        id: "coronary-stent-by-vessel",
        type: "count_rule",
        scope: "coronary",
        itemNameIncludes: "冠状动脉支架置入费",
        title: "冠状动脉支架置入费按血管计价",
        unitBasis: "blood_vessel",
        ruleText: "按左主干、左前降支、左回旋支、右冠状动脉及每支桥血管计价，不按支架枚数计价。",
      },
      {
        id: "coronary-balloon-by-vessel",
        type: "count_rule",
        scope: "coronary",
        itemNameIncludes: "冠状动脉球囊扩张费",
        title: "冠状动脉球囊扩张费按血管计价",
        unitBasis: "blood_vessel",
        ruleText: "同一血管不与冠状动脉支架置入费同时收取。",
      },
      {
        id: "brain-angio-count",
        type: "count_rule",
        scope: "neuro",
        itemNameIncludes: "脑血管造影费",
        title: "脑血管造影 3 根及以下按 1 次",
        unitBasis: "procedure_with_extra_vessel",
        baseCount: 3,
        extraRate: 0.33,
        maxPrice: 7280,
        ruleText: "超过3根血管，每增加1根血管按33%加收；一次收费不得超过7280元。",
      },
      {
        id: "spinal-angio-count",
        type: "count_rule",
        scope: "neuro",
        itemNameIncludes: "脊髓血管造影费",
        title: "脊髓血管造影 4 根及以下按 1 次",
        unitBasis: "procedure_with_extra_vessel",
        baseCount: 4,
        extraRate: 0.25,
        maxPrice: 11970,
        ruleText: "超过4根血管，每增加1根血管按25%加收；一次收费不得超过11970元。",
      },
      {
        id: "neuro-stent-balloon-by-vessel",
        type: "count_rule",
        scope: "neuro",
        itemNameIncludes: "脑血管支架置入费",
        title: "脑血管支架置入按血管计价",
        unitBasis: "blood_vessel",
        ruleText: "同一脑血管颅内和颅外多处狭窄按2根血管计价，颅内部分适用颅内血管加收。",
      },
    ],
    addonRules: [
      {
        id: "coronary-left-ventricle-addon",
        type: "addon_rule",
        scope: "coronary",
        parentItemNameIncludes: "冠状动脉造影费",
        itemNameIncludes: "左心室造影",
        triggerKeywords: ["左室造影", "左心室造影"],
        ruleText: "冠状动脉造影同时做左心室造影时，提示可按加收项处理。",
      },
      {
        id: "coronary-bridge-addon",
        type: "addon_rule",
        scope: "coronary",
        parentItemNameIncludes: "冠状动脉造影费",
        itemNameIncludes: "桥血管造影",
        triggerKeywords: ["桥血管造影", "桥血管"],
        ruleText: "冠状动脉造影涉及桥血管造影时，提示可加收。",
      },
      {
        id: "neuro-intracranial-addon",
        type: "addon_rule",
        scope: "neuro",
        parentItemNameIncludes: "脑血管",
        itemNameIncludes: "颅内血管",
        triggerKeywords: ["颅内", "脑静脉窦"],
        ruleText: "颅内血管、脑静脉窦扩张或支架置入适用颅内血管加收。",
      },
    ],
    exclusionRules: [
      {
        id: "coronary-stent-excludes-balloon-same-vessel",
        type: "exclusion_rule",
        scope: "coronary",
        primaryItemNameIncludes: "冠状动脉支架置入费",
        excludedItemNameIncludes: "冠状动脉球囊扩张费",
        sameScope: "same_vessel",
        ruleText: "同一冠脉血管已收支架置入费时，不与冠状动脉球囊扩张费同时收取。",
      },
      {
        id: "neuro-treatment-confirm-angio",
        type: "exclusion_rule",
        scope: "neuro",
        primaryItemNameIncludes: "脑血管治疗",
        excludedItemNameIncludes: "脑血管造影费",
        sameScope: "immediate_confirmation",
        ruleText: "脑血管治疗后立即行造影确认治疗效果的，不得重复收取脑血管造影费用。",
      },
    ],
    extensionRules: [
      {
        id: "extension-not-extra-charge",
        type: "extension_rule",
        scope: "all",
        ruleText: "扩展项目只扩展适用范围，通常按主项目执行，不代表独立加价，需按院内医保收费口径确认。",
      },
    ],
    mappingRules: [
      {
        id: "coronary-cto",
        type: "mapping_rule",
        scope: "coronary",
        action: "逆向再通",
        triggerKeywords: ["CTO", "慢性完全闭塞", "逆向开通", "逆向再通"],
        targetItemNameIncludes: "冠状动脉慢性完全闭塞血管逆向再通治疗费",
        reason: "按实际操作本质挂靠为慢性完全闭塞血管逆向再通治疗。",
      },
      {
        id: "aneurysm-coil",
        type: "mapping_rule",
        scope: "neuro",
        action: "栓塞",
        triggerKeywords: ["颅内动脉瘤", "弹簧圈", "密网支架", "支架辅助"],
        targetItemNameIncludes: "颅内动脉瘤栓塞费",
        reason: "颅内动脉瘤弹簧圈或支架辅助处理，按栓塞动作本质挂靠颅内动脉瘤栓塞。",
      },
      {
        id: "venous-sinus-stent",
        type: "mapping_rule",
        scope: "neuro",
        action: "支架置入",
        triggerKeywords: ["脑静脉窦", "静脉窦支架"],
        targetItemNameIncludes: "脑血管支架置入费",
        reason: "脑静脉窦支架置入按脑血管支架置入动作本质挂靠，并提示颅内血管加收。",
      },
      {
        id: "generic-balloon",
        type: "mapping_rule",
        scope: "all",
        action: "球囊扩张",
        triggerKeywords: ["球囊", "扩张"],
        targetItemNameIncludes: "球囊扩张费",
        reason: "没有完全同名项目时，按球囊扩张这一核心动作寻找最接近项目。",
      },
      {
        id: "generic-stent",
        type: "mapping_rule",
        scope: "all",
        action: "支架置入",
        triggerKeywords: ["支架", "置入"],
        targetItemNameIncludes: "支架置入费",
        reason: "没有完全同名项目时，按支架置入这一核心动作寻找最接近项目。",
      },
      {
        id: "generic-angiography",
        type: "mapping_rule",
        scope: "all",
        action: "造影",
        triggerKeywords: ["造影"],
        targetItemNameIncludes: "造影费",
        reason: "没有完全同名项目时，按造影这一核心动作寻找最接近项目。",
      },
    ],
    manualReviewRules: [
      {
        id: "stent-count-by-vessel-review",
        type: "manual_review_rule",
        scope: "coronary",
        triggerKeywords: ["支架2枚", "支架3枚", "支架4枚", "多枚支架"],
        ruleText: "冠脉支架按血管计价，不按支架枚数计价；病历需写清处理血管。",
      },
      {
        id: "special-rare-review",
        type: "manual_review_rule",
        scope: "all",
        triggerKeywords: ["少见", "特殊", "复合", "一站式", "联合"],
        ruleText: "特殊复合术式建议人工复核，避免按名称机械匹配。",
      },
      {
        id: "unsupported-group-review",
        type: "manual_review_rule",
        scope: "all",
        triggerKeywords: ["肿瘤", "下肢", "外周血管"],
        ruleText: "当前 Excel 未完整导入该组收费标准，不得乱匹配。",
      },
    ],
  };
}

async function main() {
  const entries = await fs.readdir(root);
  const excelFiles = entries
    .filter((name) => name.endsWith(".xlsx"))
    .filter((name) => name.includes("心血管") || name.includes("神经系统"))
    .sort();

  const items: BillingItem[] = [];

  for (const fileName of excelFiles) {
    const filePath = path.join(root, fileName);
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const sheetNames = workbook.SheetNames;
    const systemCategory = fileName.includes("神经系统") ? "神经系统" : "心血管系统";
    const mappings = extractMappings(filePath, sheetNames[2]);
    const rows = readSheetRows(filePath, sheetNames[0]);

    for (const row of rows.slice(3)) {
      const newCode = normalizeCode(row[1]);
      const newName = cellText(row[2]);
      if (!newCode || !newName) continue;
      const itemType = detectItemType(newName);
      const parentItem = detectParentItem(newName, itemType);
      const mapped = mappings.get(newName) ?? mappings.get(parentItem) ?? { oldCodes: [], oldNames: [] };
      const description = cellText(row[3]);
      const billingNote = cellText(row[5]);
      const itemWithoutKeywords = {
        systemCategory,
        sourceFile: fileName,
        newCode,
        newName,
        itemType,
        description,
        unit: cellText(row[4]),
        billingNote,
        price: parsePrice(row[6]),
        oldCodes: mapped.oldCodes,
        oldNames: mapped.oldNames,
        parentItem,
        isInterventional: interventionalWords.some((word) => `${newName} ${description} ${billingNote}`.includes(word)),
        isCommonCathLabItem: cathLabWords.some((word) => `${newName} ${description} ${billingNote}`.includes(word)),
      };
      const quantityMeta = inferQuantityMeta(itemWithoutKeywords);
      items.push({
        ...itemWithoutKeywords,
        needsQuantityConfirmation: quantityMeta.needsQuantityConfirmation || undefined,
        quantityType: quantityMeta.quantityType,
        quantityRuleText: quantityMeta.ruleText,
        keywords: buildKeywords(itemWithoutKeywords),
      });
    }
  }

  items.sort((a, b) => a.systemCategory.localeCompare(b.systemCategory, "zh-CN") || a.newCode.localeCompare(b.newCode));

  const rules = buildRules();
  const publicDir = path.join(root, "public");
  const dataDir = path.join(root, "src", "data");
  await fs.mkdir(publicDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });

  const itemJson = `${JSON.stringify(items, null, 2)}\n`;
  const ruleJson = `${JSON.stringify(rules, null, 2)}\n`;
  await fs.writeFile(path.join(publicDir, "items.json"), itemJson, "utf8");
  await fs.writeFile(path.join(publicDir, "billingRules.json"), ruleJson, "utf8");
  await fs.writeFile(path.join(dataDir, "items.generated.json"), itemJson, "utf8");
  await fs.writeFile(path.join(dataDir, "billingRules.generated.json"), ruleJson, "utf8");

  console.log(`已生成 ${items.length} 条收费项目`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
