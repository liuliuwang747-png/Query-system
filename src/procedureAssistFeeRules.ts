import type { BillingItem, ChoicePrompt, Recommendation } from "./types";

const adaptationTriggers = /术前程控|起搏器程控|参数适配|装置适配|植入式装置适配|程控后植入/;
const pacemakerImplantTriggers = /单腔起搏器|双腔起搏器|无导线起搏器|永久起搏器植入|永久起搏器|His起搏|希氏束起搏|三腔起搏器|CRT|ICD|除颤器植入|植入式除颤器|起搏器植入/;

function findItem(items: BillingItem[], name: string) {
  return items.find((item) => item.newName === name && item.itemType === "main") || items.find((item) => item.newName.includes(name));
}

function createRecommendation(item: BillingItem, input: string): Recommendation {
  return {
    id: `assist-${item.newCode}`,
    item,
    quantity: 1,
    reason: "术间已进行术前程控/起搏器程控/装置适配，按处置费规则提示收取。",
    clinicalTerm: input,
    actualAction: "术前程控 / 起搏器参数适配 / 植入式装置适配",
    addons: [],
    exclusions: [],
    reviews: ["仅在术间实际进行了术前程控或装置适配，并与手术记录相符时收取。"],
    recordAdvice: ["记录术前程控、参数读取、参数调整或装置适配过程。"],
    tags: ["处置费"],
    systemId: "pacemaker",
    systemName: "起搏器系统",
    systemGroup: "pacemaker",
    actionName: "心脏植入式装置适配",
  };
}

export function deviceAdaptationPrompt(input: string): ChoicePrompt {
  return {
    id: "device-adaptation",
    type: "device_adaptation",
    title: "已进行术前程控/装置适配？",
    description: "心脏植入式装置适配费属于处置费，不进入手术费主组合。",
    groups: [
      {
        title: "起搏器适配确认",
        options: [
          {
            label: "是，加入适配费",
            query: `${input}+术前程控`,
            resultHint: "心脏植入式装置适配费",
          },
          { label: "否，不加入", resultHint: "不加入处置费" },
          { label: "不确定，人工确认", resultHint: "放入人工确认" },
        ],
      },
    ],
  };
}

export function applyProcedureAssistFeeRules(input: string, items: BillingItem[], choicePrompts: ChoicePrompt[]) {
  const assistFeeItems: Recommendation[] = [];
  const warnings: string[] = [];
  const adaptationItem = findItem(items, "心脏植入式装置适配费");
  const hasPacemakerImplant = pacemakerImplantTriggers.test(input);
  const hasAdaptation = adaptationTriggers.test(input);

  if (hasAdaptation) {
    if (adaptationItem) {
      assistFeeItems.push(createRecommendation(adaptationItem, input));
    } else {
      warnings.push("已识别术前程控/装置适配，但当前项目库未找到“心脏植入式装置适配费”，请人工确认。");
    }
  } else if (hasPacemakerImplant && !choicePrompts.some((prompt) => prompt.type === "device_adaptation")) {
    choicePrompts.push(deviceAdaptationPrompt(input));
  }

  return { assistFeeItems, warnings };
}

