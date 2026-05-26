import type { BillingItem, ChoicePrompt, Recommendation } from "./types";

const adaptationMentionTriggers = /术前程控|起搏器程控|参数适配|装置适配|植入式装置适配|程控后植入|初次调试|参数调整/;
const eligibleAdaptationTriggers = /起搏器更换|更换起搏器|起搏器换机|起搏器换盒|脉冲发生器更换|电极调整|起搏电极调整|电极复位|电极位置调整/;
const nonChargeableImplantTriggers = /单腔起搏器|双腔起搏器|无导线起搏器|永久起搏器植入|永久起搏器|His起搏|希氏束起搏|三腔起搏器|CRT|CRT-D|ICD|除颤器植入|植入式除颤器|起搏器植入|临时起搏器|临时起搏|临起/;

function findItem(items: BillingItem[], name: string) {
  return items.find((item) => item.newName === name && item.itemType === "main") || items.find((item) => item.newName.includes(name));
}

function createRecommendation(item: BillingItem, input: string): Recommendation {
  return {
    id: `assist-${item.newCode}`,
    item,
    quantity: 1,
    reason: "最新口径：仅起搏器更换或电极调整术可收取心脏植入式装置适配费。",
    clinicalTerm: input,
    actualAction: "起搏器更换 / 电极调整术相关装置适配",
    addons: [],
    exclusions: [],
    reviews: ["心脏植入式装置适配费仅限起搏器更换或电极调整术；其他首次植入、临时起搏和术后初次调试不得收取。"],
    recordAdvice: ["记录本次为起搏器更换或电极调整术，并写明装置连接、数据读取、参数调整或功能优化过程。"],
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
    title: "是否为起搏器更换或电极调整术？",
    description: "心脏植入式装置适配费仅限起搏器更换或电极调整术，首次植入和植入后初次调试不得收取。",
    groups: [
      {
        title: "适配费条件确认",
        options: [
          {
            label: "起搏器更换",
            query: `${input}+起搏器更换`,
            resultHint: "心脏植入式装置适配费",
          },
          {
            label: "电极调整术",
            query: `${input}+电极调整术`,
            resultHint: "心脏植入式装置适配费",
          },
          { label: "否，不加入", resultHint: "首次植入/临时起搏/初次调试不加入处置费" },
          { label: "不确定，人工确认", resultHint: "放入人工确认" },
        ],
      },
    ],
  };
}

export function applyProcedureAssistFeeRules(input: string, items: BillingItem[], choicePrompts: ChoicePrompt[]) {
  void choicePrompts;
  const assistFeeItems: Recommendation[] = [];
  const warnings: string[] = [];
  const adaptationItem = findItem(items, "心脏植入式装置适配费");
  const isEligibleAdaptation = eligibleAdaptationTriggers.test(input);
  const mentionsOldAdaptation = adaptationMentionTriggers.test(input);
  const isNonChargeableImplant = nonChargeableImplantTriggers.test(input);

  if (isEligibleAdaptation) {
    if (adaptationItem) {
      assistFeeItems.push(createRecommendation(adaptationItem, input));
    } else {
      warnings.push("已识别起搏器更换或电极调整术，但当前项目库未找到“心脏植入式装置适配费”，请人工确认。");
    }
  } else if (isNonChargeableImplant || mentionsOldAdaptation) {
    warnings.push("心脏植入式装置适配费仅限起搏器更换或电极调整术；植入手术后的初次调试不得收取。");
  }

  return { assistFeeItems, warnings };
}
