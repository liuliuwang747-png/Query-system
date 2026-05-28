export type ItemType = "main" | "add_on" | "extension" | "reduction";

export type SystemGroup =
  | "coronary_intervention"
  | "neuro_intervention"
  | "electrophysiology"
  | "pacemaker"
  | "structural_congenital"
  | "cardiac_catheterization"
  | "hypertension_renal"
  | "other";

export type QuantityType =
  | "angiography_vessel_count"
  | "treatment_vessel_count"
  | "spinal_vessel_count"
  | "hour_count"
  | "lesion_count"
  | "nerve_count"
  | "addon_count"
  | "unknown_quantity";

export type BillingItem = {
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

export type BillingRules = {
  version: number;
  source: string;
  localOnly: boolean;
  ruleTypes: string[];
  groups: RuleGroup[];
  countRules: RuleRecord[];
  addonRules: RuleRecord[];
  exclusionRules: RuleRecord[];
  extensionRules: RuleRecord[];
  mappingRules: RuleRecord[];
  manualReviewRules: RuleRecord[];
};

export type RuleGroup = {
  id: string;
  name: string;
  enabled: boolean;
  unavailableReason?: string;
};

export type RuleRecord = {
  id: string;
  type: string;
  scope: string;
  title?: string;
  action?: string;
  unitBasis?: string;
  baseCount?: number;
  extraRate?: number;
  maxPrice?: number;
  itemNameIncludes?: string;
  parentItemNameIncludes?: string;
  primaryItemNameIncludes?: string;
  excludedItemNameIncludes?: string;
  targetItemNameIncludes?: string;
  triggerKeywords?: string[];
  sameScope?: string;
  reason?: string;
  ruleText?: string;
};

export type Recommendation = {
  id: string;
  item: BillingItem;
  quantity: number;
  reason: string;
  clinicalTerm?: string;
  actualAction?: string;
  addons: string[];
  exclusions: string[];
  reviews: string[];
  recordAdvice: string[];
  tags: string[];
  systemId?: string;
  systemName?: string;
  systemGroup?: SystemGroup;
  actionName?: string;
};

export type ChoicePrompt = {
  id: string;
  type:
    | "ablation_disease"
    | "transseptal_puncture"
    | "selective_artery_angiography"
    | "device_adaptation"
    | "carotid_stent_location"
    | "ccf_embolization_scope"
    | "target_vessel_angiography";
  title: string;
  description?: string;
  groups: Array<{
    title: string;
    options: Array<{
      label: string;
      query?: string;
      resultHint?: string;
    }>;
  }>;
};

export type ProcedureProfile = {
  procedureName: string;
  systemGroup: SystemGroup;
  systemCategory: string;
  surgeryFeeItems: Recommendation[];
  intraoperativeDrugs: string[];
  monitoringAndAssistItems: string[];
  monitoringAndAssistFeeItems: Recommendation[];
  lowValueConsumables: string[];
  highValueConsumables: string[];
  nursingCooperationPoints: string[];
  operatorPreferences: string[];
  riskWarnings: string[];
  manualReviewItems: string[];
};

export type AnalysisResult = {
  input: string;
  groupId: string;
  groupName: string;
  recommendations: Recommendation[];
  unsupportedMessage?: string;
  globalWarnings: string[];
  parsedFacts: string[];
  parsedActions?: string[];
  choicePrompts?: ChoicePrompt[];
  systemGroups?: Array<{
    systemId: SystemGroup;
    systemName: string;
    recommendations: Recommendation[];
  }>;
  procedureProfile?: ProcedureProfile;
};
