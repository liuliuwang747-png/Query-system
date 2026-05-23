import assert from "node:assert/strict";
import { runProcedureCombinationSkill as analyzeProcedure } from "../src/procedureCombinationSkill";
import { calculateEstimatedAmount, inferQuantityMeta } from "../src/quantityConfirmationRules";
import type { BillingItem } from "../src/types";
import itemsJson from "../src/data/items.generated.json";

const items = itemsJson as BillingItem[];
const rules = [];

function names(input: string) {
  return analyzeProcedure(input, items, rules).recommendations.map((rec) => rec.item.newName);
}

function result(input: string) {
  return analyzeProcedure(input, items, rules);
}

function includesName(list: string[], expected: string) {
  assert.ok(
    list.some((name) => name.includes(expected)),
    `期望包含 ${expected}，实际为：${list.join("、")}`,
  );
}

{
  const output = names("脑血管溶栓+支架");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管腔内溶栓费");
  includesName(output, "脑血管支架置入费");
  assert.ok(!output.some((name) => name.includes("冠状动脉支架")), "不能输出冠脉支架相关项目");
}

{
  const output = names("脑血管球囊+支架");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管球囊扩张费");
  includesName(output, "脑血管支架置入费");
}

{
  const output = result("脑血管取栓+支架");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管支架置入费");
  includesName(outputNames, "脑血管腔内减容费");
  assert.ok(
    output.recommendations.some((rec) => rec.item.newName.includes("脑血管腔内减容费") && rec.actualAction?.includes("腔内减容")),
    "取栓应经过实际动作层映射到脑血管腔内减容",
  );
  assert.ok(!outputNames.some((name) => name.includes("冠状动脉")), "脑血管取栓不能误匹配冠脉项目");
}

{
  const output = result("冠脉支架+球囊+IVUS");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "冠状动脉造影费");
  includesName(outputNames, "冠状动脉支架置入费");
  includesName(outputNames, "冠状动脉球囊扩张费");
  includesName(outputNames, "冠状动脉腔内影像学检查费");
  assert.ok(
    output.recommendations.some((rec) => rec.exclusions.some((text) => text.includes("普通预扩张球囊"))),
    "冠脉支架+球囊应提示同一血管可能不能重复收费",
  );
}

{
  const output = result("脑血管支架+冠脉FFR");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管支架置入费");
  includesName(outputNames, "冠状动脉造影费");
  includesName(outputNames, "冠状动脉血流储备功能检查费");
  assert.equal(output.systemGroups?.length, 2, "应分为神经介入和冠脉两个系统");
}

{
  const output = names("脑血管支架+取栓");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管支架置入费");
  includesName(output, "脑血管腔内减容费");
}

{
  const output = names("脑血管取栓");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管腔内减容费");
}

{
  const output = names("脑血管取栓+球囊");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管腔内减容费");
  includesName(output, "脑血管球囊扩张费");
}

{
  const output = result("脑血管动脉瘤弹簧圈+支架辅助");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "颅内动脉瘤栓塞费");
  assert.ok(!outputNames.some((name) => name.includes("脑血管支架置入费")), "颅内动脉瘤弹簧圈+支架辅助不应另收脑血管支架置入费");
  assert.ok(
    output.globalWarnings.some((text) => text.includes("不另收脑血管支架置入费")) ||
      output.recommendations.some((rec) => rec.reviews.some((text) => text.includes("不另收脑血管支架置入费"))),
    "支架辅助弹簧圈应提示已归入颅内动脉瘤栓塞费",
  );
}

{
  const output = names("颅内动脉瘤栓塞+支架");
  includesName(output, "脑血管造影费");
  includesName(output, "颅内动脉瘤栓塞费");
  assert.ok(!output.some((name) => name.includes("脑血管支架置入费")), "颅内动脉瘤栓塞+支架不应另收脑血管支架置入费");
}

{
  const output = names("弹簧圈+支架");
  includesName(output, "脑血管造影费");
  includesName(output, "颅内动脉瘤栓塞费");
  assert.ok(!output.some((name) => name.includes("脑血管支架置入费")), "弹簧圈+支架不应另收脑血管支架置入费");
}

