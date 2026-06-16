import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { inferQuantityMeta } from "../src/quantity";
import type { BillingItem, ItemType, QuantityType } from "../src/types";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

type TargetConfig = {
  category: string;
  subcategory: string;
  names: string[];
  manualAliases?: Record<string, string[]>;
  requiresManualConfirm?: boolean;
};

type ImportSummary = {
  sourceFile: string;
  generatedAt: string;
  addedOfficialItems: string[];
  addedAliases: Array<{ aliasName: string; targetOfficialName: string; category: string; subcategory: string }>;
  skippedCardiovascularItems: number;
  skippedNeurovascularItems: number;
  duplicateExistingItems: number;
  actualAddedItemCount: number;
  actualAddedAliasCount: number;
  categoryCounts: Record<string, number>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sourceFile = "印刷版.xlsx";

function cellText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "");
}

function officialNameText(value: unknown): string {
  return normalizeName(String(value ?? "")).trim();
}

function normalizeCode(value: unknown): string {
  return cellText(value).replace(/\.0$/, "");
}

function parsePrice(value: unknown): number | null {
  const text = cellText(value).replace(/,/g, "");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseUnit(row: string[]) {
  const preferred = cellText(row[5]);
  const fallback = cellText(row[4]);
  return preferred || fallback;
}

function detectItemType(name: string): ItemType {
  if (name.includes("加收")) return "add_on";
  if (name.includes("扩展")) return "extension";
  if (name.includes("减收")) return "reduction";
  return "main";
}

function parentItem(name: string) {
  return name.split(/[-－]/)[0]?.trim() || name;
}

function uniq(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildKeywords(item: Omit<BillingItem, "keywords">, aliases: string[]) {
  const parts = [
    item.newCode,
    item.newName,
    item.parentItem,
    item.systemCategory,
    item.description,
    item.billingNote,
    ...item.oldCodes,
    ...item.oldNames,
    ...aliases,
  ];
  const splitWords = parts.join(" ").split(/[｜|,，、;；\s（）()【】\[\]《》<>:：/+-]+/);
  return uniq([...parts, ...splitWords]);
}

const targets: TargetConfig[] = [
  {
    category: "术中辅助处置",
    subcategory: "麻醉镇静监护",
    requiresManualConfirm: true,
    names: [
      "局部麻醉费（局部浸润麻醉）",
      "局部麻醉费（局部静脉麻醉）",
      "局部麻醉费（神经阻滞麻醉）",
      "局部麻醉费（神经阻滞麻醉）-超过2小时（加收）",
      "局部麻醉费（椎管内麻醉）",
      "局部麻醉费（椎管内麻醉）-超过2小时（加收）",
      "全身麻醉费（无插管全麻）",
      "全身麻醉费（插管或喉罩）",
      "全身麻醉费（插管或喉罩）-超过2小时（加收）",
      "全身麻醉费（支气管内麻醉）",
      "全身麻醉费（支气管内麻醉）-超过2小时（加收）",
      "全身麻醉费（深低温停循环麻醉）",
      "全身麻醉费（深低温停循环麻醉）-超过2小时（加收）",
      "麻醉监护下镇静",
    ],
    manualAliases: {
      "局部麻醉费（局部浸润麻醉）": ["局麻", "局部浸润", "局部浸润麻醉"],
      "局部麻醉费（神经阻滞麻醉）": ["神经阻滞", "神经阻滞麻醉", "局部神经阻滞"],
      "全身麻醉费（无插管全麻）": ["无插管全麻", "静脉全麻"],
      "全身麻醉费（插管或喉罩）": ["插管全麻", "喉罩全麻", "喉罩麻醉", "气管插管全麻"],
      "麻醉监护下镇静": ["麻醉镇静", "镇静麻醉", "MAC镇静"],
    },
  },
  {
    category: "术中辅助处置",
    subcategory: "超声影像辅助",
    requiresManualConfirm: true,
    names: [
      "B型超声检查",
      "B型超声检查-床旁检查（加收）",
      "B型超声检查-腔内检查（加收）",
      "多普勒检查（周围血管）",
      "多普勒检查（周围血管）-床旁检查（加收）",
      "多普勒检查（颅内血管）",
      "多普勒检查（颅内血管）-床旁检查（加收）",
      "多普勒检查（颅内血管）-特殊方式检查（加收）",
      "多普勒检查（颅内血管）-栓子监测（扩展）",
      "彩色多普勒超声检查（常规）",
      "彩色多普勒超声检查（常规）-床旁检查（加收）",
      "彩色多普勒超声检查（常规）-腔内检查（加收）",
      "彩色多普勒超声检查（心脏）",
      "彩色多普勒超声检查（心脏）-床旁检查（加收）",
      "彩色多普勒超声检查（心脏）-彩色多普勒超声心动图检查（经食管）（扩展）",
      "彩色多普勒超声检查（血管）",
      "彩色多普勒超声检查（血管）-床旁检查（加收）",
      "超声造影（常规）",
      "超声造影（血管）",
    ],
    manualAliases: {
      "B型超声检查-床旁检查（加收）": ["床旁超声", "床旁B超", "床旁 B 超"],
      "多普勒检查（颅内血管）": ["TCD", "颅内多普勒", "颅内多普勒血流图"],
      "多普勒检查（颅内血管）-栓子监测（扩展）": ["栓子监测", "TCD栓子监测"],
      "彩色多普勒超声检查（心脏）": ["心脏彩超", "心脏超声"],
      "彩色多普勒超声检查（心脏）-床旁检查（加收）": ["床旁心脏彩超", "床旁心脏超声"],
      "彩色多普勒超声检查（心脏）-彩色多普勒超声心动图检查（经食管）（扩展）": ["TEE", "经食管超声", "经食管超声心动图"],
      "彩色多普勒超声检查（血管）": ["血管彩超", "血管彩色多普勒", "血管超声"],
      "超声造影（血管）": ["血管超声造影"],
    },
  },
  {
    category: "护理处置",
    subcategory: "管路护理",
    requiresManualConfirm: true,
    names: [
      "置管护理（深静脉/动脉）",
      "气管插管护理",
      "引流管护理",
      "引流管护理-闭式引流护理（加收）",
      "造口/造瘘护理",
    ],
    manualAliases: {
      "置管护理（深静脉/动脉）": ["置管护理", "深静脉置管护理", "动脉置管护理", "PICC护理", "PICC 护理", "植入式给药装置护理"],
      "引流管护理": ["引流管冲洗", "引流管更换引流装置", "引流管引流"],
    },
  },
  {
    category: "其他介入",
    subcategory: "呼吸气道介入",
    requiresManualConfirm: true,
    names: [
      "经皮氧分压/二氧化碳监测费",
      "支气管镜检查费（常规内镜）",
      "支气管镜检查费（常规内镜）-特殊光源检查（加收）",
      "支气管镜检查费（超声内镜）",
      "支气管镜治疗费（常规）",
      "支气管镜治疗费（特殊）",
      "气道支架置入费",
      "气道支架取出费",
      "无创气管食管瘘修补费",
      "无创肺减容费",
      "无创气管异物取出费",
    ],
    manualAliases: {
      "经皮氧分压/二氧化碳监测费": ["经皮氧分压监测", "经皮二氧化碳监测"],
      "支气管镜治疗费（特殊）": ["特殊支气管镜治疗", "经内镜气管扩张术", "气管扩张"],
      "气道支架置入费": ["气道支架", "支气管镜支架", "经纤支镜支架置入术", "经电子支气管镜支架置入术"],
      "无创气管食管瘘修补费": ["经纤支镜支气管胸膜瘘堵塞术", "支气管胸膜瘘堵塞"],
      "无创肺减容费": ["肺减容", "无创肺减容"],
    },
  },
  {
    category: "其他介入",
    subcategory: "泌尿介入",
    requiresManualConfirm: true,
    names: [
      "泌尿系造瘘费",
      "泌尿系造瘘费-上尿路（加收）",
      "肾穿刺费",
      "肾穿刺费-肾周脓肿引流（加收）",
      "输尿管支架置入费",
      "输尿管支架取出费",
      "尿道支架置入费",
      "尿道支架取出费",
      "精索静脉曲张栓塞费",
      "前列腺囊肿引流费",
    ],
    manualAliases: {
      "泌尿系造瘘费": ["肾造瘘", "经皮肾造瘘", "膀胱造瘘术", "肾实质切开造瘘术"],
      "肾穿刺费-肾周脓肿引流（加收）": ["肾周脓肿引流"],
      "输尿管支架置入费": ["输尿管支架", "输尿管支架置入", "经膀胱镜输尿管支架置入术", "经输尿管镜支架置入术", "输尿管支架管冲洗"],
      "输尿管支架取出费": ["输尿管支架取出", "经输尿管镜支架取出术", "经膀胱镜输尿管支架取出术"],
      "尿道支架置入费": ["尿道支架", "尿道支架置入"],
      "尿道支架取出费": ["尿道支架取出"],
      "精索静脉曲张栓塞费": ["精索静脉栓塞", "精索静脉曲张栓塞术"],
    },
  },
  {
    category: "其他介入",
    subcategory: "骨科疼痛介入",
    requiresManualConfirm: true,
    names: [
      "椎体成形费",
      "椎体成形费-后凸成形（扩展）",
      "肢体神经松解费",
      "肢体血管吻合费",
    ],
    manualAliases: {
      "椎体成形费": ["椎体成形", "经皮椎体成形术", "PVP"],
      "椎体成形费-后凸成形（扩展）": ["后凸成形", "椎体后凸成形", "PKP"],
      "肢体神经松解费": ["肢体神经松解"],
    },
  },
  {
    category: "其他介入",
    subcategory: "X线及DSA辅助造影",
    requiresManualConfirm: true,
    names: [
      "X线造影成像",
      "X线造影成像-全消化道造影（加收）",
      "X线造影成像-泪道造影（扩展）",
      "X线造影成像-T管造影（扩展）",
    ],
    manualAliases: {
      "X线造影成像": ["脊髓造影", "椎间盘造影", "支气管造影", "静脉胆道造影", "静脉泌尿系造影", "逆行泌尿系造影", "肾盂穿刺造影", "膀胱造影", "子宫输卵管造影", "子宫输卵管碘油造影", "四肢淋巴管造影", "窦道及瘘管造影", "窦道造影", "瘘管造影", "四肢血管造影", "引流管造影", "泌尿系造影"],
      "X线造影成像-T管造影（扩展）": ["T管造影", "T 管造影"],
      "X线造影成像-泪道造影（扩展）": ["泪道造影"],
    },
  },
];

function readRows(sheetName: string) {
  const workbook = XLSX.readFile(path.join(root, sourceFile), { cellDates: false });
  return XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
  });
}

