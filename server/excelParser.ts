import path from "node:path";
import { createRequire } from "node:module";
import { inferQuantityMeta } from "../src/quantity";
import type { QuantityType } from "../src/types";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

export type ItemType = "main" | "add_on" | "extension" | "reduction";

export type ParsedItem = {
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

export type ParsedOldMapping = {
  oldCode: string;
  oldName: string;
  newCode: string;
  newName: string;
};

export type ParsedWorkbookData = {
  items: ParsedItem[];
  oldMappings: ParsedOldMapping[];
};

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
  return text.replace(/\.0$/, "");
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
  return name.split(/[-－]/)[0]?.trim() || name;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildKeywords(item: Omit<ParsedItem, "keywords">): string[] {
  const parts = [
    item.newCode,
    item.newName,
    item.parentItem,
    item.description,
    item.billingNote,
    ...item.oldCodes,
    ...item.oldNames,
  ];
  const splitWords = parts.join(" ").split(/[｜|,，、;；\s（）()【】\[\]《》<>:：/+-]+/);
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

export function parseExcelFiles(filePaths: string[]): ParsedWorkbookData {
  const items: ParsedItem[] = [];
  const oldMappings: ParsedOldMapping[] = [];

  for (const filePath of filePaths) {
    const sourceFile = path.basename(filePath);
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const [newSheetName, , mappingSheetName] = workbook.SheetNames;
    if (!newSheetName || !mappingSheetName) continue;

    const systemCategory = sourceFile.includes("神经系统") ? "神经系统" : "心血管系统";
    const mappings = extractMappings(filePath, mappingSheetName);
    const rows = readSheetRows(filePath, newSheetName);
    const newNameToCode = new Map<string, string>();

    for (const row of rows.slice(3)) {
      const newCode = normalizeCode(row[1]);
      const newName = cellText(row[2]);
      if (newCode && newName) newNameToCode.set(newName, newCode);
    }

    for (const row of rows.slice(3)) {
      const newCode = normalizeCode(row[1]);
      const newName = cellText(row[2]);
      if (!newCode || !newName) continue;
      const itemType = detectItemType(newName);
      const parentItem = detectParentItem(newName, itemType);
      const mapped = mappings.get(newName) ?? mappings.get(parentItem) ?? { oldCodes: [], oldNames: [] };
      const description = cellText(row[3]);
      const billingNote = cellText(row[5]);
      const text = `${newName} ${description} ${billingNote}`;
      const baseItem = {
        systemCategory,
        sourceFile,
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
        isInterventional: interventionalWords.some((word) => text.includes(word)),
        isCommonCathLabItem: cathLabWords.some((word) => text.includes(word)),
      };
      const quantityMeta = inferQuantityMeta(baseItem);
      items.push({
        ...baseItem,
        needsQuantityConfirmation: quantityMeta.needsQuantityConfirmation || undefined,
        quantityType: quantityMeta.quantityType,
        quantityRuleText: quantityMeta.ruleText,
        keywords: buildKeywords(baseItem),
      });
    }

    for (const [newName, mapped] of mappings.entries()) {
      const newCode = newNameToCode.get(newName) ?? "";
      mapped.oldCodes.forEach((oldCode, index) => {
        oldMappings.push({
          oldCode,
          oldName: mapped.oldNames[index] ?? mapped.oldNames[0] ?? "",
          newCode,
          newName,
        });
      });
    }
  }

  items.sort((a, b) => a.systemCategory.localeCompare(b.systemCategory, "zh-CN") || a.newCode.localeCompare(b.newCode));
  return { items, oldMappings };
}