{
  const output = names("密网支架");
  includesName(output, "脑血管造影费");
  includesName(output, "颅内动脉瘤栓塞费");
  assert.ok(!output.some((name) => name.includes("脑血管支架置入费")), "密网支架用于颅内动脉瘤栓塞时不应另收脑血管支架置入费");
}

{
  const output = names("单纯密网支架");
  includesName(output, "脑血管造影费");
  includesName(output, "颅内动脉瘤栓塞费");
  assert.ok(!output.some((name) => name.includes("脑血管支架置入费")), "单纯密网支架应归入颅内动脉瘤栓塞费");
}

{
  const output = names("冠脉取栓+支架");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉腔内减容费");
  includesName(output, "冠状动脉支架置入费");
}

{
  const output = names("冠脉支架+溶栓");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉支架置入费");
  includesName(output, "冠状动脉溶栓费");
}

{
  const output = names("冠脉球囊+尿激酶");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉球囊扩张费");
  includesName(output, "冠状动脉溶栓费");
}

{
  const output = names("冠脉支架+抽吸+溶栓");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉支架置入费");
  includesName(output, "冠状动脉腔内减容费");
  includesName(output, "冠状动脉溶栓费");
}

{
  const output = names("脑血管支架+溶栓");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管支架置入费");
  includesName(output, "脑血管腔内溶栓费");
  assert.ok(!output.some((name) => name.includes("冠状动脉溶栓费")), "脑血管上下文中的溶栓不能误匹配冠脉溶栓");
}

{
  const output = names("冠脉支架+旋磨+IVUS+FFR");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉支架置入费");
  includesName(output, "冠状动脉腔内减容费");
  includesName(output, "冠状动脉腔内影像学检查费");
  includesName(output, "冠状动脉血流储备功能检查费");
}

{
  const output = names("冠脉药球+FFR");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉球囊扩张费");
  includesName(output, "冠状动脉血流储备功能检查费");
}

{
  const output = names("房颤射频消融+三维+ICE");
  includesName(output, "心律失常消融费（复杂）");
  includesName(output, "心腔三维标测费");
  includesName(output, "心腔内超声心动图检查费");
}

{
  const output = names("室上速消融+电生理检查");
  includesName(output, "心律失常消融费");
  includesName(output, "有创心内电生理检查费");
}

{
  const output = result("临起安装+监测+拔除");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "临时起搏器安装费");
  includesName(outputNames, "临时起搏器运行监测费");
  includesName(outputNames, "临时起搏器取出费");
  assert.ok(
    output.recommendations.some((rec) => rec.item.newName.includes("临时起搏器取出费") && rec.exclusions.some((text) => text.includes("单独结算"))),
    "临时起搏器取出费应提示实际取出后单独结算，不能置入当次收取",
  );
}

{
  const output = result("单纯临时起搏器安装");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "临时起搏器安装费");
  includesName(outputNames, "临时起搏器运行监测费");
  assert.ok(!outputNames.some((name) => name.includes("临时起搏器取出费")), "单纯安装当次不能自动加入临时起搏器取出费");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("取出费") && warning.includes("实际")), "应提示取出费待实际取出后单独收费");
}

{
  const output = result("临时起搏器安装+当场拔出");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "临时起搏器安装费");
  includesName(outputNames, "临时起搏器取出费");
  assert.ok(!outputNames.some((name) => name.includes("临时起搏器运行监测费")), "当场拔出场景不默认加入运行监测费");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("运行监测小时数")), "应提示如有运行监测时间再确认运行监测费");
}

{
  const output = result("冠脉支架+临时起搏器+术毕拔除");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "冠状动脉造影费");
  includesName(outputNames, "冠状动脉支架置入费");
  includesName(outputNames, "临时起搏器安装费");
  includesName(outputNames, "临时起搏器取出费");
  assert.ok(!outputNames.some((name) => name.includes("临时起搏器运行监测费")), "术毕拔除场景仅提示监测小时数，不默认加入运行监测费");
}

{
  const output = result("单腔起搏器");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "永久起搏器安装费");
  assert.ok(!outputNames.some((name) => name.includes("心脏植入式装置适配费")), "起搏器适配费不能进入手术费主组合");
  assert.equal(output.procedureProfile?.monitoringAndAssistFeeItems.length, 0, "未明确术前程控时不默认加入适配费");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "device_adaptation"), "起搏器植入应询问是否进行了术前程控/装置适配");
}

