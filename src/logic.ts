import type { BillingItem, ProcedureProfile, Recommendation, SystemGroup } from "./types";
import type { ApiRule } from "./api";
import type { ChoicePrompt } from "./types";
import { manualBillingRules } from "./associatedProcedureRules";
import { applyProcedureAssistFeeRules } from "./procedureAssistFeeRules";
import { findNeuroGroupProcedure, shouldUseNeuroGroupProcedure, type NeuroGroupProcedure } from "./data/neuroGroup";

type SystemId = SystemGroup;

type ProcedureSystem = {
  id: SystemId;
  name: string;
  keywords: RegExp;
};

type ProcedureAction = {
  id: string;
  name: string;
  systemId: SystemId;
  keywords: RegExp;
  targetItemName: string;
  actualAction: string;
  isTherapeutic?: boolean;
  manualOnly?: boolean;
  manualMessage?: string;
  reason: string;
  addons?: (segment: string, fullText: string) => string[];
  exclusions?: (segment: string, fullText: string) => string[];
  reviews?: (segment: string, fullText: string) => string[];
  recordAdvice?: string[];
};

type ProcedureAlias = {
  systemId: SystemId;
  actionId: string;
  actionName: string;
  actualAction: string;
  billingItemName: string;
  expressions: string[];
  isTherapeutic?: boolean;
  manualOnly?: boolean;
  manualMessage?: string;
  reason: string;
  addons?: (segment: string, fullText: string) => string[];
  exclusions?: (segment: string, fullText: string) => string[];
  reviews?: (segment: string, fullText: string) => string[];
  recordAdvice?: string[];
};

type ParsedSegment = {
  raw: string;
  systemId: SystemId | null;
  inherited: boolean;
  actions: ProcedureAction[];
};

type LatestComboItem = {
  itemName: string;
  unit?: string;
  price?: number;
  priceOptions?: number[];
  quantity?: number;
  if?: string;
  condition?: string;
  warning?: string;
  sourceType?: string;
  quantityHint?: string;
  forceInclude?: boolean;
};

type LatestComboRule = {
  group: string;
  name: string;
  triggers?: string[];
  combo?: LatestComboItem[];
  comboLogic?: LatestComboItem[];
  conditionalItems?: LatestComboItem[];
  questions?: string[];
  manualReview?: string;
  note?: string;
  source?: string;
  priceSourcePriority?: "officialExcelFirst";
};

const latestFeeStandard = manualBillingRules as {
  metadata: { version: string; globalNote: string; priceSourcePriority?: "officialExcelFirst" };
  priceSourcePriority?: "officialExcelFirst";
  heartInterventionCombos: LatestComboRule[];
  peripheralNeuroItems: Array<{
    code: string;
    itemName: string;
    unit: string;
    price: number | null;
    billingNote?: string;
    aliases?: string[];
  }>;
};

const systems: ProcedureSystem[] = [
  {
    id: "neuro_intervention",
    name: "神经介入",
    keywords: /脑血管|脑动脉|颅内|颅外|椎动脉|颈动脉|颅内动脉瘤|脑动脉瘤|脑静脉窦|神经介入|脊髓血管|周围神经|颅神经|弹簧圈|密网支架|密网|血流导向/i,
  },
  {
    id: "coronary_intervention",
    name: "冠脉介入",
    keywords: /冠脉|冠状动脉|左主干|前降支|回旋支|右冠|RCA|LAD|LCX|PCI/i,
  },
  {
    id: "pacemaker",
    name: "起搏器系统",
    keywords: /起搏器|临起|临时起搏|永久起搏器|电极导线|起搏线|换机|换盒|脉冲发生器|电极调整|电极复位|电极位置调整/i,
  },
  {
    id: "electrophysiology",
    name: "电生理系统",
    keywords: /房颤|AF|房扑|室上速|SVT|室速|VT|预激|旁道|AVNRT|AVRT|房早|室早|房速|电生理|EPS|三维标测|CARTO|Carto|EnSite|Rhythmia|心腔内超声|ICE|肥厚型心肌病|肥厚梗阻|HOCM|室间隔肥厚|室间隔消融/i,
  },
  {
    id: "structural_congenital",
    name: "结构性心脏病 / 先心病系统",
    keywords: /先心|结构性|房缺|ASD|房间隔缺损|室缺|VSD|室间隔缺损|PFO|卵圆孔|左心耳|LAAO|动脉导管未闭|PDA/i,
  },
  {
    id: "cardiac_catheterization",
    name: "心导管 / 心功能检查",
    keywords: /右心导管|左心导管|心导管|RHC|LHC|左心室造影|心室造影|心腔压力|压力测定|血氧测定|分流测定/i,
  },
  {
    id: "hypertension_renal",
    name: "高血压 / 肾动脉相关",
    keywords: /高血压|肾动脉|去神经|RDN|肺动脉去神经/i,
  },
  {
    id: "other",
    name: "其他导管室项目",
    keywords: /其他导管室|其他介入/i,
  },
];

export const systemClassifier = systems;

const coronaryVessels = [
  { id: "LM", label: "左主干 LM", keys: ["LM", "左主干"] },
  { id: "LAD", label: "前降支 LAD", keys: ["LAD", "前降支", "左前降支"] },
  { id: "LCX", label: "回旋支 LCX", keys: ["LCX", "回旋支", "左回旋支"] },
  { id: "RCA", label: "右冠 RCA", keys: ["RCA", "右冠", "右冠状动脉"] },
  { id: "Graft", label: "桥血管", keys: ["桥血管", "桥"] },
  { id: "RI", label: "中间支 RI", keys: ["RI", "中间支"] },
];

function unique<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function systemName(systemId: SystemId) {
  return systems.find((system) => system.id === systemId)?.name ?? "综合判断";
}

function detectExplicitSystem(segment: string): SystemId | null {
  return systems.find((system) => system.keywords.test(segment))?.id ?? null;
}

