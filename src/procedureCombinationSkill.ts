import type { BillingItem } from "./types";
import type { ApiRule } from "./api";
import { analyzeProcedure, mergeLatestStandardItems, quickExamples, vesselOptions } from "./logic";

// 全局搜索解析入口：所有用户输入先经过这里，再进入展示层。
export function runProcedureCombinationSkill(input: string, officialItems: BillingItem[], manualRules: ApiRule[]) {
  return analyzeProcedure(input, officialItems, manualRules);
}

export { mergeLatestStandardItems, quickExamples, vesselOptions };