{
  const output = result("单腔起搏器+术前程控");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  includesName(outputNames, "永久起搏器安装费");
  assert.ok(!outputNames.some((name) => name.includes("心脏植入式装置适配费")), "明确术前程控后，适配费仍不进入手术费主组合");
  includesName(assistNames, "心脏植入式装置适配费");
}

{
  const output = result("三腔起搏器+参数适配");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  includesName(outputNames, "永久起搏器安装费");
  includesName(outputNames, "三腔起搏器/除颤器安装");
  includesName(assistNames, "心脏植入式装置适配费");
}

{
  const output = result("房缺封堵");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "结构性心脏病封堵费");
  assert.ok(!outputNames.some((name) => name.includes("冠状动脉") || name.includes("脑血管")), "房缺封堵不能返回冠脉或脑血管项目");
}

{
  const output = names("PFO封堵+右心导管");
  includesName(output, "结构性心脏病封堵费");
  includesName(output, "右心导管检查费");
}

{
  const output = names("房缺封堵+右心导管");
  includesName(output, "结构性心脏病封堵费");
  includesName(output, "右心导管检查费");
}

{
  const output = names("冠脉支架+IVUS+FFR");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉支架置入费");
  includesName(output, "冠状动脉腔内影像学检查费");
  includesName(output, "冠状动脉血流储备功能检查费");
}

{
  const output = result("支架+球囊");
  assert.equal(output.recommendations.length, 0, "没有系统上下文时不应默认匹配到冠脉或脑血管项目");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("补充")), "没有系统上下文时应提示补充系统");
}

{
  const output = result("消融");
  assert.equal(output.recommendations.length, 0, "没有疾病上下文时不应默认匹配消融项目");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("房颤") && warning.includes("室上速")), "消融不明确时应提示补充类型");
}

{
  const output = result("射频消融");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  assert.equal(output.recommendations.length, 0, "单独输入射频消融时不应直接输出收费项目");
  assert.ok(!outputNames.some((name) => name.includes("肥厚型心肌病消融费")), "射频消融不能误匹配肥厚型心肌病消融费");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "ablation_disease"), "射频消融应显示病种选择器");
}

{
  for (const input of ["心脏射频消融", "心脏心律失常消融", "导管射频消融", "心律失常消融"]) {
    const output = result(input);
    assert.equal(output.recommendations.length, 0, `${input} 泛称消融不应直接输出收费项目`);
    assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "ablation_disease"), `${input} 应显示病种选择器`);
  }
}

{
  const output = result("常规心律失常消融");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "常规心律失常消融应继续询问房间隔穿刺");
}

{
  const output = result("房颤");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "选择性静脉造影术");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心律失常消融费（复杂）");
  includesName(outputNames, "心腔三维标测费");
  const venography = output.recommendations.find((rec) => rec.item.newName.includes("选择性静脉造影术"));
  const epStudy = output.recommendations.find((rec) => rec.item.newName.includes("有创心内电生理检查费"));
  const complexAblation = output.recommendations.find((rec) => rec.item.newName.includes("心律失常消融费（复杂）"));
  const mapping3d = output.recommendations.find((rec) => rec.item.newName.includes("心腔三维标测费"));
  assert.equal(venography?.item.price, null, "选择性静脉造影术未在官方Excel项目库精确匹配时，不应使用院内解读价覆盖");
  assert.ok(venography?.tags?.includes("需人工确认"), "未精确匹配官方项目的组合项目应提示人工确认");
  assert.equal(epStudy?.item.price, 1690, "房颤组合应显示有创心内电生理检查费1690元");
  assert.equal(complexAblation?.item.price, 7500, "心律失常消融费（复杂）应优先使用Excel官方价格7500元，不被院内解读价覆盖");
  assert.equal(mapping3d?.item.price, 900, "房颤组合应显示心腔三维标测费900元");
}

{
  const output = result("室上速射频消融");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  assert.ok(!outputNames.some((name) => name.includes("选择性静脉造影术")), "室上速常规消融不应默认加入选择性静脉造影术");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "非房颤消融应询问是否进行了房间隔穿刺");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "selective_artery_angiography"), "常规消融应询问是否进行了选择性动脉造影");
}

{
  const output = result("室上速射频消融+房间隔穿刺");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  includesName(outputNames, "房间隔分流费");
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "已确认房间隔穿刺后不应重复询问");
}