function extractProjectRows() {
  return readRows("项目").slice(2).map((row, index) => ({
    sourceRow: index + 3,
    code: normalizeCode(row[1]),
    officialName: officialNameText(row[2]),
    description: cellText(row[3]),
    unit: parseUnit(row),
    note: cellText(row[7]),
    price: parsePrice(row[6]),
  })).filter((row) => row.officialName);
}

function extractAliases() {
  const aliases = new Map<string, { oldCodes: string[]; oldNames: string[] }>();
  let currentName = "";
  for (const row of readRows("映射").slice(2)) {
    const officialName = officialNameText(row[1]);
    if (officialName) currentName = officialName;
    const oldCode = normalizeCode(row[2]);
    const oldName = cellText(row[3]);
    if (!currentName) continue;
    const entry = aliases.get(currentName) || { oldCodes: [], oldNames: [] };
    if (oldCode) entry.oldCodes.push(oldCode);
    if (oldName) entry.oldNames.push(oldName);
    aliases.set(currentName, entry);
  }
  for (const [name, entry] of aliases.entries()) {
    aliases.set(name, { oldCodes: uniq(entry.oldCodes), oldNames: uniq(entry.oldNames) });
  }
  return aliases;
}

function countSkipped(projectRows: ReturnType<typeof extractProjectRows>, selectedNames: Set<string>) {
  const cardioPattern = /冠状动脉|冠脉|心律失常|电生理|起搏器|主动脉瓣|二尖瓣|左心耳|结构性心脏病|房间隔分流|肾动脉去神经|肺动脉去神经|电复律|电除颤/;
  const neuroPattern = /脑血管|脊髓血管|颅内动脉瘤|脑血管畸形|慢性闭塞脑血管|颅神经松解|颈动脉支架|颈动脉球囊|三叉神经微球囊|脑血管腔内|脑血管栓塞|脑血管造影/;
  let cardiovascular = 0;
  let neurovascular = 0;
  for (const row of projectRows) {
    if (selectedNames.has(row.officialName)) continue;
    const text = `${row.officialName} ${row.description} ${row.note}`;
    if (cardioPattern.test(text)) cardiovascular += 1;
    if (neuroPattern.test(text)) neurovascular += 1;
  }
  return { cardiovascular, neurovascular };
}