function splitProcedureInput(input: string) {
  return input
    .replace(/＋/g, "+")
    .split(/\s*(?:\+|，|,|、|；|;|并且|并|同时|联合|伴|后|和|加)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findItem(items: BillingItem[], includes: string) {
  return findOfficialItem(items, includes) || items.find((item) => item.newName.includes(includes) && item.itemType === "main") || items.find((item) => item.newName.includes(includes));
}

function itemExists(items: BillingItem[], includes: string) {
  return Boolean(findItem(items, includes));
}

function mentionedVessels(text: string) {
  return coronaryVessels.filter((vessel) => vessel.keys.some((key) => text.includes(key)));
}

function numberBeforeRoot(text: string) {
  const match = text.match(/(\d+)\s*根/);
  return match ? Number(match[1]) : 0;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasRegex(expressions: string[]) {
  return new RegExp(expressions.map(escapeRegExp).join("|"), "i");
}

function normalizeSearchText(value: string) {
  return value.replace(/＋/g, "+").replace(/\s+/g, "").toLowerCase();
}

function detectItemTypeByName(name: string): BillingItem["itemType"] {
  if (name.includes("加收")) return "add_on";
  if (name.includes("扩展")) return "extension";
  if (name.includes("减收")) return "reduction";
  return "main";
}

export function mergeLatestStandardItems(items: BillingItem[]) {
  const merged = [...items];
  for (const latest of latestFeeStandard.peripheralNeuroItems) {
    const existingIndex = merged.findIndex((item) => item.newCode === latest.code || item.newName === latest.itemName);
    const base = existingIndex >= 0 ? merged[existingIndex] : undefined;
    const item: BillingItem = {
      systemCategory: "神经系统",
      sourceFile: "新外周神经介入收费.xlsx",
      newCode: latest.code,
      newName: latest.itemName,
      itemType: detectItemTypeByName(latest.itemName),
      description: base?.description || "",
      unit: latest.unit || base?.unit || "",
      billingNote: latest.billingNote || base?.billingNote || "",
      price: typeof latest.price === "number" ? latest.price : base?.price ?? null,
      oldCodes: base?.oldCodes || [],
      oldNames: base?.oldNames || [],
      parentItem: latest.itemName.split(/[-－]/)[0] || latest.itemName,
      keywords: unique([...(base?.keywords || []), latest.itemName, latest.code, ...(latest.aliases || [])]),
      isInterventional: true,
      isCommonCathLabItem: true,
      needsQuantityConfirmation: base?.needsQuantityConfirmation,
      quantityType: base?.quantityType,
      quantityRuleText: base?.quantityRuleText,
    };
    if (existingIndex >= 0) merged[existingIndex] = { ...base, ...item };
    else merged.push(item);
  }
  return merged;
}

const itemNameAliases: Record<string, string[]> = {
  房间隔分流术: ["房间隔分流费"],
  房间隔穿刺术: ["房间隔分流费"],
  三腔起搏器除颤器安装加收: ["永久起搏器安装费-三腔起搏器/除颤器安装"],
  "三腔起搏器/除颤器安装加收": ["永久起搏器安装费-三腔起搏器/除颤器安装"],
  囊袋清创: ["永久起搏器取出费-囊袋清创"],
  "囊袋清创（加收）": ["永久起搏器取出费-囊袋清创"],
  "永久起搏器安装费/ICD相关安装费": ["永久起搏器安装费"],
  经导管主动脉瓣置换相关项目: ["主动脉瓣置换费（介入）"],
  TEER相关手术费: ["二尖瓣成形费（介入）"],
  脑循环造影费: ["脑血管造影费"],
};

function compactItemName(value: string) {
  return value.replace(/[（）()\/、\s]/g, "").replace(/相关项目|相关手术费|术$/g, "");
}

function findOfficialItem(items: BillingItem[], name: string) {
  const candidates = unique([name, ...(itemNameAliases[name] || []), ...(itemNameAliases[compactItemName(name)] || [])]);
  for (const candidate of candidates) {
    const exactMain = items.find((item) => item.newName === candidate && item.itemType === "main");
    if (exactMain) return exactMain;
    const exact = items.find((item) => item.newName === candidate);
    if (exact) return exact;
    const looseMain = items.find((item) => item.itemType === "main" && (item.newName.includes(candidate) || candidate.includes(item.newName)));
    if (looseMain) return looseMain;
    const compact = compactItemName(candidate);
    const compactHit = items.find((item) => {
      const itemCompact = compactItemName(item.newName);
      return item.itemType === "main" && (itemCompact.includes(compact) || compact.includes(itemCompact));
    });
    if (compactHit) return compactHit;
    const compactAnyHit = items.find((item) => {
      const itemCompact = compactItemName(item.newName);
      return itemCompact.includes(compact) || compact.includes(itemCompact);
    });
    if (compactAnyHit) return compactAnyHit;
  }
  return undefined;
}

function findOfficialItemStrict(items: BillingItem[], name: string) {
  const candidates = unique([name, ...(itemNameAliases[name] || []), ...(itemNameAliases[compactItemName(name)] || [])]);
  for (const candidate of candidates) {
    const exactMain = items.find((item) => item.newName === candidate && item.itemType === "main");
    if (exactMain) return exactMain;
    const exact = items.find((item) => item.newName === candidate);
    if (exact) return exact;
    const compact = compactItemName(candidate);
    const compactExactMain = items.find((item) => item.itemType === "main" && compactItemName(item.newName) === compact);
    if (compactExactMain) return compactExactMain;
    const compactExact = items.find((item) => compactItemName(item.newName) === compact);
    if (compactExact) return compactExact;
  }
  return undefined;
}

function triggerMatches(input: string, trigger: string) {
  const normalizedInput = normalizeSearchText(input);
  const normalizedTrigger = normalizeSearchText(trigger);
  if (normalizedInput.includes(normalizedTrigger)) return true;
  const parts = normalizedTrigger.split(/[+/,，、]/).filter(Boolean);
  return parts.length > 1 && parts.every((part) => normalizedInput.includes(part));
}

const conditionAliases: Record<string, string[]> = {
  IVUS: ["IVUS", "血管内超声", "腔内超声"],
  OCT: ["OCT", "光学相干断层", "腔内影像"],
  FFR: ["FFR", "iFR", "QFR", "CFR", "caFFR", "血流储备"],
  ROTA: ["ROTA", "旋磨", "旋切"],
  IVL: ["IVL", "震波", "振波", "冲击波"],
  IABP: ["IABP", "球囊反搏"],
  TPM: ["TPM", "临时起搏", "临起", "临时起搏器"],
  His起搏: ["His起搏", "希氏束起搏"],
  静脉造影: ["选择性静脉造影", "静脉造影"],
  电生理检查: ["电生理检查", "EPS", "诱发", "标测验证"],
  血栓抽吸: ["血栓抽吸", "取栓", "抽吸", "吸栓"],
};

function conditionMatches(condition: string | undefined, input: string) {
  if (!condition) return true;
  const normalizedInput = normalizeSearchText(input);
  const parts = condition
    .replace(/[()（）]/g, "")
    .split(/\s+or\s+|\/|、|，|,|\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.some((part) => {
    const aliases = conditionAliases[part] || [part];
    return aliases.some((alias) => normalizedInput.includes(normalizeSearchText(alias)));
  });
}

function conditionalReason(itemName: string) {
  if (/取出费/.test(itemName)) return "需实际取出后才能收取";
  if (/房间隔分流|房间隔穿刺/.test(itemName)) return "需确认实际进行了房间隔穿刺/分流相关操作";
  if (/三腔/.test(itemName)) return "需确认实际为三腔起搏器/除颤器安装";
  if (/静脉造影|动静脉造影/.test(itemName)) return "需确认实际进行了对应静脉/动静脉造影";
  if (/有创心内电生理检查/.test(itemName)) return "需确认实际进行了有创心内电生理检查";
  return "";
}

function explicitConditionalOperation(itemName: string, condition: string | undefined, input: string) {
  const normalizedInput = normalizeSearchText(input);
  if (condition && conditionMatches(condition, input)) return true;
  if (/取出费/.test(itemName)) return /当场拔出|术毕拔除|手术结束拔除|临时放置后取出|当场取出|实际取出|取出|拔除|拔出|拔临起|拔起搏线/.test(input);
  if (/房间隔分流|房间隔穿刺/.test(itemName)) return hasConfirmedTransseptalPuncture(input);
  if (/三腔/.test(itemName)) return /三腔|crt/i.test(input);
  if (/静脉造影|动静脉造影/.test(itemName)) return /选择性静脉造影|静脉造影|动静脉造影/.test(input);
  if (/有创心内电生理检查/.test(itemName)) return /电生理检查|EPS|诱发|标测验证/i.test(input);
  return conditionMatches(condition, normalizedInput);
}

function deniedConditionalOperation(itemName: string, input: string) {
  if (/房间隔分流|房间隔穿刺/.test(itemName)) return hasDeniedTransseptalPuncture(input);
  return false;
}

function isConditionalLatestItem(item: LatestComboItem) {
  return Boolean(item.condition || conditionalReason(item.itemName));
}

function canApplyLatestRule(input: string, rule: LatestComboRule) {
  const targetSystem = systemIdFromLatestGroup(rule.group);
  const explicitSystems = systems.filter((system) => system.keywords.test(input)).map((system) => system.id);
  if (explicitSystems.length && !explicitSystems.includes(targetSystem)) return false;
  if (targetSystem === "coronary_intervention") {
    return /冠脉|冠状动脉|PCI|CAG|PTCA|IVUS|OCT|FFR|iFR|QFR|CTO|IABP|ROTA|IVL|左主干|前降支|回旋支|右冠|RCA|LAD|LCX/i.test(input);
  }
  if (targetSystem === "electrophysiology") {
    return Boolean(classifyElectrophysiologyAblation(input)) || /电生理|EPS|三维|ICE|CARTO|EnSite|Rhythmia/i.test(input);
  }
  return true;
}

function ablationDiseasePrompt(): ChoicePrompt {
  return {
    id: "ablation-disease",
    type: "ablation_disease",
    title: "请选择本次消融属于哪一类？",
    description: "泛称心脏射频消融、心律失常消融或导管消融时，需要先确认病种类型。",
    groups: [
      {
        title: "复杂心律失常消融",
        options: [
          { label: "房颤", query: "房颤射频消融", resultHint: "心律失常消融费（复杂）" },
          { label: "II型房扑", query: "II型房扑射频消融", resultHint: "心律失常消融费（复杂）" },
          { label: "器质性室速", query: "器质性室速射频消融", resultHint: "心律失常消融费（复杂）" },
        ],
      },
      {
        title: "常规心律失常消融",
        options: [
          { label: "常规心律失常消融", query: "常规心律失常消融", resultHint: "心律失常消融费（常规）" },
          { label: "室上速", query: "室上速射频消融", resultHint: "心律失常消融费（常规）" },
          { label: "预激综合征", query: "预激综合征消融", resultHint: "心律失常消融费（常规）" },
          { label: "I型房扑/房早/室早/房速", query: "I型房扑射频消融", resultHint: "心律失常消融费（常规）" },
        ],
      },
      {
        title: "其他消融",
        options: [
          { label: "肥厚型心肌病室间隔消融", query: "肥厚型心肌病消融", resultHint: "肥厚型心肌病消融费" },
        ],
      },
    ],
  };
}

function transseptalPrompt(input: string): ChoicePrompt {
  return {
    id: "transseptal-puncture",
    type: "transseptal_puncture",
    title: "是否进行了房间隔分流术？",
    description: "常规心律失常消融默认不加入房间隔分流费；如实际进行了房间隔分流术，请加入房间隔分流费。",
    groups: [
      {
        title: "房间隔分流术确认",
        options: [
          { label: "是，加入房间隔分流术", query: `${input}+房间隔分流术`, resultHint: "房间隔分流费" },
          { label: "否，不加入", query: `${input}+未行房间隔分流术`, resultHint: "保留当前射频消融组合" },
          { label: "不确定，人工确认", query: `${input}+房间隔分流术待确认`, resultHint: "保留当前组合并提示人工确认" },
        ],
      },
    ],
  };
}

function selectiveArteryAngiographyPrompt(input: string): ChoicePrompt {
  return {
    id: "selective-artery-angiography",
    type: "selective_artery_angiography",
    title: "是否进行了选择性动脉造影？",
    description: "室上速、预激、室早等常规消融不默认收取选择性静脉造影术；如另行选择性动脉造影，请按实际操作确认。",
    groups: [
      {
        title: "选择性动脉造影确认",
        options: [
          { label: "是，提示选择性动脉造影", query: `${input}+选择性动脉造影`, resultHint: "选择性动脉造影费需确认目录" },
          { label: "否，不加入", query: `${input}+未行选择性动脉造影`, resultHint: "保留当前射频消融组合" },
          { label: "不确定，人工确认", query: `${input}+选择性动脉造影待确认`, resultHint: "保留当前组合并提示人工确认" },
        ],
      },
    ],
  };
}

function classifyElectrophysiologyAblation(input: string): "complex_af" | "complex" | "routine" | "hcm" | "needs_choice" | null {
  const text = input.trim();
  if (/肥厚型心肌病|肥厚梗阻|HOCM|室间隔肥厚|室间隔消融|化学消融室间隔/i.test(text)) return "hcm";
  if (/房颤|心房颤动|AF|房颤射频|房颤冷冻|房颤脉冲|PFA/i.test(text)) return "complex_af";
  if (/非器质性室速|非器质性心脏病的室性心动过速/i.test(text)) return "routine";
  if (/复杂心律失常消融|复杂消融|II型房扑|复杂房扑|器质性心脏病室速|器质性室速|VT伴器质性心脏病/i.test(text)) return "complex";
  if (/常规心律失常消融|常规消融|普通消融|室上速|阵发性室上速|阵发性室上性心动过速|PSVT|SVT|预激|预激综合征|预激综合症|WPW|旁道|AVNRT|AVRT|I型房扑|I型心房扑动|一型房扑|典型房扑|房早|房性早搏|室早|室性早搏|PVC|房速|房性心动过速|非器质性室速|非器质性心脏病的室性心动过速|室性心动过速|室速|\bVT\b|\bAT\b/i.test(text)) return "routine";
  if (/^(射频消融|消融|心脏消融|心脏射频|心脏射频消融|心内射频|心内射频消融|导管消融|导管射频|导管射频消融|心律失常射频|心律失常射频消融|心律失常消融|心脏心律失常|心脏心律失常消融|心脏心律失常射频消融)$/.test(text)) return "needs_choice";
  return null;
}

export const procedureAliasDictionary: ProcedureAlias[] = [
  {
    systemId: "neuro_intervention",
    actionId: "spinal-angio",
    actionName: "脊髓血管造影",
    actualAction: "脊髓血管造影",
    billingItemName: "脊髓血管造影费",
    expressions: ["脊髓血管造影", "脊髓造影"],
    reason: "临床说法指向脊髓血管造影。",
    recordAdvice: ["写明造影血管根数；4根及以下按基础价，超过后按计价说明加收并封顶。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-angio",
    actionName: "脑血管造影",
    actualAction: "脑血管造影",
    billingItemName: "脑血管造影费",
    expressions: ["脑血管造影", "全脑造影", "全脑血管造影", "DSA", "脑动脉造影", "颈动脉造影", "椎动脉造影", "造影"],
    reason: "临床说法指向脑血管造影。",
    reviews: (segment) => (/锁骨下/.test(segment) ? ["锁骨下动脉不是全脑血管造影天然组成部分，若为单独选择性造影并有明确记录，可计入；否则需人工确认。"] : []),
    recordAdvice: ["写明每根造影血管名称、根数、是否为独立诊断性造影。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-stent",
    actionName: "脑血管支架置入",
    actualAction: "脑血管支架置入",
    billingItemName: "脑血管支架置入费",
    expressions: ["支架", "放支架", "支架置入", "颅内支架", "脑血管支架", "脑动脉支架", "静脉窦支架", "脑静脉窦支架", "支架辅助"],
    isTherapeutic: true,
    reason: "临床说法指向脑血管支架置入动作。",
    addons: (segment, fullText) => (/颅内|脑静脉窦|静脉窦/.test(`${segment} ${fullText}`) ? ["可能涉及颅内血管加收"] : []),
    reviews: (segment) => (/支架辅助/.test(segment) ? ["支架辅助是否可同时收取脑血管支架置入费，需按院内口径人工确认。"] : []),
    recordAdvice: ["写明颅内/颅外部位、病变血管、是否同一病变部位。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-balloon",
    actionName: "脑血管球囊扩张",
    actualAction: "脑血管球囊扩张",
    billingItemName: "脑血管球囊扩张费",
    expressions: ["球囊", "扩张", "球扩", "球囊扩张", "颅内球囊", "脑血管球囊", "静脉窦球囊"],
    isTherapeutic: true,
    reason: "临床说法指向脑血管球囊扩张动作。",
    addons: (segment, fullText) => (/颅内|脑静脉窦|静脉窦/.test(`${segment} ${fullText}`) ? ["可能涉及颅内血管加收"] : []),
    recordAdvice: ["写明扩张血管、颅内/颅外部位、是否同一病变部位。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-debulking",
    actionName: "脑血管腔内减容",
    actualAction: "血栓抽吸 / 机械清除 / 腔内减容",
    billingItemName: "脑血管腔内减容费",
    expressions: ["取栓", "机械取栓", "抽吸取栓", "血栓抽吸", "吸栓", "拉栓", "血栓清除", "清栓", "取血栓", "抽栓", "清除血栓", "血栓取出"],
    isTherapeutic: true,
    reason: "临床说法指向血栓抽吸、机械清除、腔内减容动作。",
    reviews: () => ["取栓是否为血栓抽吸/机械取栓/腔内减容操作需结合手术记录确认。", "脑血管腔内减容费是否按本院收费口径执行需人工确认。"],
    recordAdvice: ["写明取栓方式、目标血管、是否伴溶栓/支架/栓塞。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-thrombolysis",
    actionName: "脑血管腔内溶栓",
    actualAction: "脑血管腔内溶栓",
    billingItemName: "脑血管腔内溶栓费",
    expressions: ["溶栓", "动脉溶栓", "导管溶栓", "腔内溶栓", "尿激酶溶栓", "rtPA溶栓", "rtPA 溶栓"],
    isTherapeutic: true,
    reason: "临床说法指向脑血管腔内溶栓动作。",
    recordAdvice: ["写明溶栓血管、给药路径和治疗目的。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-embolization",
    actionName: "脑血管栓塞",
    actualAction: "脑血管栓塞",
    billingItemName: "脑血管栓塞费",
    expressions: ["栓塞", "血管栓塞", "堵血管", "封堵血管", "供血动脉栓塞"],
    isTherapeutic: true,
    reason: "临床说法指向脑血管栓塞动作。",
    recordAdvice: ["写明栓塞血管、病变类型和材料。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-aneurysm-embolization",
    actionName: "颅内动脉瘤栓塞",
    actualAction: "颅内动脉瘤栓塞",
    billingItemName: "颅内动脉瘤栓塞费",
    expressions: ["动脉瘤", "颅内动脉瘤", "脑动脉瘤", "弹簧圈", "弹簧圈栓塞", "圈栓", "圈套", "瘤腔栓塞", "支架辅助弹簧圈", "支架辅助", "辅助栓塞", "密网", "密网支架", "单纯密网支架", "血流导向", "血流导向支架", "Pipeline", "Pipeline支架", "FD支架"],
    isTherapeutic: true,
    reason: "临床说法指向颅内动脉瘤栓塞动作；单纯弹簧圈、弹簧圈+支架/密网支架或单纯密网支架均归入颅内动脉瘤栓塞费。",
    reviews: () => ["新外周神经介入收费备注：颅内动脉瘤栓塞术包括单纯弹簧圈、弹簧圈+支架或密网支架、单纯密网支架，均按脑血管造影费+颅内动脉瘤栓塞费，不另收脑血管支架置入费。"],
    recordAdvice: ["写明动脉瘤部位、栓塞方式、是否单纯弹簧圈/支架辅助/密网支架。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "neuro-cto-recanalization",
    actionName: "慢性闭塞脑血管逆向再通",
    actualAction: "慢性闭塞脑血管逆向再通",
    billingItemName: "慢性闭塞脑血管逆向再通费（介入）",
    expressions: ["慢性闭塞脑血管逆向再通", "脑血管逆向再通", "脑血管逆向开通", "脑血管CTO", "慢性闭塞脑血管"],
    isTherapeutic: true,
    reason: "临床说法指向慢性闭塞脑血管逆向再通治疗。",
    recordAdvice: ["写明闭塞血管、逆向路径、再通结果和是否涉及颅内血管。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "peripheral-nerve-electrode",
    actionName: "周围神经电极置入",
    actualAction: "周围神经电极置入",
    billingItemName: "周围神经电极置入费",
    expressions: ["周围神经电极置入", "周围神经电极", "神经电极置入", "迷走神经刺激器置入", "骶神经刺激装置置入"],
    reason: "临床说法指向周围神经电极置入。",
    reviews: () => ["同台手术不得同时收取周围神经电极取出费，需按实际置入/取出情况确认。"],
    recordAdvice: ["写明电极置入部位、刺激装置类型和是否同台取出。"],
  },
  {
    systemId: "neuro_intervention",
    actionId: "cranial-nerve-release",
    actionName: "颅神经松解",
    actualAction: "颅神经松解",
    billingItemName: "颅神经松解费",
    expressions: ["颅神经松解", "三叉神经微球囊压迫", "三叉神经球囊压迫", "三叉神经松解"],
    reason: "临床说法指向颅神经松解相关操作。",
    recordAdvice: ["写明处理神经、入路和实际松解/压迫扩张操作。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-angio",
    actionName: "冠状动脉造影",
    actualAction: "冠状动脉造影",
    billingItemName: "冠状动脉造影费",
    expressions: ["冠脉造影", "冠状动脉造影", "CAG", "造影"],
    reason: "临床说法指向冠状动脉造影。",
    recordAdvice: ["写明诊断性造影范围、是否含左心室造影、是否含桥血管造影。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-stent",
    actionName: "冠状动脉支架置入",
    actualAction: "冠状动脉支架置入",
    billingItemName: "冠状动脉支架置入费",
    expressions: ["支架", "放支架", "PCI", "支架置入", "DES", "药物支架"],
    isTherapeutic: true,
    reason: "临床说法指向冠状动脉支架置入动作，按血管计价，不按支架枚数计价。",
    exclusions: (_segment, fullText) => (/球囊|球扩|预扩|后扩/.test(fullText) ? ["同一冠脉血管已收支架置入费时，普通预扩张球囊或后扩张球囊通常不再另收冠状动脉球囊扩张费；需根据是否同一血管判断。"] : []),
    recordAdvice: ["逐根写明处理血管名称，支架枚数可记录但不作为计费数量依据。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-balloon",
    actionName: "冠状动脉球囊扩张",
    actualAction: "冠状动脉球囊扩张 / 药物球囊治疗",
    billingItemName: "冠状动脉球囊扩张费",
    expressions: ["球囊", "球扩", "扩张", "预扩", "后扩", "药球", "药物球囊", "DCB"],
    isTherapeutic: true,
    reason: "临床说法指向冠状动脉球囊扩张或药物球囊治疗。",
    exclusions: (_segment, fullText) => (/支架/.test(fullText) ? ["同一冠脉血管已收支架置入费时，普通预扩张球囊或后扩张球囊通常不再另收冠状动脉球囊扩张费；药物球囊用于独立病变时按院内口径确认。"] : []),
    recordAdvice: ["写明球囊扩张血管及是否与支架为同一血管/同一病变部位。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-debulking",
    actionName: "冠状动脉腔内减容",
    actualAction: "血栓抽吸 / 斑块处理 / 腔内减容",
    billingItemName: "冠状动脉腔内减容费",
    expressions: ["旋磨", "旋切", "激光", "振波", "震波", "冲击波", "IVL", "血栓抽吸", "取栓", "抽吸", "吸栓", "血栓清除", "减容"],
    isTherapeutic: true,
    reason: "临床说法指向冠状动脉血栓抽吸、斑块处理或腔内减容动作。",
    recordAdvice: ["写明减容方式、处理血管和病变性质。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-thrombolysis",
    actionName: "冠状动脉溶栓",
    actualAction: "冠状动脉内溶栓 / 导管溶栓",
    billingItemName: "冠状动脉溶栓费",
    expressions: ["溶栓", "冠脉溶栓", "冠状动脉溶栓", "导管溶栓", "腔内溶栓", "尿激酶", "尿激酶溶栓", "rtPA溶栓", "rtPA 溶栓"],
    isTherapeutic: true,
    reason: "临床说法指向冠状动脉内溶栓治疗；在冠脉上下文中，“溶栓/尿激酶”等应映射到冠状动脉溶栓费。",
    reviews: () => ["冠状动脉溶栓费不含冠状动脉造影；是否同一治疗血管、是否与支架/球囊/抽吸分别计费需结合手术记录确认。"],
    recordAdvice: ["写明溶栓药物、给药路径、目标血管、是否与支架/球囊/抽吸为同一血管。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-imaging",
    actionName: "冠状动脉腔内影像学检查",
    actualAction: "冠状动脉腔内影像学检查",
    billingItemName: "冠状动脉腔内影像学检查费",
    expressions: ["IVUS", "血管内超声", "腔内超声", "OCT", "腔内影像", "光学相干断层"],
    isTherapeutic: true,
    reason: "临床说法指向 IVUS/OCT 等冠状动脉腔内影像学检查。",
    recordAdvice: ["写明使用 IVUS/OCT 及检查血管。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-flow",
    actionName: "冠状动脉血流储备功能检查",
    actualAction: "冠状动脉血流储备功能检查",
    billingItemName: "冠状动脉血流储备功能检查费",
    expressions: ["FFR", "iFR", "QFR", "CFR", "caFFR", "血流储备", "功能学评估"],
    isTherapeutic: true,
    reason: "临床说法指向冠状动脉血流储备功能检查。",
    recordAdvice: ["写明 FFR/iFR/QFR/CFR/caFFR 方法和检查血管。"],
  },
  {
    systemId: "coronary_intervention",
    actionId: "coronary-cto",
    actionName: "冠状动脉慢性完全闭塞血管逆向再通",
    actualAction: "冠状动脉慢性完全闭塞血管逆向再通",
    billingItemName: "冠状动脉慢性完全闭塞血管逆向再通治疗费",
    expressions: ["CTO", "慢闭", "慢性闭塞", "逆向开通", "逆向再通", "逆向导丝"],
    isTherapeutic: true,
    reason: "临床说法指向冠状动脉 CTO 逆向再通动作。",
    recordAdvice: ["写明 CTO、逆向路径、目标血管和再通结果。"],
  },
  {
    systemId: "electrophysiology",
    actionId: "ep-complex-ablation",
    actionName: "复杂心律失常消融",
    actualAction: "复杂心律失常消融",
    billingItemName: "心律失常消融费（复杂）",
    expressions: ["房颤", "心房颤动", "AF", "房颤消融", "房颤射频", "房颤冷冻", "房颤脉冲", "PFA", "II型房扑", "复杂房扑", "器质性室速", "器质性室速", "器质性心脏病室速", "VT伴器质性心脏病", "复杂消融"],
    isTherapeutic: true,
    reason: "临床说法指向复杂心律失常消融。",
    reviews: () => ["有创心内电生理检查是否同时涉及收费，需按院内规则确认。"],
  },
  {
    systemId: "electrophysiology",
    actionId: "ep-routine-ablation",
    actionName: "心律失常消融",
    actualAction: "心律失常消融",
    billingItemName: "心律失常消融费（常规）",
    expressions: ["室上速", "SVT", "PSVT", "阵发性室上速", "阵发性室上性心动过速", "房速", "房性心动过速", "AT", "普通消融", "旁道", "预激", "预激综合征", "预激综合症", "WPW", "AVNRT", "AVRT", "I型房扑", "I型心房扑动", "一型房扑", "典型房扑", "房早", "房性早搏", "室早", "室性早搏", "PVC", "非器质性室速", "非器质性心脏病的室性心动过速", "室性心动过速", "室速", "VT"],
    isTherapeutic: true,
    reason: "临床说法指向心律失常消融，复杂/普通需结合价格表和院内规则判断。",
    reviews: () => ["心律失常消融复杂/普通分类需按价格表和院内规则确认。"],
  },
  {
    systemId: "electrophysiology",
    actionId: "ep-hcm-ablation",
    actionName: "肥厚型心肌病消融",
    actualAction: "肥厚型心肌病室间隔消融",
    billingItemName: "肥厚型心肌病消融费",
    expressions: ["肥厚型心肌病", "肥厚型心肌病消融", "肥厚梗阻", "HOCM", "室间隔肥厚", "室间隔消融", "化学消融室间隔"],
    isTherapeutic: true,
    reason: "输入明确指向肥厚型心肌病/室间隔消融。",
  },
  {
    systemId: "electrophysiology",
    actionId: "ep-study",
    actionName: "有创心内电生理检查",
    actualAction: "有创心内电生理检查",
    billingItemName: "有创心内电生理检查费",
    expressions: ["电生理检查", "心内电生理", "诱发", "标测验证", "电生理", "EPS"],
    reason: "临床说法指向有创心内电生理检查。",
  },
  {
    systemId: "electrophysiology",
    actionId: "ep-3d-map",
    actionName: "心腔三维标测",
    actualAction: "心腔三维标测",
    billingItemName: "心腔三维标测费",
    expressions: ["三维", "三维标测", "CARTO", "Carto", "EnSite", "Rhythmia"],
    reason: "临床说法指向心腔三维标测。",
  },
  {
    systemId: "electrophysiology",
    actionId: "ep-ice",
    actionName: "心腔内超声心动图检查",
    actualAction: "心腔内超声心动图检查",
    billingItemName: "心腔内超声心动图检查费",
    expressions: ["ICE", "心腔内超声"],
    reason: "临床说法指向心腔内超声心动图检查。",
  },
  {
    systemId: "pacemaker",
    actionId: "pacemaker-temp-install",
    actionName: "临时起搏器安装",
    actualAction: "临时起搏器安装",
    billingItemName: "临时起搏器安装费",
    expressions: ["临起", "临时起搏", "临时起搏器", "临时起搏线", "临时起搏电极", "临起安装", "单纯临时起搏器安装", "临时起搏器安装", "临时起搏器植入"],
    isTherapeutic: true,
    reason: "临床说法指向临时起搏器安装。",
    recordAdvice: ["写明临时起搏器植入路径、运行时长和监测情况。"],
  },
  {
    systemId: "pacemaker",
    actionId: "pacemaker-temp-monitor",
    actionName: "临时起搏器运行监测",
    actualAction: "临时起搏器运行监测",
    billingItemName: "临时起搏器运行监测费",
    expressions: ["临时起搏监测", "临时起搏运行", "起搏器运行", "起搏器监测", "临起监测", "参数调整", "运行监测", "监测"],
    reason: "临床说法指向临时起搏器运行监测。",
  },
  {
    systemId: "pacemaker",
    actionId: "pacemaker-temp-remove",
    actionName: "临时起搏器取出",
    actualAction: "临时起搏器取出",
    billingItemName: "临时起搏器取出费",
    expressions: ["拔临起", "拔起搏线", "取临时起搏器", "临时起搏器取出", "取出临时起搏电极", "拔除", "取出", "拔出", "当场拔出", "术毕拔除", "手术结束拔除", "临时放置后取出", "当场取出"],
    reason: "临床说法指向临时起搏器取出。",
    exclusions: (_segment, fullText) =>
      /临起安装|临时起搏器安装|临时起搏器植入|临时起搏/.test(fullText)
        ? ["临时起搏器取出费需在实际取出临时起搏器后单独结算，不能在置入当日当次随置入术一并收取。"]
        : [],
    reviews: () => ["临时起搏器取出费只有在患者实际取出临时起搏器后才能收取。"],
    recordAdvice: ["取出时应单独记录实际取出时间、取出过程和电极导线是否完全移除。"],
  },
  {
    systemId: "pacemaker",
    actionId: "pacemaker-replacement",
    actionName: "永久起搏器更换",
    actualAction: "起搏器更换 / 脉冲发生器更换",
    billingItemName: "永久起搏器更换费",
    expressions: ["起搏器更换", "更换起搏器", "起搏器换机", "起搏器换盒", "脉冲发生器更换", "永久起搏器更换"],
    isTherapeutic: true,
    reason: "临床说法指向永久起搏器更换。心脏植入式装置适配费仅在起搏器更换或电极调整术时进入处置费模块。",
    recordAdvice: ["写明更换原因、更换装置类型、是否进行装置连接和参数适配。"],
  },
  {
    systemId: "pacemaker",
    actionId: "pacemaker-electrode-adjustment",
    actionName: "电极调整术",
    actualAction: "起搏电极调整 / 复位 / 位置调整",
    billingItemName: "电极调整术",
    expressions: ["电极调整", "电极调整术", "起搏电极调整", "电极复位", "电极位置调整"],
    isTherapeutic: true,
    reason: "临床说法指向起搏电极调整术。心脏植入式装置适配费仅在起搏器更换或电极调整术时进入处置费模块。",
    recordAdvice: ["写明电极调整原因、调整位置、参数测试和术后参数。"],
  },
  {
    systemId: "pacemaker",
    actionId: "pacemaker-permanent-install",
    actionName: "永久起搏器安装",
    actualAction: "永久起搏器安装",
    billingItemName: "永久起搏器安装费",
    expressions: ["永久起搏器", "永久起搏器植入", "单腔起搏器", "双腔起搏器", "无导线起搏器", "His起搏", "希氏束起搏", "三腔起搏器", "CRT", "ICD", "除颤器植入", "植入式除颤器", "起搏器植入", "电极植入"],
    isTherapeutic: true,
    reason: "临床说法指向永久起搏器相关项目。",
    reviews: () => ["起搏器类型、加收和扩展项目需按具体装置类型和院内口径确认。"],
  },
  {
    systemId: "structural_congenital",
    actionId: "structural-asd-closure",
    actionName: "房间隔缺损封堵",
    actualAction: "房间隔缺损封堵",
    billingItemName: "结构性心脏病封堵费（常规）",
    expressions: ["房缺", "ASD", "房间隔缺损", "房缺封堵", "房间隔缺损封堵"],
    isTherapeutic: true,
    reason: "临床说法指向房间隔缺损封堵，按结构性心脏病封堵相关项目匹配。",
    reviews: () => ["请确认本院对房缺封堵是否按结构性心脏病封堵费（常规）执行。"],
  },
  {
    systemId: "structural_congenital",
    actionId: "structural-vsd-closure",
    actionName: "室间隔缺损封堵",
    actualAction: "室间隔缺损封堵",
    billingItemName: "结构性心脏病封堵费（常规）",
    expressions: ["室缺", "VSD", "室间隔缺损", "室缺封堵", "室间隔缺损封堵"],
    isTherapeutic: true,
    reason: "临床说法指向室间隔缺损封堵，按结构性心脏病封堵相关项目匹配。",
    reviews: () => ["请确认本院对室缺封堵是否按结构性心脏病封堵费（常规）执行。"],
  },
  {
    systemId: "structural_congenital",
    actionId: "structural-pfo-closure",
    actionName: "卵圆孔未闭封堵",
    actualAction: "卵圆孔未闭封堵",
    billingItemName: "结构性心脏病封堵费（常规）",
    expressions: ["PFO", "卵圆孔未闭", "卵圆孔未闭封堵", "PFO封堵"],
    isTherapeutic: true,
    reason: "临床说法指向 PFO/卵圆孔未闭封堵，按结构性心脏病封堵相关项目匹配。",
    reviews: () => ["PFO封堵项目口径需按医院医保/物价收费部门确认。"],
  },
  {
    systemId: "structural_congenital",
    actionId: "structural-pda-closure",
    actionName: "动脉导管未闭封堵",
    actualAction: "动脉导管未闭封堵 / 闭合",
    billingItemName: "动脉导管闭合费",
    expressions: ["PDA", "动脉导管未闭", "动脉导管未闭封堵", "动脉导管闭合"],
    isTherapeutic: true,
    reason: "临床说法指向动脉导管未闭封堵或闭合。",
    reviews: () => ["介入封堵与手术闭合项目口径需按价格表和本院收费口径确认。"],
  },
  {
    systemId: "structural_congenital",
    actionId: "structural-laao",
    actionName: "左心耳封堵",
    actualAction: "左心耳封堵",
    billingItemName: "结构性心脏病封堵费（常规）",
    expressions: ["左心耳", "左心耳封堵", "LAAO"],
    isTherapeutic: true,
    reason: "临床说法指向左心耳封堵，按结构性心脏病封堵相关项目匹配。",
    reviews: () => ["左心耳封堵是否按结构性心脏病封堵费或心耳闭合费执行，需人工确认。"],
  },
  {
    systemId: "structural_congenital",
    actionId: "structural-generic-closure",
    actionName: "结构性心脏病封堵",
    actualAction: "封堵",
    billingItemName: "结构性心脏病封堵费",
    expressions: ["封堵", "封堵器", "先心封堵", "结构封堵"],
    isTherapeutic: true,
    reason: "临床说法指向结构性心脏病/先心病封堵类操作。",
    reviews: () => ["封堵部位不明确，请确认是房缺、室缺、PFO、动脉导管未闭、左心耳还是其他封堵。"],
  },
  {
    systemId: "cardiac_catheterization",
    actionId: "cath-right-heart",
    actionName: "右心导管检查",
    actualAction: "右心导管检查",
    billingItemName: "右心导管检查费",
    expressions: ["右心导管", "右心导管检查", "RHC", "右心导管检查术"],
    reason: "临床说法指向右心导管检查。",
    recordAdvice: ["写明导管路径、压力测定、血氧/分流测定内容。"],
  },
  {
    systemId: "cardiac_catheterization",
    actionId: "cath-left-heart",
    actionName: "左心导管检查",
    actualAction: "左心导管检查 / 左心室造影",
    billingItemName: "左心导管检查费",
    expressions: ["左心导管", "左心导管检查", "LHC", "左心室造影", "心室造影"],
    reason: "临床说法指向左心导管检查或左心室造影。",
    recordAdvice: ["写明左心导管检查内容、是否行左心室造影。"],
  },
  {
    systemId: "cardiac_catheterization",
    actionId: "cath-pressure-oxygen",
    actionName: "心导管压力/血氧/分流测定",
    actualAction: "心腔压力测定 / 血氧测定 / 分流测定",
    billingItemName: "右心导管检查费",
    expressions: ["心腔压力", "压力测定", "血氧测定", "分流测定"],
    reason: "临床说法指向心导管检查中的压力、血氧或分流测定。",
    reviews: () => ["请根据实际进入心腔和检查路径确认按右心导管或左心导管相关项目收费。"],
  },
  {
    systemId: "hypertension_renal",
    actionId: "renal-denervation",
    actionName: "肾动脉去神经",
    actualAction: "肾动脉去神经",
    billingItemName: "肾动脉去神经费",
    expressions: ["肾动脉去神经", "RDN", "肾交感去神经", "高血压介入"],
    isTherapeutic: true,
    reason: "临床说法指向肾动脉去神经治疗。",
    reviews: () => ["高血压/肾动脉相关项目当前规则需人工确认或后续补充。"],
  },
];

function createActionDictionary(_items: BillingItem[]): ProcedureAction[] {
  return procedureAliasDictionary.map((alias) => ({
    id: alias.actionId,
    name: alias.actionName,
    systemId: alias.systemId,
    keywords: aliasRegex(alias.expressions),
    targetItemName: alias.billingItemName,
    actualAction: alias.actualAction,
    isTherapeutic: alias.isTherapeutic,
    manualOnly: alias.manualOnly,
    manualMessage: alias.manualMessage,
    reason: alias.reason,
    addons: alias.addons,
    exclusions: alias.exclusions,
    reviews: alias.reviews,
    recordAdvice: alias.recordAdvice,
  }));
}
function matchingActions(segment: string, systemId: SystemId, dictionary: ProcedureAction[]) {
  return dictionary.filter((action) => {
    if (action.systemId !== systemId || !action.keywords.test(segment)) return false;
    if (action.id === "neuro-angio" && /脊髓血管|脊髓造影/.test(segment)) return false;
    if (action.id === "neuro-embolization" && /动脉瘤|弹簧圈|瘤腔/.test(segment)) return false;
    if (action.id === "structural-generic-closure" && /房缺|ASD|房间隔|室缺|VSD|室间隔|PFO|卵圆孔|PDA|动脉导管|左心耳|LAAO/i.test(segment)) return false;
    if (action.id === "pacemaker-permanent-install" && /临时|临起/.test(segment)) return false;
    if (action.id === "pacemaker-temp-install" && /取出|拔除|拔出|拔临起|拔起搏线/.test(segment)) return false;
    return true;
  });
}

function clarificationForSegment(segment: string) {
  if (/支架/.test(segment)) return `无法判断“${segment}”属于哪个系统：这是冠脉支架、脑血管支架、外周血管支架，还是结构性心脏病相关支架？`;
  if (/消融|射频|冷冻|脉冲|PFA/i.test(segment)) return `无法判断“${segment}”的消融类型：是房颤、房扑、室上速、室速，还是其他消融？`;
  if (/封堵|封堵器/.test(segment)) return `无法判断“${segment}”的封堵部位：是房缺、室缺、PFO、动脉导管未闭、左心耳，还是其他封堵？`;
  return `无法判断“${segment}”属于哪个系统，请补充：这是脑血管、冠脉、电生理、起搏器、结构性心脏病、心导管还是其他导管室项目？`;
}

function isPromptDecisionSegment(segment: string) {
  return /未行房间隔穿刺|未做房间隔穿刺|无房间隔穿刺|房间隔穿刺待确认|未行选择性动脉造影|未做选择性动脉造影|无选择性动脉造影|选择性动脉造影待确认/.test(segment);
}

function parseSegments(input: string, dictionary: ProcedureAction[]) {
  let currentSystem: SystemId | null = null;
  const ambiguousSegments: string[] = [];
  const segments: ParsedSegment[] = [];

  for (const raw of splitProcedureInput(input)) {
    if (isPromptDecisionSegment(raw)) {
      segments.push({ raw, systemId: currentSystem, inherited: Boolean(currentSystem), actions: [] });
      continue;
    }
    const explicitSystem = detectExplicitSystem(raw);
    const systemId = explicitSystem ?? currentSystem;
    if (explicitSystem) currentSystem = explicitSystem;

    if (!systemId) {
      const maybeAction = dictionary.some((action) => action.keywords.test(raw));
      if (maybeAction) ambiguousSegments.push(raw);
      segments.push({ raw, systemId: null, inherited: false, actions: [] });
      continue;
    }

    const actions = matchingActions(raw, systemId, dictionary);
    segments.push({ raw, systemId, inherited: !explicitSystem, actions });
  }

  return { segments, ambiguousSegments };
}

function addRecommendation(
  list: Recommendation[],
  item: BillingItem | undefined,
  quantity: number,
  reason: string,
  options?: Partial<Recommendation> & { systemId?: string; systemName?: string; systemGroup?: SystemGroup; actionName?: string; clinicalTerm?: string; actualAction?: string },
) {
  if (!item) return;
  const existing = list.find((entry) => entry.item.newCode === item.newCode && entry.systemId === options?.systemId);
  if (existing) {
    existing.quantity = Math.max(existing.quantity, quantity);
    existing.reason = unique([existing.reason, reason]).join("；");
    existing.addons = unique([...existing.addons, ...(options?.addons || [])]);
    existing.exclusions = unique([...existing.exclusions, ...(options?.exclusions || [])]);
    existing.reviews = unique([...existing.reviews, ...(options?.reviews || [])]);
    existing.recordAdvice = unique([...existing.recordAdvice, ...(options?.recordAdvice || [])]);
    existing.tags = unique([...existing.tags, ...(options?.tags || [])]);
    existing.clinicalTerm = unique([existing.clinicalTerm || "", options?.clinicalTerm || ""]).join(" / ");
    existing.actualAction = unique([existing.actualAction || "", options?.actualAction || ""]).join(" / ");
    existing.systemGroup = existing.systemGroup || options?.systemGroup || (options?.systemId as SystemGroup | undefined);
    return;
  }
  list.push({
    id: `${options?.systemId || "system"}-${item.newCode}-${list.length}`,
    item,
    quantity,
    reason,
    clinicalTerm: options?.clinicalTerm,
    actualAction: options?.actualAction,
    addons: options?.addons || [],
    exclusions: options?.exclusions || [],
    reviews: options?.reviews || [],
    recordAdvice: options?.recordAdvice || [],
    tags: options?.tags || [],
    systemId: options?.systemId,
    systemName: options?.systemName,
    systemGroup: options?.systemGroup || (options?.systemId as SystemGroup | undefined),
    actionName: options?.actionName,
  });
}

function manualPlaceholderItem(comboItem: LatestComboItem): BillingItem {
  return {
    systemCategory: "院内解读规则",
    sourceFile: "manualBillingRules",
    newCode: `manual-${compactItemName(comboItem.itemName)}`,
    newName: comboItem.itemName,
    itemType: "main",
    description: comboItem.warning || "当前 Excel 官方项目库未找到完全匹配的标准项目。",
    unit: "需确认",
    billingNote: "该项目需人工确认或补充收费目录；院内解读价格仅作参考，不作为本次收费价格。",
    price: null,
    oldCodes: [],
    oldNames: [],
    parentItem: comboItem.itemName,
    keywords: unique([comboItem.itemName, comboItem.unit || "", comboItem.warning || ""]),
    isInterventional: true,
    isCommonCathLabItem: true,
  };
}

function manualNamedItem(name: string, unit = "需确认", price: number | null = null): BillingItem {
  return {
    systemCategory: "院内确认项目",
    sourceFile: "manualBillingRules",
    newCode: `manual-${compactItemName(name)}`,
    newName: name,
    itemType: "main",
    description: "当前官方项目库未找到完全匹配的标准项目，需要人工确认收费目录。",
    unit,
    billingNote: "需人工确认或补充收费目录。",
    price,
    oldCodes: [],
    oldNames: [],
    parentItem: name,
    keywords: [name],
    isInterventional: true,
    isCommonCathLabItem: true,
  };
}

function neuroAngiographySurchargeItem(items: BillingItem[]): BillingItem {
  const base = findItem(items, "脑血管造影费");
  return {
    systemCategory: base?.systemCategory || "神经系统",
    sourceFile: base?.sourceFile || "officialExcelDerivedRule",
    newCode: `${base?.newCode || "012401000140000"}-add-over3`,
    newName: "脑血管造影超过3根血管加收",
    itemType: "add_on",
    description: "依据脑血管造影费计价说明：3根及以下按基础价，超过3根每增加1根按33%加收。",
    unit: "根",
    billingNote: "按8根血管计算时，基础3根以外加收5根；价格由脑血管造影费官方价格按33%折算。",
    price: typeof base?.price === "number" ? Number((base.price * 0.33).toFixed(2)) : null,
    oldCodes: [],
    oldNames: [],
    parentItem: "脑血管造影费",
    keywords: ["脑血管造影超过3根血管加收", "超过3根血管加收", "脑血管造影费"],
    isInterventional: true,
    isCommonCathLabItem: true,
  };
}

function explicitNeuroAngioVesselCount(input: string) {
  if (/全脑|全脑8根|8根造影|八根造影/.test(input)) return 8;
  if (/造影\s*3\s*根(?:及以下|以内)?|3\s*根(?:及以下|以内).*造影/.test(input)) return 3;
  const patterns = [
    /造影(?:血管)?(?:数量)?\s*(\d+)\s*根/,
    /(\d+)\s*根(?:血管)?造影/,
    /脑血管造影\s*(\d+)\s*根/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return Math.max(1, Number(match[1]));
  }
  return null;
}

function hasNeuroAngioVesselDecision(input: string) {
  return explicitNeuroAngioVesselCount(input) !== null || /造影3根及以下|造影3根以内/.test(input);
}

function neuroAngiographyVesselCountPrompt(input: string): ChoicePrompt {
  return {
    id: "neuro-angiography-vessel-count",
    type: "neuro_angiography_vessel_count",
    title: "本次脑血管造影血管数量是否超过 3 根？",
    description: "3根及以下只收基础脑血管造影费；超过3根时按实际造影血管数量加收，最高不超过7280元。",
    groups: [
      {
        title: "造影血管数量",
        options: [
          { label: "3 根及以下", query: `${input}+造影3根及以下`, resultHint: "脑血管造影费" },
          { label: "按全脑 8 根", query: `${input}+全脑8根造影`, resultHint: "脑血管造影费 + 超过3根血管加收×5" },
        ],
      },
    ],
  };
}

function addNeuroAngiographySurcharge(items: BillingItem[], recommendations: Recommendation[], input: string, reason: string, extraCount = 5) {
  const quantity = Math.max(1, extraCount);
  addRecommendation(recommendations, neuroAngiographySurchargeItem(items), quantity, reason, {
    systemId: "neuro_intervention",
    systemName: systemName("neuro_intervention"),
    systemGroup: "neuro_intervention",
    actionName: "脑血管造影超过3根血管加收",
    clinicalTerm: input,
    actualAction: "脑血管造影超过3根血管加收",
    reviews: [`脑血管造影按实际血管数量计算：基础3根及以下另加超过3根血管加收×${quantity}；价格由Excel官方脑血管造影费计价说明折算，最高限价不超过7280元。`],
    recordAdvice: ["手术记录写明造影血管范围和具体血管名称。"],
    tags: ["skip_quantity_note"],
  });
}

function addNeuroAngiographySurchargeByDecision(items: BillingItem[], recommendations: Recommendation[], input: string, reason: string) {
  const count = explicitNeuroAngioVesselCount(input) ?? 8;
  if (count <= 3) return;
  addNeuroAngiographySurcharge(items, recommendations, input, reason, count - 3);
}

function missingOfficialActionItem(action: ProcedureAction): BillingItem {
  return manualNamedItem(action.targetItemName, "需确认", null);
}

function addMissingOfficialActionWarning(warnings: string[], itemName: string, actionName: string) {
  warnings.push(`已识别“${actionName}”，但当前官方项目库未找到“${itemName}”，请补充官方项目库或人工确认收费目录。`);
}

function carotidStentLocationPrompt(input: string): ChoicePrompt {
  return {
    id: "carotid-stent-location",
    type: "carotid_stent_location",
    title: "请确认支架位置",
    description: "颈动脉支架不再使用旧“颈动脉支架置入术”；颅内段和颅外段主项目均按脑血管支架置入费（介入）提示。",
    groups: [
      {
        title: "支架位置",
        options: [
          { label: "颅内段", query: `${input}+颅内段`, resultHint: "脑血管支架置入费 + 颅内血管加收" },
          { label: "颅外段", query: `${input}+颅外段`, resultHint: "脑血管支架置入费，不加颅内加收" },
        ],
      },
    ],
  };
}

function neuroFistulaBalloonPrompt(input: string): ChoicePrompt {
  return {
    id: "neuro-fistula-balloon",
    type: "neuro_fistula_balloon",
    title: "是否合并颈内动脉 / 颈动脉球囊扩张？",
    description: "基础费用先按脑血管造影费 + 脑血管栓塞费提示；如合并球囊扩张，再按颅外段或颅内段追加。",
    groups: [
      {
        title: "球囊扩张确认",
        options: [
          { label: "否", query: `${input}+未合并球囊扩张`, resultHint: "不追加球囊扩张费" },
          { label: "是，颅外段球囊扩张", query: `${input}+颅外段球囊扩张`, resultHint: "脑血管球囊扩张费" },
          { label: "是，颅内段球囊扩张", query: `${input}+颅内段球囊扩张`, resultHint: "脑血管球囊扩张费 + 颅内血管加收" },
        ],
      },
    ],
  };
}

function ccfEmbolizationScopePrompt(input: string): ChoicePrompt {
  return {
    id: "ccf-embolization-scope",
    type: "ccf_embolization_scope",
    title: "本次动静脉瘘栓塞涉及哪些位置？",
    description: "脑血管栓塞费按实际栓塞位置确认数量；脑血管球囊扩张费默认按 1 处/1 血管提示。",
    groups: [
      {
        title: "栓塞位置",
        options: [
          { label: "仅动脉", query: `${input}+栓塞仅动脉`, resultHint: "脑血管栓塞费 ×1" },
          { label: "仅静脉", query: `${input}+栓塞仅静脉`, resultHint: "脑血管栓塞费 ×1" },
          { label: "动脉 + 静脉", query: `${input}+栓塞数量2`, resultHint: "脑血管栓塞费 ×2" },
        ],
      },
    ],
  };
}

function ccfEmbolizationQuantity(text: string) {
  const manualMatch = text.match(/栓塞数量\s*(\d+)/);
  if (manualMatch) return Math.max(1, Number(manualMatch[1]));
  if (/栓塞仅动脉|栓塞仅静脉/.test(text)) return 1;
  return 1;
}

function hasCcfEmbolizationDecision(text: string) {
  return /栓塞仅动脉|栓塞仅静脉|栓塞数量\s*\d+/.test(text);
}

function neuroTreatmentVesselCount(text: string) {
  const patterns = [
    /治疗血管\s*(\d+)\s*根/,
    /治疗血管数量\s*(\d+)/,
    /(?:支架|球囊|取栓|抽吸|减容|栓塞|动脉瘤|再通)(?:涉及)?\s*(\d+)\s*根/,
    /(\d+)\s*根(?:治疗血管|支架血管|球囊血管|栓塞血管)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Math.max(1, Number(match[1]));
  }
  return 1;
}

function isIntracranialNeuroTreatment(text: string) {
  return /颅内段|颅内血管|颅内动脉|颅内支架|颅内球囊|脑静脉窦|静脉窦/.test(text);
}

function hasExplicitBalloonDecision(text: string) {
  return /未合并球囊扩张|颅外段球囊扩张|颅内段球囊扩张/.test(text);
}

function neuroGroupChargeItems(procedure: NeuroGroupProcedure, text: string, prompts: ChoicePrompt[]) {
  const isCarotidLike = procedure.id === "carotid-stent-rule" || procedure.id === "carotid-stent-protection";
  if (procedure.id === "ccf-embolization-carotid-balloon") {
    if (!hasCcfEmbolizationDecision(text)) prompts.push(ccfEmbolizationScopePrompt(text));
    return procedure.chargeItems;
  }
  if (procedure.id === "davf-embolization") {
    if (!hasCcfEmbolizationDecision(text)) prompts.push(ccfEmbolizationScopePrompt(text));
    if (!hasExplicitBalloonDecision(text)) prompts.push(neuroFistulaBalloonPrompt(text));
    const chargeItems = [...procedure.chargeItems];
    if (/颅外段球囊扩张/.test(text)) chargeItems.push("脑血管球囊扩张费（介入）");
    if (/颅内段球囊扩张/.test(text)) chargeItems.push("脑血管球囊扩张费（介入）", "脑血管球囊扩张费（介入）-颅内血管（加收）");
    return unique(chargeItems);
  }
  if (!isCarotidLike) return procedure.chargeItems;

  const chargeItems = procedure.chargeItems.filter((name) => !name.includes("颈动脉支架置入相关"));
  if (/锁骨下/.test(text)) {
    chargeItems.push("经皮动脉支架置入术");
    return unique(chargeItems);
  }
  if (/颅内段/.test(text)) {
    chargeItems.push("脑血管支架置入费（介入）", "脑血管支架置入费（介入）-颅内血管（加收）");
  } else if (/颅外段/.test(text)) {
    chargeItems.push("脑血管支架置入费（介入）");
  } else {
    prompts.push(carotidStentLocationPrompt(text));
  }
  return unique(chargeItems);
}

function isBrainAngiographyItemName(name: string) {
  return /脑血管造影费|脑循环造影费/.test(name);
}

function isNeuroGroupBrainTreatment(procedure: NeuroGroupProcedure) {
  if (procedure.id === "cerebral-angiography" || procedure.id === "spinal-artery-embolization" || procedure.id === "trigeminal-nerve-balloon-compression") return false;
  return procedure.chargeItems.some(isBrainAngiographyItemName) && procedure.chargeItems.some((name) => !isBrainAngiographyItemName(name));
}

function isNeuroGroupAngiographyOnly(procedure: NeuroGroupProcedure) {
  return procedure.id === "cerebral-angiography";
}

function isNeuroTreatmentChargeItem(itemName: string) {
  return /脑血管支架置入费|脑血管球囊扩张费|脑血管栓塞费|颅内动脉瘤栓塞费|脑血管腔内减容费|慢性闭塞脑血管逆向再通费|脊髓血管栓塞费/.test(itemName);
}

function neuroGroupItemQuantity(procedure: NeuroGroupProcedure, itemName: string, text: string) {
  if (isBrainAngiographyItemName(itemName) || /脑血管造影超过3根/.test(itemName)) return 1;
  if ((procedure.id === "ccf-embolization-carotid-balloon" || procedure.id === "davf-embolization" || procedure.id === "brain-avm-embolization") && itemName.includes("脑血管栓塞费")) {
    return ccfEmbolizationQuantity(text);
  }
  if (isNeuroTreatmentChargeItem(itemName)) return neuroTreatmentVesselCount(text);
  return 1;
}

function addNeuroGroupProcedure(
  procedure: NeuroGroupProcedure,
  text: string,
  items: BillingItem[],
  recommendations: Recommendation[],
  warnings: string[],
  parsedFacts: string[],
  parsedActions: string[],
  choicePrompts: ChoicePrompt[],
) {
  warnings.push(...procedure.questions, ...procedure.specialNotes);
  parsedFacts.push(`识别到外周血管 / 神经组术式：${procedure.procedureName}`);
  const brainTreatment = isNeuroGroupBrainTreatment(procedure);
  if (brainTreatment && !hasNeuroAngioVesselDecision(text)) {
    choicePrompts.push(neuroAngiographyVesselCountPrompt(text));
  }

  for (const itemName of neuroGroupChargeItems(procedure, text, choicePrompts)) {
    const officialItem = findItem(items, itemName);
    const item = officialItem || manualNamedItem(itemName, "需确认", null);
    const quantity = neuroGroupItemQuantity(procedure, itemName, text);
    const tags = unique([
      ...(officialItem ? [] : ["需人工确认"]),
      ...(procedure.id === "ccf-embolization-carotid-balloon" && /脑血管栓塞费|脑血管球囊扩张费/.test(itemName) ? ["skip_quantity_note"] : []),
      ...(procedure.id === "davf-embolization" && /脑血管栓塞费/.test(itemName) ? ["skip_quantity_note"] : []),
      ...(isBrainAngiographyItemName(itemName) ? ["skip_quantity_note"] : []),
    ]);
    if (!officialItem) {
      warnings.push(`“${itemName}”需人工确认或补充官方项目库。`);
    }
    addRecommendation(recommendations, item, quantity, `按神经组配合目录“${procedure.procedureName}”映射。`, {
      systemId: "neuro_intervention",
      systemName: systemName("neuro_intervention"),
      systemGroup: "neuro_intervention",
      actionName: procedure.procedureName,
      clinicalTerm: text,
      actualAction: procedure.procedureName,
      reviews: officialItem ? [] : [`“${itemName}”未在官方 Excel 项目库中精确匹配，需人工确认。`],
      recordAdvice: procedure.chargeExplanation,
      tags,
    });
    parsedActions.push(`${procedure.procedureName} → ${itemName}`);
  }
  if (isNeuroGroupAngiographyOnly(procedure) || (brainTreatment && hasNeuroAngioVesselDecision(text))) {
    addNeuroAngiographySurchargeByDecision(items, recommendations, text, isNeuroGroupAngiographyOnly(procedure)
      ? "单纯脑血管造影默认按全脑8根显示；如非8根，请填写实际造影血管数量。"
      : "按已确认的脑血管造影血管数量计算超过3根加收。");
  }
}

function sourceLabel(sourceRule: LatestComboRule) {
  return sourceRule.source === "manualBillingRules20260519" ? "manualBillingRules院内解读" : "最新收费明细标准";
}

function alreadyRecommended(recommendations: Recommendation[], comboItem: LatestComboItem, officialItem?: BillingItem) {
  return recommendations.some((rec) =>
    rec.item.newName === comboItem.itemName ||
    (officialItem && rec.item.newCode === officialItem.newCode) ||
    compactItemName(rec.item.newName) === compactItemName(comboItem.itemName),
  );
}

function addLatestComboItem(
  sourceRule: LatestComboRule,
  comboItem: LatestComboItem,
  items: BillingItem[],
  recommendations: Recommendation[],
  warnings: string[],
  parsedActions: string[],
  input: string,
) {
  const item = findOfficialItemStrict(items, comboItem.itemName);
  if (!comboItem.forceInclude && isConditionalLatestItem(comboItem) && !explicitConditionalOperation(comboItem.itemName, comboItem.condition, input)) {
    if (alreadyRecommended(recommendations, comboItem, item)) return;
    if (deniedConditionalOperation(comboItem.itemName, input)) return;
    warnings.push(`条件项目：${comboItem.itemName}，${comboItem.condition || conditionalReason(comboItem.itemName)}。符合实际操作并有手术记录时再收费。`);
    return;
  }

  const source = sourceLabel(sourceRule);
  const baseReviews = [
    latestFeeStandard.metadata.globalNote,
    "组合规则来源：院内解读/收费规则；标准项目名称、编码、计价单位和价格以Excel官方项目库为准。",
    ...(sourceRule.questions || []),
    ...(sourceRule.note ? [sourceRule.note] : []),
    ...(comboItem.quantityHint ? [`${comboItem.itemName}：${comboItem.quantityHint}`] : []),
    ...(comboItem.warning ? [comboItem.warning] : []),
  ];

  if (!item) {
    const placeholder = manualPlaceholderItem(comboItem);
    addRecommendation(recommendations, placeholder, comboItem.quantity || 1, `按${source}：“${sourceRule.name}”组合提示；当前 Excel 官方项目库未找到明确标准项目。`, {
      systemId: systemIdFromLatestGroup(sourceRule.group),
      systemName: systemName(systemIdFromLatestGroup(sourceRule.group)),
      systemGroup: systemIdFromLatestGroup(sourceRule.group),
      actionName: sourceRule.name,
      clinicalTerm: sourceRule.triggers?.find((trigger) => triggerMatches(input, trigger)) || sourceRule.name,
      actualAction: sourceRule.name,
      reviews: unique([
        ...baseReviews,
        `“${comboItem.itemName}”需人工确认或补充收费目录；若使用参考价，必须经医院医保、物价、收费部门确认。`,
        ...(typeof comboItem.price === "number" ? [`院内解读价格：${comboItem.price} 元；当前未匹配到Excel官方项目，需人工确认收费依据。`] : []),
      ]),
      tags: ["需人工确认"],
    });
    warnings.push(`院内解读提示可能涉及“${comboItem.itemName}”，但当前 Excel 官方项目库未找到明确标准项目，请人工确认或补充收费目录。`);
    parsedActions.push(`${systemName(systemIdFromLatestGroup(sourceRule.group))}：${sourceRule.name} → ${comboItem.itemName}（需补充官方项目）`);
    return;
  }

  const reviews = [...baseReviews];
  if (typeof comboItem.price === "number" && typeof item.price === "number" && Math.abs(comboItem.price - item.price) > 0.01) {
    reviews.push(`院内解读参考价格 ${comboItem.price} 元，与Excel官方价格 ${item.price} 元存在差异；本次价格按Excel官方项目库显示，组合逻辑来自院内解读/收费规则。`);
  }

  addRecommendation(recommendations, item, comboItem.quantity || 1, `按${source}（${latestFeeStandard.metadata.version}）：“${sourceRule.name}”组合推荐。`, {
    systemId: systemIdFromLatestGroup(sourceRule.group),
    systemName: systemName(systemIdFromLatestGroup(sourceRule.group)),
    systemGroup: systemIdFromLatestGroup(sourceRule.group),
    actionName: sourceRule.name,
    clinicalTerm: sourceRule.triggers?.find((trigger) => triggerMatches(input, trigger)) || sourceRule.name,
    actualAction: sourceRule.name,
    reviews: unique(reviews),
  });
  parsedActions.push(`${systemName(systemIdFromLatestGroup(sourceRule.group))}：${sourceRule.name} → ${item.newName}`);
}

function systemIdFromLatestGroup(group: string): SystemId {
  if (/神经|脑血管|全脑/.test(group)) return "neuro_intervention";
  if (/射频|电生理/.test(group)) return "electrophysiology";
  if (/起搏器/.test(group)) return "pacemaker";
  if (/先心|结构/.test(group)) return "structural_congenital";
  if (/高血压|肾/.test(group)) return "hypertension_renal";
  if (/CAG|PTCA|PCI|冠脉/.test(group)) return "coronary_intervention";
  return "other";
}

function applyLatestStandardCombos(
  input: string,
  items: BillingItem[],
  recommendations: Recommendation[],
  warnings: string[],
  parsedFacts: string[],
  parsedActions: string[],
) {
  const matchedRules = latestFeeStandard.heartInterventionCombos.filter((rule) =>
    canApplyLatestRule(input, rule) && ((rule.triggers || []).some((trigger) => triggerMatches(input, trigger)) || triggerMatches(input, rule.name)),
  );
  if (!matchedRules.length) return [] as SystemId[];

  parsedFacts.push(`已优先采用最新收费明细标准：${latestFeeStandard.metadata.version}`);
  const matchedSystems: SystemId[] = [];

  for (const rule of matchedRules) {
    matchedSystems.push(systemIdFromLatestGroup(rule.group));
    if (rule.manualReview) {
      warnings.push(`${rule.name}：${rule.manualReview}`);
      continue;
    }

    for (const item of rule.combo || []) {
      addLatestComboItem(rule, { ...item, forceInclude: !item.condition }, items, recommendations, warnings, parsedActions, input);
    }

    for (const item of rule.comboLogic || []) {
      if (!item.if || conditionMatches(item.if, input)) {
        addLatestComboItem(rule, item, items, recommendations, warnings, parsedActions, input);
      }
    }

    for (const item of rule.conditionalItems || []) {
      addLatestComboItem(rule, item, items, recommendations, warnings, parsedActions, input);
    }
  }

  return unique(matchedSystems);
}

function addBaseAngiography(systemId: SystemId, items: BillingItem[], recommendations: Recommendation[], input: string, roots: number) {
  if (systemId === "neuro_intervention") {
    addRecommendation(recommendations, findItem(items, "脑血管造影费"), 1, "脑血管治疗前需行造影明确病变形态、治疗路径和术后效果。", {
      systemId,
      systemName: systemName(systemId),
      actionName: "脑血管造影",
      clinicalTerm: /造影|DSA/i.test(input) ? "造影 / DSA" : "自动补充基础造影",
      actualAction: "脑血管造影",
      reviews: /锁骨下/.test(input) ? ["锁骨下动脉不是全脑血管造影天然组成部分，若为单独选择性造影并有明确记录，可计入；否则需人工确认。"] : [],
      recordAdvice: ["写明每根造影血管名称、根数、是否为独立诊断性造影。"],
      tags: ["skip_quantity_note"],
    });
    if (roots > 3) {
      addNeuroAngiographySurcharge(items, recommendations, input, "输入明确造影血管超过3根，按脑血管造影计价说明提示超过3根加收。", roots - 3);
    }
  }
  if (systemId === "coronary_intervention") {
    addRecommendation(recommendations, findItem(items, "冠状动脉造影费"), 1, "冠脉治疗前需行冠状动脉造影明确病变位置、血管形态和治疗路径。", {
      systemId,
      systemName: systemName(systemId),
      actionName: "冠状动脉造影",
      clinicalTerm: /造影|CAG/i.test(input) ? "造影 / CAG" : "自动补充基础造影",
      actualAction: "冠状动脉造影",
      recordAdvice: ["写明诊断性造影范围、是否含左心室造影、是否含桥血管造影。"],
    });
  }
}

function hasExplicitTempPacemakerRemoval(input: string) {
  return /当场拔出|术毕拔除|手术结束拔除|临时放置后取出|当场取出|实际取出|取出|拔除|拔出|拔临起|拔起搏线/.test(input);
}

function isTempPacemakerItem(name: string) {
  return /临时起搏器安装费|临时起搏器运行监测费|临时起搏器取出费/.test(name);
}

function applyTempPacemakerRules(items: BillingItem[], recommendations: Recommendation[], warnings: string[], input: string, parsedActions: string[]) {
  const install = recommendations.find((rec) => rec.item.newName.includes("临时起搏器安装费"));
  if (!install) return;

  const explicitRemoval = hasExplicitTempPacemakerRemoval(input);
  const monitor = recommendations.find((rec) => rec.item.newName.includes("临时起搏器运行监测费"));
  const remove = recommendations.find((rec) => rec.item.newName.includes("临时起搏器取出费"));
  const onlyTempPacemaker = recommendations.every((rec) => isTempPacemakerItem(rec.item.newName));
  const installHint = "若为单纯临时起搏器安装，取出费待实际取出后另收；若为其他手术中临时放置并术毕当场取出，可同时提示取出费。";

  install.reviews = unique([...install.reviews, installHint]);
  install.recordAdvice = unique([...install.recordAdvice, "写明是否单纯临时起搏器安装、是否术毕当场取出、实际运行监测小时数。"]);

  if (onlyTempPacemaker && !explicitRemoval && !monitor) {
    addRecommendation(recommendations, findItem(items, "临时起搏器运行监测费"), 1, "单纯临时起搏器安装通常需要运行监测，按实际运行监测小时数确认。", {
      systemId: "pacemaker",
      systemName: systemName("pacemaker"),
      actionName: "临时起搏器运行监测",
      clinicalTerm: "单纯临时起搏器安装",
      actualAction: "临时起搏器运行监测",
      reviews: ["运行监测费按实际运行监测小时数确认。"],
      recordAdvice: ["记录临时起搏器开始运行时间、停止运行时间和监测小时数。"],
    });
    parsedActions.push(`${systemName("pacemaker")}：单纯临时起搏器安装 → 临时起搏器运行监测费（自动提示）`);
  }

  if (explicitRemoval && !remove) {
    addRecommendation(recommendations, findItem(items, "临时起搏器取出费"), 1, "输入明确包含当场拔出、术毕拔除或实际取出，提示可同次加入临时起搏器取出费。", {
      systemId: "pacemaker",
      systemName: systemName("pacemaker"),
      actionName: "临时起搏器取出",
      clinicalTerm: "当场/术毕/实际取出",
      actualAction: "临时起搏器取出",
      reviews: ["临时起搏器取出费必须与实际取出操作和记录相符。"],
      recordAdvice: ["写明实际取出时间、取出过程和电极导线情况。"],
    });
    parsedActions.push(`${systemName("pacemaker")}：明确取出 → 临时起搏器取出费`);
  }

  if (!explicitRemoval) {
    warnings.push("临时起搏器取出费不在安装当次自动收取，待实际拔除临时起搏电极/取出临时起搏器后单独收费。");
  } else if (!monitor) {
    warnings.push("如有临时起搏器运行监测时间，可按实际运行监测小时数确认临时起搏器运行监测费。");
  }
}

function quantityForAction(action: ProcedureAction, segment: string, fullText: string) {
  if (action.systemId === "coronary_intervention" && ["coronary-stent", "coronary-balloon", "coronary-debulking", "coronary-thrombolysis", "coronary-cto"].includes(action.id)) {
    const vessels = mentionedVessels(`${segment} ${fullText}`).filter((vessel) => vessel.id !== "RI");
    return Math.max(1, vessels.length || 0);
  }
  if (action.systemId === "neuro_intervention" && [
    "neuro-stent",
    "neuro-balloon",
    "neuro-debulking",
    "neuro-embolization",
    "neuro-aneurysm-embolization",
    "neuro-cto-recanalization",
  ].includes(action.id)) {
    return neuroTreatmentVesselCount(`${segment} ${fullText}`);
  }
  if (action.systemId === "neuro_intervention" && /颅内.*颅外|颅外.*颅内/.test(`${segment} ${fullText}`)) {
    return 2;
  }
  return 1;
}

function neuroIntracranialAddonNameForAction(action: ProcedureAction) {
  if (action.id === "neuro-stent") return "脑血管支架置入费（介入）-颅内血管（加收）";
  if (action.id === "neuro-balloon") return "脑血管球囊扩张费（介入）-颅内血管（加收）";
  if (action.id === "neuro-cto-recanalization") return "慢性闭塞脑血管逆向再通费（介入）-颅内血管（加收）";
  return "";
}

function addNeuroIntracranialAddonIfNeeded(
  action: ProcedureAction,
  items: BillingItem[],
  recommendations: Recommendation[],
  input: string,
  quantity: number,
) {
  const addonName = neuroIntracranialAddonNameForAction(action);
  if (!addonName || !isIntracranialNeuroTreatment(input)) return;
  addRecommendation(recommendations, findItem(items, addonName), quantity, "颅内段/颅内血管治疗按对应项目追加颅内血管加收。", {
    systemId: "neuro_intervention",
    systemName: systemName("neuro_intervention"),
    systemGroup: "neuro_intervention",
    actionName: `${action.name}-颅内血管加收`,
    clinicalTerm: input,
    actualAction: `${action.actualAction}（颅内血管加收）`,
    reviews: ["颅内加收必须按项目类型区分：支架使用支架颅内加收，球囊使用球囊颅内加收，慢性闭塞逆向再通使用对应颅内加收。"],
    recordAdvice: ["手术记录写明治疗血管是否为颅内段及实际血管数量。"],
  });
}

function isAneurysmEmbolizationBundle(text: string) {
  return /颅内动脉瘤|脑动脉瘤|弹簧圈|圈栓|瘤腔栓塞|密网|血流导向|Pipeline|FD支架/i.test(text);
}

function isBundledAneurysmStent(action: ProcedureAction, segment: string, fullText: string) {
  if (action.id !== "neuro-stent") return false;
  if (!isAneurysmEmbolizationBundle(`${segment} ${fullText}`)) return false;
  if (/狭窄|静脉窦|颈动脉|椎动脉/.test(segment)) return false;
  return /支架|密网|血流导向|Pipeline|FD/i.test(segment);
}

function hasDeniedTransseptalPuncture(input: string) {
  return /未行房间隔穿刺|未做房间隔穿刺|无房间隔穿刺|未行房间隔分流术|未做房间隔分流术|无房间隔分流术|不加房间隔分流费/.test(input);
}

function hasPendingTransseptalPuncture(input: string) {
  return /房间隔穿刺待确认|房间隔分流术待确认|间隔费人工确认/.test(input);
}

function hasConfirmedTransseptalPuncture(input: string) {
  return /房间隔穿刺|房间隔分流|穿刺/.test(input) && !hasDeniedTransseptalPuncture(input) && !hasPendingTransseptalPuncture(input);
}

function hasTransseptalDecision(input: string) {
  return hasConfirmedTransseptalPuncture(input) || hasDeniedTransseptalPuncture(input) || hasPendingTransseptalPuncture(input);
}

function hasSelectiveArteryAngiography(input: string) {
  return /选择性动脉造影|动脉造影/.test(input) && !/未行选择性动脉造影|未做选择性动脉造影|无选择性动脉造影|选择性动脉造影待确认/.test(input);
}

function hasSelectiveArteryDecision(input: string) {
  return /选择性动脉造影|动脉造影/.test(input);
}

function addSelectiveArteryAngiographyIfNeeded(input: string, recommendations: Recommendation[], warnings: string[]) {
  if (!hasSelectiveArteryAngiography(input)) return;
  if (recommendations.some((rec) => rec.item.newName.includes("选择性动脉造影"))) return;
  const item = manualNamedItem("选择性动脉造影费", "次", null);
  addRecommendation(recommendations, item, 1, "用户确认进行了选择性动脉造影；当前官方项目库未找到完全匹配项目，需人工确认收费目录。", {
    systemId: "electrophysiology",
    systemName: systemName("electrophysiology"),
    systemGroup: "electrophysiology",
    actionName: "选择性动脉造影",
    clinicalTerm: "选择性动脉造影",
    actualAction: "选择性动脉造影",
    reviews: ["室上速、预激、室早等常规消融不默认收取选择性静脉造影术；若实际进行了选择性动脉造影，请按收费目录和院内口径人工确认。"],
    tags: ["需人工确认"],
  });
  warnings.push("已提示选择性动脉造影费，但当前官方项目库未找到完全匹配项目，请人工确认收费目录。");
}

function addRoutineAblationBundle(items: BillingItem[], recommendations: Recommendation[], input: string, parsedActions: string[]) {
  const bundle = [
    { name: "有创心内电生理检查费", action: "电生理检查" },
    { name: "心律失常消融费（常规）", action: "射频消融术（常规）" },
    { name: "心腔三维标测费", action: "三维标测" },
  ];
  for (const entry of bundle) {
    addRecommendation(recommendations, findItem(items, entry.name), 1, "常规心律失常射频消融基础组合：电生理检查 + 射频消融术（常规） + 三维标测。", {
      systemId: "electrophysiology",
      systemName: systemName("electrophysiology"),
      systemGroup: "electrophysiology",
      actionName: entry.action,
      clinicalTerm: input,
      actualAction: entry.action,
      reviews: ["组合逻辑按院内规则提示；价格、单位、编码以Excel官方项目库为准。"],
    });
    parsedActions.push(`${systemName("electrophysiology")}：${input} → ${entry.name}`);
  }
  if (hasConfirmedTransseptalPuncture(input)) {
    addRecommendation(recommendations, findItem(items, "房间隔分流费"), 1, "用户确认进行了房间隔分流术，加入房间隔分流费。", {
      systemId: "electrophysiology",
      systemName: systemName("electrophysiology"),
      systemGroup: "electrophysiology",
      actionName: "房间隔分流术",
      clinicalTerm: input,
      actualAction: "房间隔分流术",
      reviews: ["房间隔分流费必须与实际操作和手术记录相符；未确认时不默认加入。"],
      recordAdvice: ["写明是否实际进行了房间隔分流术。"],
    });
    parsedActions.push(`${systemName("electrophysiology")}：房间隔分流术 → 房间隔分流费`);
  }
}

function scopedRuleWarnings(input: string, rules: ApiRule[], systemIds: SystemId[]) {
  const text = input.toLowerCase();
  const legacyScopeMap: Record<SystemId, string[]> = {
    neuro_intervention: ["neuro"],
    coronary_intervention: ["coronary"],
    electrophysiology: ["ep"],
    pacemaker: ["pacemaker"],
    structural_congenital: ["structural"],
    cardiac_catheterization: ["cath"],
    hypertension_renal: ["renal", "hypertension"],
    other: ["other"],
  };
  const allowedScopes = new Set<string>(["all", ...systemIds, ...systemIds.flatMap((id) => legacyScopeMap[id])]);
  return rules
    .filter((rule) => rule.active && allowedScopes.has(rule.scope))
    .filter((rule) => rule.triggerKeywords.some((key) => text.includes(key.toLowerCase())))
    .map((rule) => rule.ruleText);
}

function fallbackSearch(input: string, items: BillingItem[], recommendations: Recommendation[], warnings: string[]) {
  const hasSystemKeyword = systems.some((system) => system.keywords.test(input));
  if (/支架|球囊|球扩|溶栓|取栓|抽吸|吸栓|拉栓|栓塞|封堵|消融|造影|减容|旋磨|旋切/.test(input) && !hasSystemKeyword) {
    warnings.push(clarificationForSegment(input));
    return;
  }
  const terms = splitProcedureInput(input);
  const hitByName = items.find((item) => terms.some((term) => item.newName.includes(term)));
  const hitByOldMapping = items.find((item) =>
    terms.some((term) => item.oldNames?.some((name) => name.includes(term)) || item.oldCodes?.some((code) => code.includes(term)) || item.newCode.includes(term)),
  );
  const avoidRichTextFallback = /射频|消融|支架|球囊|封堵|取栓|抽吸|造影/.test(input);
  const hitByRichText = avoidRichTextFallback
    ? undefined
    : items.find((item) => terms.some((term) => item.description.includes(term) || item.billingNote.includes(term) || item.keywords?.some((key) => key.includes(term))));
  const hit = hitByName || hitByOldMapping || hitByRichText;
  addRecommendation(recommendations, hit, 1, "未命中明确组合规则，按名称和关键词做最接近匹配。", {
    reviews: ["建议人工复核，避免特殊术式按名称机械匹配。"],
  });
}

export function analyzeProcedure(input: string, items: BillingItem[], rules: ApiRule[]) {
  const text = input.trim();
  const effectiveItems = mergeLatestStandardItems(items);
  const recommendations: Recommendation[] = [];
  const globalWarnings: string[] = [];
  const parsedFacts: string[] = [];
  const choicePrompts: ChoicePrompt[] = [];
  let groupId = "home";
  let groupName = "综合判断";
  let unsupportedMessage = "";

  const neuroGroupProcedure = findNeuroGroupProcedure(text);
  if (neuroGroupProcedure && shouldUseNeuroGroupProcedure(neuroGroupProcedure, text)) {
    addNeuroGroupProcedure(neuroGroupProcedure, text, effectiveItems, recommendations, globalWarnings, parsedFacts, [], choicePrompts);
    const parsedActions = recommendations.map((rec) => `${neuroGroupProcedure.procedureName} → ${rec.item.newName}`);
    const systemGroups = [{
      systemId: "neuro_intervention" as const,
      systemName: systemName("neuro_intervention"),
      recommendations,
    }];
    const procedureProfile: ProcedureProfile = {
      procedureName: neuroGroupProcedure.procedureName,
      systemGroup: "neuro_intervention",
      systemCategory: "外周血管 / 神经组",
      surgeryFeeItems: recommendations,
      intraoperativeDrugs: neuroGroupProcedure.medications,
      monitoringAndAssistItems: [],
      monitoringAndAssistFeeItems: [],
      lowValueConsumables: neuroGroupProcedure.consumables,
      highValueConsumables: [],
      nursingCooperationPoints: neuroGroupProcedure.nursingPoints,
      operatorPreferences: [],
      riskWarnings: unique(globalWarnings),
      manualReviewItems: unique(recommendations.flatMap((rec) => rec.reviews)),
    };
    return {
      input,
      groupId: "neuro_intervention",
      groupName: "外周血管 / 神经组",
      recommendations,
      unsupportedMessage,
      globalWarnings: unique(globalWarnings),
      parsedFacts: unique(parsedFacts),
      parsedActions: unique(parsedActions),
      choicePrompts,
      systemGroups,
      procedureProfile,
    };
  }

  if (/肿瘤|下肢|外周血管/.test(text)) {
    unsupportedMessage = "该组收费标准尚未导入，请上传对应价格表后启用。";
    return { input, groupId: "unsupported", groupName: "暂未启用", recommendations, unsupportedMessage, globalWarnings, parsedFacts, parsedActions: [], choicePrompts, systemGroups: [] };
  }

  const ablationClass = classifyElectrophysiologyAblation(text);
  if (ablationClass === "needs_choice") {
    choicePrompts.push(ablationDiseasePrompt());
    parsedFacts.push("识别到：电生理 / 心律失常消融；需先确认病种类型。");
    return {
      input,
      groupId: "electrophysiology",
      groupName: systemName("electrophysiology"),
      recommendations,
      unsupportedMessage,
      globalWarnings: ["仅输入“心脏射频消融/心律失常消融/导管消融”不能直接判断收费项目，请先选择房颤、II型房扑、器质性室速、室上速、预激、房早/室早/房速或肥厚型心肌病消融。"],
      parsedFacts,
      parsedActions: [],
      choicePrompts,
      systemGroups: [],
    };
  }

  const dictionary = createActionDictionary(effectiveItems);
  const { segments, ambiguousSegments } = parseSegments(text, dictionary);
  const systemIds = unique(segments.map((segment) => segment.systemId).filter(Boolean) as SystemId[]);
  const parsedActions: string[] = [];
  const roots = numberBeforeRoot(text);

  const latestSystems = applyLatestStandardCombos(text, effectiveItems, recommendations, globalWarnings, parsedFacts, parsedActions);
  const allSystemIds = unique([...systemIds, ...latestSystems]);

  if (allSystemIds.length === 1) {
    groupId = allSystemIds[0];
    groupName = systemName(allSystemIds[0]);
  } else if (allSystemIds.length > 1) {
    groupId = "combined";
    groupName = "组合术式";
  }

  for (const segment of segments) {
    if (!segment.systemId) continue;
    if (segment.actions.length) {
      parsedActions.push(...segment.actions.map((action) => `${systemName(segment.systemId!)}：${segment.raw} → ${action.actualAction} → ${action.targetItemName}`));
    }
  }

  const therapeuticSystems = new Set<SystemId>();
  const explicitAngioSystems = new Set<SystemId>();

  for (const segment of segments) {
    if (!segment.systemId) continue;
    for (const action of segment.actions) {
      if (action.id.endsWith("angio")) explicitAngioSystems.add(segment.systemId);
      if (action.isTherapeutic) therapeuticSystems.add(segment.systemId);
    }
  }

  for (const systemId of therapeuticSystems) {
    if ((systemId === "neuro_intervention" || systemId === "coronary_intervention") && !explicitAngioSystems.has(systemId)) {
      addBaseAngiography(systemId, effectiveItems, recommendations, text, roots);
      parsedActions.unshift(`${systemName(systemId)}：${systemId === "neuro_intervention" ? "脑血管造影" : "冠状动脉造影"}（自动补充）`);
    }
  }

  for (const segment of segments) {
    if (!segment.systemId) continue;
    for (const action of segment.actions) {
      if (action.manualOnly) {
        globalWarnings.push(action.manualMessage || `${action.name}需人工确认。`);
        parsedActions.push(`${systemName(segment.systemId)}：${segment.raw} → ${action.actualAction} → 需人工确认`);
        continue;
      }
      if (isBundledAneurysmStent(action, segment.raw, text)) {
        globalWarnings.push("颅内动脉瘤栓塞术包括单纯弹簧圈、弹簧圈+支架或密网支架、单纯密网支架；按脑血管造影费+颅内动脉瘤栓塞费提示，不另收脑血管支架置入费。");
        parsedActions.push(`${systemName(segment.systemId)}：${segment.raw} → 已归入颅内动脉瘤栓塞费，不另列脑血管支架置入费`);
        continue;
      }
      const item = findItem(effectiveItems, action.targetItemName) || missingOfficialActionItem(action);
      if (item.sourceFile === "manualBillingRules") {
        addMissingOfficialActionWarning(globalWarnings, action.targetItemName, action.name);
      }
      const quantity = quantityForAction(action, segment.raw, text);
      addRecommendation(recommendations, item, quantity, action.reason, {
        systemId: segment.systemId,
        systemName: systemName(segment.systemId),
        systemGroup: segment.systemId,
        actionName: action.name,
        clinicalTerm: segment.raw,
        actualAction: action.actualAction,
        addons: action.addons?.(segment.raw, text) || [],
        exclusions: action.exclusions?.(segment.raw, text) || [],
        reviews: unique([
          ...(action.reviews?.(segment.raw, text) || []),
          ...(item.sourceFile === "manualBillingRules" ? [`“${action.targetItemName}”需人工确认或补充官方项目库。`] : []),
        ]),
        recordAdvice: action.recordAdvice || [],
        tags: unique([
          ...(item.sourceFile === "manualBillingRules" ? ["需人工确认"] : []),
          ...(action.targetItemName.includes("脑血管造影费") ? ["skip_quantity_note"] : []),
        ]),
      });
      addNeuroIntracranialAddonIfNeeded(action, effectiveItems, recommendations, text, quantity);
    }
  }

  if (therapeuticSystems.has("neuro_intervention")) {
    if (!hasNeuroAngioVesselDecision(text)) {
      choicePrompts.push(neuroAngiographyVesselCountPrompt(text));
    } else {
      addNeuroAngiographySurchargeByDecision(effectiveItems, recommendations, text, "按已确认的脑血管造影血管数量计算超过3根加收。");
    }
  } else if (
    explicitAngioSystems.has("neuro_intervention") &&
    !therapeuticSystems.has("neuro_intervention") &&
    segments.some((segment) => segment.systemId === "neuro_intervention" && segment.actions.some((action) => action.id === "neuro-angio"))
  ) {
    addNeuroAngiographySurchargeByDecision(effectiveItems, recommendations, text, "单纯脑血管造影默认按全脑8根显示；如非8根，请填写实际造影血管数量。");
  }

  if (ambiguousSegments.length) {
    globalWarnings.push(...ambiguousSegments.map(clarificationForSegment));
  }

  if (ablationClass === "routine") {
    addRoutineAblationBundle(effectiveItems, recommendations, text, parsedActions);
    if (!hasTransseptalDecision(text)) choicePrompts.push(transseptalPrompt(text));
    if (!hasSelectiveArteryDecision(text)) choicePrompts.push(selectiveArteryAngiographyPrompt(text));
    if (hasPendingTransseptalPuncture(text)) {
      globalWarnings.push("房间隔穿刺是否实际进行仍需人工确认；确认前不自动加入房间隔分流费。");
    }
    if (/选择性动脉造影待确认/.test(text)) {
      globalWarnings.push("选择性动脉造影是否实际进行仍需人工确认；确认前不自动加入选择性动脉造影费。");
    }
  }
  if (ablationClass === "complex_af" && !/选择性静脉造影|静脉造影/.test(text) && !recommendations.some((rec) => rec.item.newName.includes("选择性静脉造影"))) {
    globalWarnings.push("房颤消融通常涉及选择性静脉造影术；若实际完成该操作并有记录，请确认当前收费目录中的对应项目名称后收取。");
  }

  applyTempPacemakerRules(effectiveItems, recommendations, globalWarnings, text, parsedActions);
  const assistRuleResult = applyProcedureAssistFeeRules(text, effectiveItems, choicePrompts);
  globalWarnings.push(...assistRuleResult.warnings);
  addSelectiveArteryAngiographyIfNeeded(text, recommendations, globalWarnings);

  globalWarnings.push(...scopedRuleWarnings(text, rules, allSystemIds));

  if (/治疗后|确认效果|复查造影/.test(text) && systemIds.includes("neuro_intervention")) {
    globalWarnings.push("脑血管治疗后立即行造影确认治疗效果的，不得重复收取脑血管造影费用。");
  }

  if (!recommendations.length && text) {
    fallbackSearch(text, effectiveItems, recommendations, globalWarnings);
  }

  if (allSystemIds.length) {
    parsedFacts.push(`识别到的手术系统：${allSystemIds.map(systemName).join("；")}`);
  }
  if (parsedActions.length) {
    parsedFacts.push(`解析到的实际手术动作：${unique(parsedActions).join("；")}`);
  }
  const vessels = mentionedVessels(text);
  if (vessels.length) {
    parsedFacts.push(`识别冠脉血管：${vessels.map((vessel) => vessel.label).join("、")}`);
  }

  const systemGroups = allSystemIds.map((systemId) => ({
    systemId,
    systemName: systemName(systemId),
    recommendations: recommendations.filter((rec) => rec.systemId === systemId),
  }));
  const procedureProfile: ProcedureProfile = {
    procedureName: text,
    systemGroup: allSystemIds.length === 1 ? allSystemIds[0] : "other",
    systemCategory: allSystemIds.length ? allSystemIds.map(systemName).join("；") : groupName,
    surgeryFeeItems: recommendations,
    intraoperativeDrugs: [],
    monitoringAndAssistItems: [
      "该模块后续逐步补充。若血氧监测已归入心电监护，原则上不单独重复收费，按心电监护相关口径执行。",
    ],
    monitoringAndAssistFeeItems: assistRuleResult.assistFeeItems,
    lowValueConsumables: [],
    highValueConsumables: [],
    nursingCooperationPoints: [],
    operatorPreferences: [],
    riskWarnings: unique(globalWarnings),
    manualReviewItems: unique(recommendations.flatMap((rec) => rec.reviews)),
  };

  return {
    input,
    groupId,
    groupName,
    recommendations,
    unsupportedMessage,
    globalWarnings: unique(globalWarnings),
    parsedFacts: unique(parsedFacts),
    parsedActions: unique(parsedActions),
    choicePrompts,
    systemGroups,
    procedureProfile,
  };
}

export const quickExamples = ["脑血管溶栓+支架", "冠脉支架+IVUS+FFR", "房颤射频消融+三维+ICE"];

export const vesselOptions = coronaryVessels;


