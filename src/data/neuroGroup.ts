export type NeuroGroupProcedure = {
  id: string;
  category: "外周血管";
  subCategory: "神经组";
  procedureName: string;
  keywords: string[];
  chargeItems: string[];
  questions: string[];
  chargeExplanation: string[];
  nursingPoints: string[];
  fluids: string[];
  consumables: string[];
  medications: string[];
  anesthesia?: string;
  specialNotes: string[];
  priorityWarning?: string;
  images: Array<{
    title: string;
    src: string;
    description?: string;
  }>;
  sourceText?: string;
};

const carotidChargeExampleImage = {
  title: "术中收费系统示例",
  src: "/images/neuro/neuro-charge-example.jpg",
  description: "TCAR 术式收费录入示例，可点击查看大图。",
};

export const neuroGroupProcedures: NeuroGroupProcedure[] = [
  {
    id: "davf-embolization",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "硬脑膜动静脉瘘",
    keywords: ["硬脑膜动静脉瘘", "动静脉瘘", "脑动静脉瘘", "DAVF", "瘘栓塞"],
    chargeItems: ["脑血管造影费", "脑血管栓塞费（介入）"],
    questions: ["请确认是否为脑及颅内血管畸形/动静脉瘘栓塞，旧名称需按最新收费表映射。", "Y 阀和输液器数量需按实际准备确认。"],
    chargeExplanation: ["硬脑膜动静脉瘘术式按脑血管造影费 + 脑血管栓塞费（介入）提示；原始收费名称为原单纯脑动静脉瘘栓塞术/脑及颅内血管畸形栓塞术，价格以 Excel 官方收费表为准。"],
    nursingPoints: ["黑色凝胶需提前约半小时用振荡器震荡 4-5 瓶。", "术中通常需要肝素，按医嘱执行。"],
    fluids: [],
    consumables: ["常规注射器 5 个", "纱布 2 包", "Y 阀，数量需询问", "输液器，数量需询问", "泥鳅导丝", "无菌尿不湿", "机头套", "11 号刀片", "三通 3 个"],
    medications: ["黑色凝胶", "肝素"],
    anesthesia: undefined,
    specialNotes: ["文档中的旧项目名称和价格只作配合资料参考，收费名称、单位和价格以官方 Excel 为准。"],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "brain-avm-embolization",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "脑血管畸形栓塞",
    keywords: ["脑血管畸形栓塞", "颅内动脉畸形栓塞", "脑动静脉畸形", "AVM", "AVM栓塞", "血管畸形栓塞"],
    chargeItems: ["脑血管造影费", "脑血管栓塞费（介入）", "脑血管栓塞费（介入）-脑血管畸形栓塞（加收）"],
    questions: ["请确认本次栓塞涉及几根血管。"],
    chargeExplanation: ["脑血管畸形栓塞按脑血管栓塞费（介入）+脑血管畸形栓塞加收提示；不要与脑动静脉瘘混淆。"],
    nursingPoints: [],
    fluids: [],
    consumables: [],
    medications: [],
    anesthesia: undefined,
    specialNotes: ["只有明确为脑血管畸形栓塞/颅内动脉畸形栓塞/AVM 栓塞时，才提示脑血管畸形栓塞加收。"],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "spinal-artery-embolization",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "脊髓动脉栓塞术",
    keywords: ["脊髓动脉栓塞", "脊髓血管畸形", "脊髓造影", "脊髓血管畸形栓塞"],
    chargeItems: ["脊髓血管造影费", "脊髓血管栓塞费（介入）"],
    questions: ["请确认脊髓造影血管数量，超过基础根数后可能涉及比例加收和封顶规则。"],
    chargeExplanation: ["脊髓动脉造影旧名称按脊髓血管造影费映射；脊髓血管畸形栓塞旧名称按脊髓血管栓塞费（介入）映射。"],
    nursingPoints: ["黑色胶使用前需要充分摇匀。"],
    fluids: [],
    consumables: ["黑色胶", "马拉松导管", "0.01 sycorn 导丝", "6F70 Cook 鞘", "弹簧圈"],
    medications: [],
    anesthesia: undefined,
    specialNotes: [],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "tcar",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "TCAR 颈动脉血运重建术",
    keywords: ["TCAR", "颈动脉血运重建", "颈动脉支架", "颈动脉转流", "经颈动脉血运重建"],
    chargeItems: ["选择性动脉造影", "经DSA动静脉人工内瘘人工血管转流术", "颈动脉支架置入相关收费项目"],
    questions: ["请确认颈动脉支架位置和本院最新收费目录中的标准项目名称。"],
    chargeExplanation: ["文档注明按 TCAR 术式录入；如规则项目无法在官方 Excel 精确匹配，应人工确认或补充收费目录。"],
    nursingPoints: [],
    fluids: [],
    consumables: [
      "纱布 20",
      "注射器 2 个用于冲洗，去钢针头",
      "11 号刀片",
      "23 号刀片",
      "9 号导尿管",
      "无菌记号笔，厂家备",
      "吸引器头",
      "吸引器管",
      "护皮膜",
      "4-0 八根针 VCP1771D",
      "2-0 八根针 VCP1751D",
      "5-0 血管线 1 到 2 根",
      "2-0 针带线 4 根，用于牵拉皮缘代替拉钩",
      "基础包",
      "血管器械",
      "蚊钳 4 把",
      "小拉钩 2 个",
      "乳突牵开器",
      "双极电凝",
      "电刀",
      "单打 2 个",
      "无损伤镊子",
    ],
    medications: [],
    anesthesia: undefined,
    specialNotes: ["价格以官方 Excel 项目库为准，TCAR 组合规则作为院内配合和收费提醒。"],
    priorityWarning: undefined,
    images: [carotidChargeExampleImage],
  },
  {
    id: "intracranial-aneurysm-embolization",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "颅内动脉瘤栓塞术",
    keywords: ["颅内动脉瘤", "动脉瘤栓塞", "弹簧圈", "密网支架", "支架辅助栓塞", "脑动脉瘤", "颅内aneurysm", "aneurysm"],
    chargeItems: ["脑血管造影费", "颅内动脉瘤栓塞费（介入）"],
    questions: ["请确认是否属于单纯弹簧圈、弹簧圈+支架、弹簧圈+密网支架或单纯密网支架。"],
    chargeExplanation: ["颅内动脉瘤栓塞术包含单纯弹簧圈、弹簧圈+支架/密网支架、单纯密网支架；均按脑血管造影费 + 颅内动脉瘤栓塞费提示，不另列脑血管支架置入费。"],
    nursingPoints: ["右股动脉穿刺后压迫 24 小时。", "蓝色压迫带放床上。", "钳缸摆台。", "准备两个加压输液器，1000ml 盐水。"],
    fluids: [],
    consumables: ["泥鳅短", "导尿包", "无线纱布 2 包", "输液器 3 个", "橙色 Y 阀 1 个，备用 2 个", "20ml 注射器 2 个", "10ml 注射器 2 个", "5ml 注射器 1 个", "1ml 注射器", "三通 3 个", "6F 腿鞘", "Cook 长鞘 90cm", "泥鳅软/硬", "5F MPA1 多功能管", "压力泵", "微森牌导引导管"],
    medications: ["盐水 + 3000 单位肝素 2 瓶", "1000 单位/ml 肝素，扩张前给肝素", "首剂肝素通常 3000 单位，按医嘱执行", "威视派克 2 瓶倒碗里", "碘伏倒弯盘"],
    anesthesia: undefined,
    specialNotes: ["支架辅助弹簧圈、密网支架或单纯密网支架已归入颅内动脉瘤栓塞费，不另收脑血管支架置入费。"],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "carotid-stent-rule",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "颈动脉支架相关规则",
    keywords: ["颈动脉支架", "颈内动脉支架", "颈外段支架", "颅内段支架", "锁骨下动脉支架", "颈动脉狭窄", "脑保护伞", "保护伞下支架"],
    chargeItems: ["脑血管造影费"],
    questions: ["请确认支架位置：颅内段或颅外段。", "请确认治疗血管数量。"],
    chargeExplanation: ["颈动脉颅内段和颅外段支架主项目均按脑血管支架置入费（介入）提示；颅内段追加脑血管支架置入费（介入）-颅内血管（加收），颅外段不追加颅内加收。"],
    nursingPoints: [],
    fluids: [],
    consumables: [],
    medications: [],
    anesthesia: undefined,
    specialNotes: ["锁骨下动脉支架不按脑血管支架置入费提示，治疗费使用经皮动脉支架置入术并需人工确认官方目录。"],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "cerebral-angiography",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "脑血管造影",
    keywords: ["脑血管造影", "全脑血管造影", "全脑动脉造影", "DSA脑血管造影", "DSA 脑血管造影", "脑造影", "脑动脉造影"],
    chargeItems: ["脑血管造影费"],
    questions: ["请填写造影血管数量，脑血管造影按血管数量/次数影响收费。"],
    chargeExplanation: ["脑血管造影按 3 根及以下为基础，超过后按计价说明加收并受封顶金额限制。"],
    nursingPoints: ["白色挡板做手时使用，同冠脉。", "造影不给肝素。"],
    fluids: [],
    consumables: ["20ml 注射器 2 个", "10ml 注射器 2 个", "5ml 注射器 1 个", "外周泥鳅", "纱布", "三通 2 个", "Y 阀 1 个", "输液器 1 个", "120cm 延长管", "高压造影注射器", "500ml 盐水加压输液器", "桡动脉路径：Simmons2 + 5F 桡鞘", "股动脉路径：5F 腿鞘 + 4F 椎动脉管"],
    medications: ["500ml 盐水 + 3000 单位肝素用于加压输液器"],
    anesthesia: undefined,
    specialNotes: [],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "carotid-stent-protection",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "脑保护伞下颈动脉支架置入术",
    keywords: ["脑保护伞", "保护伞", "保护伞下颈动脉支架", "颈动脉保护伞", "颈动脉支架"],
    chargeItems: ["脑血管造影费", "颈动脉支架置入相关收费项目"],
    questions: ["请确认支架位置：颅内段或颅外段。", "请确认治疗血管数量。"],
    chargeExplanation: ["保护伞属于术式配合信息；颅内段和颅外段支架主项目均按脑血管支架置入费（介入）提示，颅内段另加颅内血管加收。"],
    nursingPoints: [],
    fluids: [],
    consumables: ["注射器 5 个", "三通 3 个", "泥鳅", "纱布 2 包", "6F 腿鞘", "刀片", "蚊钳"],
    medications: [],
    anesthesia: undefined,
    specialNotes: [],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "emergency-thrombectomy",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "急诊取栓",
    keywords: ["急诊取栓", "脑取栓", "颅内取栓", "血栓抽吸", "血栓清除", "脑血管取栓", "通桥取栓", "脑梗取栓", "机械取栓", "脑血管腔内减容"],
    chargeItems: ["脑血管造影费", "脑血管腔内减容费（介入）"],
    questions: ["请确认治疗血管数量。", "请确认取栓是否为血栓抽吸/机械取栓/腔内减容操作。"],
    chargeExplanation: ["取栓、机械取栓、抽吸取栓、吸栓、清栓等在脑血管语境下按脑血管腔内减容费（介入）提示。"],
    nursingPoints: ["固定患者，尤其是局麻患者。"],
    fluids: [],
    consumables: ["50ml 注射器 2 个", "20ml 注射器 5 个", "10ml 注射器 4 个", "5ml 注射器 1 个", "三通 5 个", "Y 阀 2 个", "120cm 连接管 2 个", "尿不湿 1 个"],
    medications: [],
    anesthesia: undefined,
    specialNotes: [],
    priorityWarning: "固定患者，尤其是局麻患者。",
    images: [],
  },
  {
    id: "trigeminal-nerve-balloon-compression",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "经皮穿刺三叉神经微球囊压迫扩张术",
    keywords: ["经皮穿刺三叉神经微球囊压迫扩张术", "三叉神经微球囊压迫", "三叉神经球囊压迫", "三叉神经压迫", "三叉神经扩张", "三叉神经痛球囊压迫", "三叉神经痛介入", "三叉神经痛", "微球囊压迫", "球囊压迫三叉神经", "颅神经松解费"],
    chargeItems: ["颅神经松解费"],
    questions: [],
    chargeExplanation: ["该术式临床名称为“经皮穿刺三叉神经微球囊压迫扩张术”，收费项目按最新名称映射为“颅神经松解费”。价格以 Excel 官方收费表为准。"],
    nursingPoints: ["手术时间很短。", "给医生准备脚踏凳。", "压迫时患者心率、血压可能会暴增，需要重点观察生命体征变化。"],
    fluids: ["500ml 盐水", "50ml 造影剂"],
    consumables: ["注射器 3 个", "1ml 注射器 1 个", "神外自带 1 包 4 件器械"],
    medications: [],
    anesthesia: "全麻",
    specialNotes: ["压迫时心率、血压可能会暴增，注意严密观察。", "该术式麻醉方式为全麻。"],
    priorityWarning: undefined,
    images: [],
  },
  {
    id: "ccf-embolization-carotid-balloon",
    category: "外周血管",
    subCategory: "神经组",
    procedureName: "海绵窦动静脉瘘 + 颈动脉球扩",
    keywords: [
      "海绵窦动静脉瘘",
      "海绵窦瘘",
      "颈动脉海绵窦瘘",
      "颈内动脉海绵窦瘘",
      "CCF",
      "CCF栓塞",
      "CCF球扩",
      "海绵窦动静脉瘘栓塞",
      "海绵窦瘘栓塞",
      "颈动脉海绵窦瘘栓塞",
      "海绵窦动静脉瘘球扩",
      "海绵窦瘘+球扩",
      "海绵窦瘘+颈动脉球扩",
      "海绵窦动静脉瘘+颈动脉球扩",
      "颈动脉球扩",
      "颈内动脉球扩",
      "颈动脉球囊扩张",
      "颈内动脉球囊扩张",
    ],
    chargeItems: ["脑循环造影费", "脑血管栓塞费（介入）", "脑血管球囊扩张费（介入）"],
    questions: ["请确认本次动静脉瘘栓塞涉及哪些位置：仅动脉、仅静脉、动脉+静脉，或手动填写数量。"],
    chargeExplanation: ["脑循环造影费按脑血管造影费/脑血管造影相关项目别名处理，主界面显示官方 Excel 标准项目名称。脑血管球囊扩张费默认按 1 处/1 血管提示，不区分动脉或静脉。脑血管栓塞费需按动脉端、静脉端等实际栓塞位置确认数量。"],
    nursingPoints: [],
    fluids: [],
    consumables: [],
    medications: [],
    anesthesia: undefined,
    specialNotes: [],
    priorityWarning: undefined,
    images: [],
  },
];

