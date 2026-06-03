import assert from "node:assert/strict";
import { runProcedureCombinationSkill as analyzeProcedure } from "../src/procedureCombinationSkill";
import { loadRuntimeData } from "../src/api";
import { calculateEstimatedAmount, inferQuantityMeta } from "../src/quantityConfirmationRules";
import { quantityMultiplierText } from "../src/resultComposer";
import type { BillingItem } from "../src/types";
import itemsJson from "../src/data/items.generated.json";
import { findNeuroGroupProcedure, isNeuroGroupListQuery, neuroGroupProcedures } from "../src/data/neuroGroup";

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
  assert.ok(neuroGroupProcedures.length >= 8, "神经组至少应录入 8 个术式");
  assert.ok(isNeuroGroupListQuery("神经组"), "搜索神经组应进入神经组术式列表");
}

{
  const procedure = findNeuroGroupProcedure("急诊取栓");
  assert.ok(procedure, "应识别急诊取栓");
  assert.deepEqual(procedure.chargeItems, ["脑血管造影费", "脑血管腔内减容费（介入）"]);
  assert.equal(procedure.priorityWarning, "固定患者，尤其是局麻患者。", "急诊取栓应在标题下方显示醒目安全提醒");
  assert.ok(!procedure.specialNotes.includes("固定患者，尤其是局麻患者。"), "急诊取栓醒目提醒不应在特殊提醒中重复显示");
  assert.ok(procedure.consumables.includes("120cm 连接管 2 个"), "急诊取栓耗材应包含 120cm 连接管 2 个");
  assert.ok(procedure.consumables.includes("尿不湿 1 个"), "急诊取栓耗材应包含尿不湿 1 个");
  assert.ok(!procedure.consumables.includes("6F 腿鞘"), "急诊取栓耗材不再包含 6F 腿鞘");
  assert.ok(!procedure.consumables.includes("通桥取栓支架"), "急诊取栓耗材不再包含通桥取栓支架");
}

{
  const procedure = findNeuroGroupProcedure("颅内动脉瘤栓塞术");
  assert.ok(procedure, "应识别颅内动脉瘤栓塞术");
  assert.deepEqual(procedure.chargeItems, ["脑血管造影费", "颅内动脉瘤栓塞费（介入）"]);
}

{
  const procedure = findNeuroGroupProcedure("颈动脉支架");
  assert.ok(procedure, "应识别颈动脉支架");
  assert.ok(procedure.questions.some((question) => question.includes("颅内段")), "颈动脉支架必须追问支架位置");
  assert.equal(procedure.images.length, 0, "收费系统截图只属于 TCAR，不应显示在颈动脉支架规则中");
}

{
  const procedure = findNeuroGroupProcedure("TCAR");
  assert.ok(procedure, "应识别 TCAR");
  assert.ok(procedure.images.some((image) => image.src.includes("neuro-charge-example")), "TCAR 详情应显示收费系统截图");
}

{
  const procedure = findNeuroGroupProcedure("脑保护伞下颈动脉支架置入术");
  assert.ok(procedure, "应识别脑保护伞下颈动脉支架置入术");
  assert.equal(procedure.images.length, 0, "收费系统截图只属于 TCAR，不应显示在脑保护伞术式中");
}

{
  const procedure = findNeuroGroupProcedure("三叉神经微球囊压迫");
  assert.ok(procedure, "应识别三叉神经微球囊压迫");
  assert.equal(procedure.procedureName, "经皮穿刺三叉神经微球囊压迫扩张术");
  assert.deepEqual(procedure.chargeItems, ["颅神经松解费"]);
  assert.deepEqual(procedure.fluids, ["500ml 盐水", "50ml 造影剂"]);
  assert.equal(procedure.anesthesia, "全麻");
  assert.ok(procedure.nursingPoints.some((text) => text.includes("脚踏凳")), "应提示准备脚踏凳");
  assert.ok(procedure.specialNotes.some((text) => text.includes("心率") && text.includes("血压")), "应提示压迫时生命体征变化");
}