function ambiguousMappedAliases(aliasMap: Map<string, { oldCodes: string[]; oldNames: string[] }>, selectedNames: Set<string>) {
  const usage = new Map<string, Set<string>>();
  for (const name of selectedNames) {
    for (const oldName of aliasMap.get(name)?.oldNames || []) {
      const targets = usage.get(oldName) || new Set<string>();
      targets.add(name);
      usage.set(oldName, targets);
    }
  }
  return new Set([...usage.entries()].filter(([, targets]) => targets.size > 1).map(([oldName]) => oldName));
}

async function main() {
  const projectRows = extractProjectRows();
  const aliasMap = extractAliases();
  const existingItems = JSON.parse(await fs.readFile(path.join(root, "src", "data", "items.generated.json"), "utf8")) as BillingItem[];
  const existingCodes = new Set(existingItems.map((item) => item.newCode).filter(Boolean));
  const existingNames = new Set(existingItems.map((item) => normalizeName(item.newName)));

  const selectedNames = new Set(targets.flatMap((target) => target.names));
  const ambiguousOldNames = ambiguousMappedAliases(aliasMap, selectedNames);
  const items: BillingItem[] = [];
  const addedAliases: ImportSummary["addedAliases"] = [];
  let duplicateExistingItems = 0;

  for (const target of targets) {
    for (const name of target.names) {
      const row = projectRows.find((entry) => entry.officialName === name);
      if (!row) throw new Error(`印刷版.xlsx 未找到目标项目：${name}`);
      const mapped = aliasMap.get(name) || { oldCodes: [], oldNames: [] };
      const aliases = uniq([...(target.manualAliases?.[name] || []), ...mapped.oldNames.filter((oldName) => !ambiguousOldNames.has(oldName))]);
      const itemType = detectItemType(name);
      const generatedCode = row.code || `print-${row.sourceRow}`;
      const sourceFileName = `${sourceFile}#项目!${row.sourceRow}`;

      if (existingCodes.has(generatedCode) || existingNames.has(normalizeName(name))) {
        duplicateExistingItems += 1;
      }

      const itemWithoutKeywords: Omit<BillingItem, "keywords"> = {
        systemCategory: `${target.category} / ${target.subcategory}`,
        sourceFile: sourceFileName,
        newCode: generatedCode,
        newName: name,
        itemType,
        description: row.description,
        unit: row.unit,
        billingNote: [
          row.note,
          target.requiresManualConfirm ? "该辅助项目不默认加入手术收费组合，需根据实际发生及院内口径确认。" : "",
        ].filter(Boolean).join(" "),
        price: row.price,
        oldCodes: mapped.oldCodes,
        oldNames: aliases,
        parentItem: parentItem(name),
        isInterventional: /介入|支架|造影|穿刺|栓塞|镜|成形|造瘘|置入|取出|松解|吻合|麻醉|监测|护理|超声/.test(`${name} ${row.description}`),
        isCommonCathLabItem: true,
        requiresManualConfirm: target.requiresManualConfirm,
      };
      const quantityMeta = inferQuantityMeta(itemWithoutKeywords);
      items.push({
        ...itemWithoutKeywords,
        needsQuantityConfirmation: quantityMeta.needsQuantityConfirmation || undefined,
        quantityType: quantityMeta.quantityType as QuantityType | undefined,
        quantityRuleText: quantityMeta.ruleText,
        keywords: buildKeywords(itemWithoutKeywords, aliases),
      });
      for (const aliasName of aliases) {
        addedAliases.push({
          aliasName,
          targetOfficialName: name,
          category: target.category,
          subcategory: target.subcategory,
        });
      }
    }
  }

  const categoryCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.systemCategory] = (acc[item.systemCategory] || 0) + 1;
    return acc;
  }, {});
  const skipped = countSkipped(projectRows, selectedNames);
  const summary: ImportSummary = {
    sourceFile,
    generatedAt: new Date().toISOString(),
    addedOfficialItems: items.map((item) => item.newName),
    addedAliases,
    skippedCardiovascularItems: skipped.cardiovascular,
    skippedNeurovascularItems: skipped.neurovascular,
    duplicateExistingItems,
    actualAddedItemCount: items.length,
    actualAddedAliasCount: addedAliases.length,
    categoryCounts,
  };

  const dataDir = path.join(root, "src", "data");
  await fs.writeFile(path.join(dataDir, "auxiliaryCathlabItems.generated.json"), `${JSON.stringify(items, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(dataDir, "auxiliaryCathlabImportSummary.generated.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`新增辅助正式项目 ${items.length} 条，alias ${addedAliases.length} 条。跳过心血管 ${skipped.cardiovascular} 条，神经/脑血管 ${skipped.neurovascular} 条。`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
