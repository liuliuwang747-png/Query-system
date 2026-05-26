import latestFeeStandardJson from "./data/cathlab_latest_fee_standard_20260522.json";
import manualRules20260519Json from "./data/cathlab_manual_rules_20260519.json";

type RawManualItem = {
  itemName: string;
  unit?: string;
  price?: number;
  quantity?: number;
  condition?: string;
  warning?: string;
  sourceType?: string;
  quantityHint?: string;
  priceOptions?: number[];
};

type RawManualRule = {
  ruleId: string;
  title: string;
  triggerKeywords?: string[];
  recommendedCombo?: RawManualItem[];
  conditionalItems?: RawManualItem[];
  displayType?: string;
  note?: string;
};

const latestFeeStandard = latestFeeStandardJson as typeof latestFeeStandardJson & {
  heartInterventionCombos: unknown[];
};

const manualRules20260519 = manualRules20260519Json as {
  metadata: { version: string; usage?: string };
  priceSourcePriority?: "officialExcelFirst";
  manualBillingRules: RawManualRule[];
};

function inferGroup(rule: RawManualRule) {
  const text = [rule.ruleId, rule.title, ...(rule.triggerKeywords || [])].join(" ");
  if (/房颤|消融|电生理|心腔|ICE|三维/.test(text)) return "射频消融";
  if (/起搏|ICD|CRT|三腔|除颤器|His/.test(text)) return "起搏器";
  if (/全脑|脑血管|三叉神经|颅神经/.test(text)) return "神经介入";
  if (/外周|下肢|上肢/.test(text)) return "其他导管室项目";
  if (/高血压|肾/.test(text)) return "高血压";
  return "PCI";
}

function normalizeManualItem(item: RawManualItem) {
  return {
    itemName: item.itemName,
    unit: item.unit,
    price: item.price,
    quantity: item.quantity,
    condition: item.condition,
    warning: item.warning,
    sourceType: item.sourceType || "manualBillingRules20260519",
    quantityHint: item.quantityHint,
    priceOptions: item.priceOptions,
    forceInclude: true,
  };
}

function normalizeManualNote(rule: RawManualRule) {
  if (rule.ruleId === "single_dual_leadless_pacemaker" || rule.ruleId === "three_chamber_pacemaker_or_defibrillator") {
    return "心脏植入式装置适配费仅限起搏器更换或电极调整术；单腔、双腔、无导线、三腔、ICD、CRT/CRT-D 首次植入及植入手术后的初次调试不得收取。";
  }
  return rule.note;
}

function normalizeManualRule(rule: RawManualRule) {
  const combo = (rule.recommendedCombo || [])
    .filter((item) => item.itemName !== "心脏植入式装置适配费")
    .map(normalizeManualItem);
  const conditionalItems = (rule.conditionalItems || []).map((item) => ({
    ...normalizeManualItem(item),
    forceInclude: false,
  }));

  return {
    group: inferGroup(rule),
    name: rule.title,
    source: "manualBillingRules20260519",
    ruleId: rule.ruleId,
    triggers: rule.triggerKeywords || [],
    combo,
    conditionalItems,
    manualReview: rule.displayType || !combo.length ? normalizeManualNote(rule) : undefined,
    note: normalizeManualNote(rule),
    priceSourcePriority: manualRules20260519.priceSourcePriority || "officialExcelFirst",
  };
}

const manualCombos20260519 = manualRules20260519.manualBillingRules.map(normalizeManualRule);

// 价格、编码、计价单位始终回 officialItems/Excel；这里仅合并院内组合逻辑。
export const manualBillingRules = {
  ...latestFeeStandard,
  metadata: {
    ...latestFeeStandard.metadata,
    version: `${latestFeeStandard.metadata.version}+manual-${manualRules20260519.metadata.version}`,
    globalNote: `${latestFeeStandard.metadata.globalNote} 组合规则来源可来自院内解读；标准项目名称、编码、计价单位和价格优先回到Excel官方项目库，院内解读价格仅作参考，不覆盖官方项目库。`,
    priceSourcePriority: "officialExcelFirst",
  },
  priceSourcePriority: "officialExcelFirst",
  heartInterventionCombos: [
    ...manualCombos20260519,
    ...latestFeeStandard.heartInterventionCombos,
  ],
};