{
  assert.equal(findNeuroGroupProcedure("微球囊压迫")?.procedureName, "经皮穿刺三叉神经微球囊压迫扩张术");
  assert.equal(findNeuroGroupProcedure("颅神经松解费")?.procedureName, "经皮穿刺三叉神经微球囊压迫扩张术");
  const output = names("颅神经松解费");
  includesName(output, "颅神经松解费");
}

{
  const procedure = findNeuroGroupProcedure("硬脑膜动静脉瘘");
  assert.ok(procedure, "应识别硬脑膜动静脉瘘");
  assert.deepEqual(procedure.chargeItems, ["脑血管造影费", "脑血管栓塞费（介入）"]);
  assert.ok(
    procedure.chargeExplanation.some((text) => text.includes("原单纯脑动静脉瘘栓塞术") && text.includes("脑及颅内血管畸形栓塞术")),
    "硬脑膜动静脉瘘应保留原始收费项目名称说明",
  );
}

{
  const procedure = findNeuroGroupProcedure("CCF球扩");
  assert.ok(procedure, "应识别 CCF 球扩");
  assert.equal(procedure.procedureName, "海绵窦动静脉瘘 + 颈动脉球扩");
  assert.deepEqual(procedure.chargeItems, ["脑循环造影费", "脑血管栓塞费（介入）", "脑血管球囊扩张费（介入）"]);
}

{
  const output = result("海绵窦动静脉瘘+颈动脉球扩");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管栓塞费");
  includesName(outputNames, "脑血管球囊扩张费");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "ccf_embolization_scope"), "CCF 应提示确认动静脉瘘栓塞位置数量");
  const balloon = output.recommendations.find((rec) => rec.item.newName.includes("脑血管球囊扩张费"));
  assert.equal(balloon?.quantity, 1, "CCF 球囊扩张默认按 1 处/1 血管提示");
  assert.ok(balloon?.tags.includes("skip_quantity_note"), "CCF 球囊扩张不应触发动脉/静脉数量追问");
}

{
  const output = result("海绵窦瘘+颈动脉球扩+栓塞数量2");
  const embolization = output.recommendations.find((rec) => rec.item.newName.includes("脑血管栓塞费"));
  const balloon = output.recommendations.find((rec) => rec.item.newName.includes("脑血管球囊扩张费"));
  assert.equal(embolization?.quantity, 2, "动脉+静脉时脑血管栓塞费应显示为 2 个数量");
  assert.equal(balloon?.quantity, 1, "动脉+静脉不影响脑血管球囊扩张费数量");
  assert.equal(quantityMultiplierText(embolization?.quantity || 1), "×2");
  assert.equal(quantityMultiplierText(balloon?.quantity || 1), "");
}

{
  const output = result("前降支冠脉支架+回旋支冠脉支架");
  const stent = output.recommendations.find((rec) => rec.item.newName.includes("冠状动脉支架置入费"));
  assert.equal(stent?.quantity, 2, "两支冠脉血管支架应合并显示为同一项目 ×2");
  assert.equal(quantityMultiplierText(stent?.quantity || 1), "×2");
}

{
  const output = result("脑血管支架");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管支架置入费");
  assert.ok(!outputNames.some((name) => name.includes("超过3根血管加收")), "未选择非靶血管造影前不默认加入超过3根加收");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.title.includes("脑血管造影血管数量是否超过 3 根")), "脑血管治疗类术式应询问造影血管数量是否超过3根");
  assert.ok(!JSON.stringify(output.choicePrompts || []).includes("是否只针对靶血管造影"), "不应再询问是否只针对靶血管造影");
  assert.ok(!JSON.stringify(output.choicePrompts || []).includes("一部"), "不应再询问一部");
  assert.ok(!JSON.stringify(output.choicePrompts || []).includes("三部"), "不应再询问三部");
}

{
  const output = result("脑血管支架+造影3根及以下");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管支架置入费");
  assert.ok(!outputNames.some((name) => name.includes("超过3根血管加收")), "3根及以下造影不加入超过3根加收");
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.title.includes("脑血管造影血管数量是否超过 3 根")), "已选择造影根数后不重复询问");
}