{
  const output = result("常规心律失常消融+房间隔穿刺");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  includesName(outputNames, "房间隔分流费");
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "点击是后应保留常规消融上下文并停止重复询问");
}

{
  const output = result("常规心律失常消融+未行房间隔穿刺");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  assert.ok(!outputNames.some((name) => name.includes("房间隔分流费")), "点击否后不能加入房间隔分流费");
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "点击否后不应重复询问房间隔穿刺");
  assert.ok(!output.globalWarnings.some((warning) => warning.includes("无法判断")), "点击否后不应把否定回答当成未知术式");
}

{
  const output = result("室上速射频消融+选择性动脉造影");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  includesName(outputNames, "选择性动脉造影费");
  assert.ok(!outputNames.some((name) => name.includes("选择性静脉造影术")), "常规消融选择动脉造影时不能误加入选择性静脉造影术");
}

{
  const output = result("室上速射频消融+未行选择性动脉造影");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  assert.ok(!outputNames.some((name) => name.includes("选择性动脉造影费")), "点击否后不能加入选择性动脉造影费");
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.type === "selective_artery_angiography"), "点击否后不应重复询问选择性动脉造影");
  assert.ok(!output.globalWarnings.some((warning) => warning.includes("无法判断")), "点击否后不应把否定回答当成未知术式");
}

{
  const output = result("预激综合征消融");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心腔三维标测费");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "预激消融应询问是否进行了房间隔穿刺");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "selective_artery_angiography"), "预激消融应询问是否进行了选择性动脉造影");
}

{
  const output = names("肥厚型心肌病消融");
  includesName(output, "肥厚型心肌病消融费");
}

{
  const output = names("HOCM射频消融");
  includesName(output, "肥厚型心肌病消融费");
}

{
  const output = result("封堵");
  assert.equal(output.recommendations.length, 0, "没有部位上下文时不应默认匹配封堵项目");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("房缺") && warning.includes("左心耳")), "封堵不明确时应提示补充部位");
}

{
  const output = result("脑血管支架+取栓");
  const combo = output.recommendations.map((rec) => rec.item.newName).join(" + ");
  assert.ok(combo.includes("脑血管造影费") && combo.includes("脑血管支架置入费") && combo.includes("脑血管腔内减容费"), "完整组合应同时包含造影、支架、腔内减容");
}

{
  const brainAngio = items.find((item) => item.newName === "脑血管造影费");
  assert.ok(brainAngio, "应存在脑血管造影费");
  const meta = inferQuantityMeta(brainAngio);
  assert.equal(meta.quantityType, "angiography_vessel_count", "脑血管造影费应提示确认造影血管数量");
  assert.equal(calculateEstimatedAmount(brainAngio, "3"), 2730);
  assert.equal(Number(calculateEstimatedAmount(brainAngio, "4")?.toFixed(1)), 3630.9);
  assert.ok((calculateEstimatedAmount(brainAngio, "20") || 0) <= 7280, "脑血管造影费估算金额应封顶7280");
}

{
  const pacemakerMonitor = items.find((item) => item.newName === "临时起搏器运行监测费");
  assert.ok(pacemakerMonitor, "应存在临时起搏器运行监测费");
  const meta = inferQuantityMeta(pacemakerMonitor);
  assert.equal(meta.quantityType, "hour_count", "临时起搏器运行监测费应提示确认小时数");
}

{
  const routine = items.find((item) => item.newName === "心律失常消融费（常规）");
  const complex = items.find((item) => item.newName === "心律失常消融费（复杂）");
  const hcm = items.find((item) => item.newName === "肥厚型心肌病消融费");
  assert.ok(routine && complex && hcm, "应存在三类消融项目");
  assert.equal(inferQuantityMeta(routine).needsQuantityConfirmation, false, "常规心律失常消融为普通按次收费，不应提示数量确认");
  assert.equal(inferQuantityMeta(complex).needsQuantityConfirmation, false, "复杂心律失常消融为普通按次收费，不应提示数量确认");
  assert.equal(inferQuantityMeta(hcm).needsQuantityConfirmation, false, "肥厚型心肌病消融为普通按次收费，不应提示数量确认");
}

console.log("procedureParser.test.ts passed");