function compact(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function isNeuroGroupListQuery(input: string) {
  const value = compact(input);
  return value === "神经组" || value === "神经介入" || value === "外周血管神经组";
}

export function findNeuroGroupProcedure(input: string) {
  const value = compact(input);
  if (!value || isNeuroGroupListQuery(input)) return undefined;
  if (/tcar|经颈动脉血运重建|颈动脉血运重建|颈动脉转流/i.test(input)) {
    return neuroGroupProcedures.find((procedure) => procedure.id === "tcar");
  }
  if (/脑保护伞|保护伞/.test(input)) {
    return neuroGroupProcedures.find((procedure) => procedure.id === "carotid-stent-protection");
  }
  if (/脑血管畸形栓塞|颅内动脉畸形栓塞|脑动静脉畸形|AVM|avm|血管畸形栓塞/.test(input)) {
    return neuroGroupProcedures.find((procedure) => procedure.id === "brain-avm-embolization");
  }
  if (/颈动脉支架|颈内动脉支架|颈外段支架|颅内段支架|锁骨下动脉支架|颈动脉狭窄/.test(input)) {
    return neuroGroupProcedures.find((procedure) => procedure.id === "carotid-stent-rule");
  }
  if (/海绵窦动静脉瘘|海绵窦瘘|颈动脉海绵窦瘘|颈内动脉海绵窦瘘|CCF|ccf|颈动脉球扩|颈内动脉球扩|颈动脉球囊扩张|颈内动脉球囊扩张/.test(input)) {
    return neuroGroupProcedures.find((procedure) => procedure.id === "ccf-embolization-carotid-balloon");
  }
  const matches = neuroGroupProcedures.filter((procedure) => {
    const clinicalNames = [procedure.procedureName, ...procedure.keywords].map(compact);
    const chargeNames = procedure.chargeItems.map(compact);
    return clinicalNames.some((name) => value.includes(name) || name.includes(value)) || chargeNames.some((name) => value === name);
  });
  return matches.sort((a, b) => compact(b.procedureName).length - compact(a.procedureName).length)[0];
}

export function shouldUseNeuroGroupProcedure(procedure: NeuroGroupProcedure, input: string) {
  if (procedure.id === "emergency-thrombectomy") {
    return /急诊取栓|脑梗取栓|通桥取栓/.test(input);
  }
  if (procedure.id === "intracranial-aneurysm-embolization") {
    return /颅内动脉瘤|动脉瘤栓塞|弹簧圈|密网支架/.test(input);
  }
  return true;
}