{
  const output = result("脑血管支架+全脑8根造影");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管支架置入费");
  includesName(outputNames, "脑血管造影超过3根血管加收");
  const surcharge = output.recommendations.find((rec) => rec.item.newName.includes("超过3根血管加收"));
  assert.equal(surcharge?.quantity, 5, "非靶血管造影按8根计算时应显示超过3根加收×5");
  assert.equal(quantityMultiplierText(surcharge?.quantity || 1), "×5");
}

{
  const output = result("脑血管造影5根");
  const surcharge = output.recommendations.find((rec) => rec.item.newName.includes("超过3根血管加收"));
  assert.equal(surcharge?.quantity, 2, "脑血管造影5根应显示超过3根加收×2");
}

{
  const output = result("急诊取栓+全脑8根造影");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管腔内减容费");
  includesName(outputNames, "脑血管造影超过3根血管加收");
}

{
  const output = result("颅内动脉瘤栓塞术+全脑8根造影");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "颅内动脉瘤栓塞费");
  includesName(outputNames, "脑血管造影超过3根血管加收");
}

{
  const output = result("脑血管造影");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管造影费");
  includesName(outputNames, "脑血管造影超过3根血管加收");
  assert.ok(!JSON.stringify(output.choicePrompts || []).includes("是否只针对靶血管造影"), "单纯脑血管造影不询问是否只针对靶血管");
  const surcharge = output.recommendations.find((rec) => rec.item.newName.includes("超过3根血管加收"));
  assert.equal(surcharge?.quantity, 5, "单纯脑血管造影默认按8根血管，超过3根加收×5");
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
  const output = names("急诊取栓");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管腔内减容费");
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
  const output = names("颅内动脉瘤栓塞术");
  includesName(output, "脑血管造影费");
  includesName(output, "颅内动脉瘤栓塞费");
  assert.ok(!output.some((name) => name.includes("脑血管支架置入费")), "颅内动脉瘤栓塞术不应另收脑血管支架置入费");
}

{
  const output = result("颈动脉支架");
  includesName(output.recommendations.map((rec) => rec.item.newName), "脑血管造影费");
  assert.ok(output.choicePrompts?.some((prompt) => prompt.type === "carotid_stent_location"), "颈动脉支架应提示选择颅内段/颅外段");
  assert.ok(!JSON.stringify(output.choicePrompts || []).includes("颈动脉以下"), "颈动脉支架位置追问不再出现颈动脉以下");
}

{
  const output = names("颈动脉支架+颅内段");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管支架置入费");
  includesName(output, "脑血管支架置入费（介入）-颅内血管（加收）");
  assert.ok(!output.some((name) => name.includes("颈动脉支架置入术")), "颅内段颈动脉支架不应使用旧颈动脉支架置入术");
}

{
  const output = names("颈动脉支架+颅外段");
  includesName(output, "脑血管造影费");
  includesName(output, "脑血管支架置入费");
  assert.ok(!output.some((name) => name.includes("颅内血管（加收）")), "颅外段颈动脉支架不加收颅内血管");
  assert.ok(!output.some((name) => name.includes("颈动脉支架置入术")), "颅外段颈动脉支架也不再使用旧颈动脉支架置入术");
}

{
  const output = result("脑血管支架+颅内段+治疗血管2根");
  const stent = output.recommendations.find((rec) => rec.item.newName === "脑血管支架置入费（介入）");
  const addon = output.recommendations.find((rec) => rec.item.newName.includes("脑血管支架置入费（介入）-颅内血管"));
  assert.equal(stent?.quantity, 2, "颅内支架主项目应按治疗血管数量动态显示×2");
  assert.equal(addon?.quantity, 2, "颅内支架加收应按治疗血管数量动态显示×2");
}

{
  const output = result("脑血管球囊扩张+颅内段+治疗血管2根");
  const balloon = output.recommendations.find((rec) => rec.item.newName === "脑血管球囊扩张费（介入）");
  const addon = output.recommendations.find((rec) => rec.item.newName.includes("脑血管球囊扩张费（介入）-颅内血管"));
  assert.equal(balloon?.quantity, 2, "颅内球囊主项目应按治疗血管数量动态显示×2");
  assert.equal(addon?.quantity, 2, "颅内球囊加收应按治疗血管数量动态显示×2");
}

