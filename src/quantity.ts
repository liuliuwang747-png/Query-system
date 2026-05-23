import type { BillingItem, QuantityType } from "./types";

export type QuantityMeta = {
  needsQuantityConfirmation: boolean;
  quantityType?: QuantityType;
  label?: string;
  ruleText?: string;
  baseCount?: number;
  extraRate?: number;
  maxPrice?: number;
};

const quantitySensitivePattern =
  /每增加|每增|超过[^。；，,]*加收|按\s*\d+(?:\.\d+)?\s*%|按比例加收|不得超过|最高不超过|封顶|每小时|每根|每支|每部位|每血管|每病变|同一血管|同一病变部位|多处狭窄|颅内和颅外/;

function itemText(item: Pick<BillingItem, "newName" | "unit" | "billingNote" | "description" | "itemType">) {
  return `${item.newName} ${item.unit} ${item.billingNote}`;
}

export function inferQuantityMeta(item: Pick<BillingItem, "newName" | "unit" | "billingNote" | "description" | "itemType" | "needsQuantityConfirmation" | "quantityType" | "quantityRuleText">): QuantityMeta {
  if (item.needsQuantityConfirmation && item.quantityType && item.quantityType !== "unknown_quantity") {
    return {
      needsQuantityConfirmation: true,
      quantityType: item.quantityType,
      label: labelForQuantityType(item.quantityType),
      ruleText: item.quantityRuleText,
    };
  }

  const text = itemText(item);
  const unit = item.unit || "";

  if (item.newName.includes("脑血管造影费") && item.itemType === "main") {
    return {
      needsQuantityConfirmation: true,
      quantityType: "angiography_vessel_count",
      label: "造影血管数量",
      ruleText: "3根及以下按1次，超过3根每增加1根按33%加收，封顶7280元。",
      baseCount: 3,
      extraRate: 0.33,
      maxPrice: 7280,
    };
  }

  if (item.newName.includes("脊髓血管造影费") && item.itemType === "main") {
    return {
      needsQuantityConfirmation: true,
      quantityType: "spinal_vessel_count",
      label: "脊髓造影血管数量",
      ruleText: "4根及以下按1次，超过4根每增加1根按25%加收，封顶11970元。",
      baseCount: 4,
      extraRate: 0.25,
      maxPrice: 11970,
    };
  }

  if (unit.includes("血管")) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "treatment_vessel_count",
      label: "治疗血管数量",
      ruleText: item.billingNote || "按治疗血管数量计费，需结合手术记录确认。",
    };
  }

  if (unit.includes("小时") || /每小时|小时/.test(text)) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "hour_count",
      label: "运行/监测小时数",
      ruleText: item.billingNote || "按小时计费，需确认实际运行或监测小时数。",
    };
  }

  if (unit.includes("根") || /每根|神经根|根神经/.test(text)) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "nerve_count",
      label: "神经根数",
      ruleText: item.billingNote || "按神经根数计费，需确认实际根数。",
    };
  }

  if (unit.includes("支") || /每支/.test(text)) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "unknown_quantity",
      label: "支数",
      ruleText: item.billingNote || "按支数计费，需确认实际数量。",
    };
  }

  if (/每病变|病变部位数量|同一病变部位|每部位|多处狭窄/.test(text) || /部位|病变/.test(unit)) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "lesion_count",
      label: "病变部位数量",
      ruleText: item.billingNote || "按病变部位或同一病变部位口径确认数量。",
    };
  }

  if (/每增加|每增|超过[^。；，,]*加收|按\s*\d+(?:\.\d+)?\s*%|按比例加收/.test(text)) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "addon_count",
      label: "加收数量",
      ruleText: item.billingNote || "加收项目需依附主项目，并确认适用数量。",
    };
  }

  if (quantitySensitivePattern.test(text)) {
    return {
      needsQuantityConfirmation: true,
      quantityType: "unknown_quantity",
      label: "数量口径",
      ruleText: item.billingNote || "计价说明涉及数量、比例或封顶，需人工确认。",
    };
  }

  return { needsQuantityConfirmation: false };
}

export function labelForQuantityType(type: QuantityType) {
  const labels: Record<QuantityType, string> = {
    angiography_vessel_count: "造影血管数量",
    treatment_vessel_count: "治疗血管数量",
    spinal_vessel_count: "脊髓造影血管数量",
    hour_count: "运行/监测小时数",
    lesion_count: "病变部位数量",
    nerve_count: "神经根数",
    addon_count: "加收数量",
    unknown_quantity: "数量口径",
  };
  return labels[type];
}

export function suffixForQuantityType(type: QuantityType) {
  const suffixes: Record<QuantityType, string> = {
    angiography_vessel_count: "根",
    treatment_vessel_count: "根",
    spinal_vessel_count: "根",
    hour_count: "小时",
    lesion_count: "处",
    nerve_count: "根",
    addon_count: "项",
    unknown_quantity: "",
  };
  return suffixes[type];
}

export function calculateEstimatedAmount(item: BillingItem, quantityValue: string | undefined) {
  const quantity = Number(quantityValue);
  if (!Number.isFinite(quantity) || quantity <= 0 || typeof item.price !== "number") return null;
  const meta = inferQuantityMeta(item);

  if (meta.quantityType === "angiography_vessel_count") {
    const amount = quantity <= 3 ? item.price : item.price + (quantity - 3) * item.price * 0.33;
    return Math.min(amount, 7280);
  }

  if (meta.quantityType === "spinal_vessel_count") {
    const amount = quantity <= 4 ? item.price : item.price + (quantity - 4) * item.price * 0.25;
    return Math.min(amount, 11970);
  }

  if (["treatment_vessel_count", "hour_count", "lesion_count", "nerve_count", "addon_count"].includes(meta.quantityType || "")) {
    return item.price * quantity;
  }

  return null;
}
