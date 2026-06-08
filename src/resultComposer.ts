import type { QuantityType, Recommendation } from "./types";
import { calculateEstimatedAmount, inferQuantityMeta } from "./quantityConfirmationRules";

export function priceText(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(value % 1 ? 2 : 0)} 元` : "待确认";
}

export function compactPriceText(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(value % 1 ? 2 : 0)}元` : "待确认";
}

export function quantityMultiplierText(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 1) return "";
  return `×${Number.isInteger(quantity) ? quantity : Number(quantity.toFixed(2))}`;
}

export function mainComboMeta(rec: Recommendation, quantityValues?: Partial<Record<QuantityType, string>>) {
  const unit = rec.item.unit || "待确认";
  const suffix = unit === "小时" && typeof rec.item.price === "number" ? "/小时" : "";
  const meta = inferQuantityMeta(rec.item);
  const estimate = meta.quantityType ? calculateEstimatedAmount(rec.item, quantityValues?.[meta.quantityType]) : null;
  const quantity = Number.isFinite(rec.quantity) ? Number(rec.quantity.toFixed(2)) : 1;
  const subtotal = typeof rec.item.price === "number" ? rec.item.price * quantity : null;
  const baseText = `${unit}｜单价 ${compactPriceText(rec.item.price)}${suffix}｜数量 ${quantity}｜小计 ${compactPriceText(subtotal)}`;
  return estimate === null ? baseText : `${baseText}｜按填写估算 ${compactPriceText(estimate)}`;
}