{
  const output = result("颅内动脉瘤栓塞术+治疗血管2根");
  const aneurysm = output.recommendations.find((rec) => rec.item.newName.includes("颅内动脉瘤栓塞费"));
  assert.equal(aneurysm?.quantity, 2, "颅内动脉瘤栓塞应按治疗血管数量动态显示×2");
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
  const output = result("脑动静脉瘘+栓塞数量2");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管栓塞费");
  assert.ok(!outputNames.some((name) => name.includes("脑血管畸形栓塞")), "脑动静脉瘘不默认加脑血管畸形栓塞加收");
  const embolization = output.recommendations.find((rec) => rec.item.newName === "脑血管栓塞费（介入）");
  assert.equal(embolization?.quantity, 2, "动脉+静脉均栓塞时脑血管栓塞费显示×2");
}

{
  const output = result("脑血管畸形栓塞+栓塞数量2");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "脑血管栓塞费");
  includesName(outputNames, "脑血管栓塞费（介入）-脑血管畸形栓塞（加收）");
  const embolization = output.recommendations.find((rec) => rec.item.newName === "脑血管栓塞费（介入）");
  const addon = output.recommendations.find((rec) => rec.item.newName.includes("脑血管畸形栓塞"));
  assert.equal(embolization?.quantity, 2, "脑血管畸形栓塞主项目按血管数量×2");
  assert.equal(addon?.quantity, 2, "脑血管畸形栓塞加收按血管数量×2");
}

{
  const output = names("锁骨下动脉支架");
  includesName(output, "经皮动脉支架置入术");
  assert.ok(!output.some((name) => name.includes("脑血管支架置入费")), "锁骨下动脉支架不要误映射为脑血管支架置入费");
}

{
  const output = result("慢性闭塞脑血管逆向再通+颅内血管+治疗血管2根");
  includesName(output.recommendations.map((rec) => rec.item.newName), "慢性闭塞脑血管逆向再通费（介入）");
  includesName(output.recommendations.map((rec) => rec.item.newName), "慢性闭塞脑血管逆向再通费（介入）-颅内血管（加收）");
  const main = output.recommendations.find((rec) => rec.item.newName === "慢性闭塞脑血管逆向再通费（介入）");
  const addon = output.recommendations.find((rec) => rec.item.newName.includes("慢性闭塞脑血管逆向再通费（介入）-颅内血管"));
  assert.equal(main?.quantity, 2, "慢性闭塞脑血管逆向再通主项目按血管数量×2");
  assert.equal(addon?.quantity, 2, "慢性闭塞脑血管逆向再通颅内加收按血管数量×2");
}

{
  const output = names("冠脉取栓+支架");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉腔内减容费");
  includesName(output, "冠状动脉支架置入费");
}

{
  const output = names("冠脉溶栓+支架");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉支架置入费");
  includesName(output, "冠状动脉溶栓费");
}

{
  const output = names("冠脉支架+溶栓");
  includesName(output, "冠状动脉造影费");
  includesName(output, "冠状动脉支架置入费");
  includesName(output, "冠状动脉溶栓费");
}

{
  const output = analyzeProcedure("冠脉溶栓+支架", [], []);
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "冠状动脉造影费");
  includesName(outputNames, "冠状动脉支架置入费");
  includesName(outputNames, "冠状动脉溶栓费");
  assert.ok(!outputNames.some((name) => name.includes("脑血管")), "官方心血管项目库缺失时不能回退误匹配脑血管项目");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("补充官方项目库")), "官方项目缺失时应提示补充收费目录");
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
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.type === "device_adaptation"), "首次植入不再询问术前程控/装置适配收费");
}

{
  const output = result("单腔起搏器+术前程控");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  includesName(outputNames, "永久起搏器安装费");
  assert.ok(!outputNames.some((name) => name.includes("心脏植入式装置适配费")), "明确术前程控后，适配费仍不进入手术费主组合");
  assert.ok(!assistNames.some((name) => name.includes("心脏植入式装置适配费")), "首次植入术前程控不得自动加入适配费");
  assert.ok(output.globalWarnings.some((warning) => warning.includes("初次调试不得收取")), "应提示植入手术后的初次调试不得收费");
}

{
  const output = result("三腔起搏器+参数适配");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  includesName(outputNames, "永久起搏器安装费");
  includesName(outputNames, "三腔起搏器/除颤器安装");
  assert.ok(!assistNames.some((name) => name.includes("心脏植入式装置适配费")), "三腔首次植入参数适配不得收取适配费");
}

{
  const output = result("起搏器更换");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  includesName(outputNames, "永久起搏器更换费");
  includesName(assistNames, "心脏植入式装置适配费");
}

{
  const output = result("电极调整术");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  includesName(outputNames, "电极调整术");
  includesName(assistNames, "心脏植入式装置适配费");
}

{
  const output = result("起搏器植入+术前程控");
  const assistNames = output.procedureProfile?.monitoringAndAssistFeeItems.map((rec) => rec.item.newName) || [];
  assert.ok(!assistNames.some((name) => name.includes("心脏植入式装置适配费")), "起搏器首次植入+术前程控不得自动收取适配费");
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

for (const input of ["阵发性室上性心动过速", "室上速", "预激综合征", "预激综合症", "I型心房扑动", "房性早搏", "房早", "室性早搏", "室早", "房性心动过速", "房速", "非器质性心脏病的室性心动过速", "非器质性室速", "室性心动过速", "室速", "PSVT", "WPW", "PVC", "AT", "VT"]) {
  const output = result(input);
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "心腔三维标测费");
  assert.ok(!outputNames.some((name) => name.includes("房间隔分流费")), `${input} 默认不应加入房间隔分流费`);
  assert.ok(
    output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture" && prompt.title.includes("房间隔分流术")),
    `${input} 应追问是否进行了房间隔分流术`,
  );
}

{
  const output = result("室上速+房间隔分流术");
  const outputNames = output.recommendations.map((rec) => rec.item.newName);
  includesName(outputNames, "有创心内电生理检查费");
  includesName(outputNames, "心律失常消融费（常规）");
  includesName(outputNames, "心腔三维标测费");
  includesName(outputNames, "房间隔分流费");
  assert.ok(!output.choicePrompts?.some((prompt) => prompt.type === "transseptal_puncture"), "已选择是后不应重复追问房间隔分流术");
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

{
  const staticItem: BillingItem = {
    systemCategory: "心血管",
    sourceFile: "static",
    newCode: "test-code",
    newName: "冠状动脉支架置入费",
    itemType: "main",
    description: "",
    unit: "血管",
    billingNote: "",
    price: 4980,
    oldCodes: [],
    oldNames: [],
    parentItem: "冠状动脉支架置入费",
    keywords: ["冠状动脉支架置入费"],
    isInterventional: true,
    isCommonCathLabItem: true,
  };
  const calls: string[] = [];
  const store = new Map<string, string>();
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
  globalThis.fetch = (async (url: string | URL | Request) => {
    const path = String(url);
    calls.push(path);
    if (path.startsWith("/api/")) return { ok: false, status: 404, json: async () => ({}) } as Response;
    if (path === "/items.json") return { ok: true, json: async () => [staticItem] } as Response;
    if (path === "/billingRules.json") {
      return { ok: true, json: async () => ({ countRules: [], addonRules: [], exclusionRules: [], extensionRules: [], mappingRules: [], manualReviewRules: [] }) } as Response;
    }
    throw new Error(`unexpected fetch ${path}`);
  }) as typeof fetch;

  const data = await loadRuntimeData();
  assert.equal(data.items[0].newName, "冠状动脉支架置入费", "静态 Netlify 环境应回退读取 /items.json");
  assert.ok(calls.includes("/items.json"), "API 不存在时必须读取静态 items.json");

  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
}

console.log("procedureParser.test.ts passed");
