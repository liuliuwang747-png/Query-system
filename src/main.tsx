import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ChevronRight,
  Clipboard,
  Database,
  FileUp,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import type { BillingItem, ChoicePrompt, ProcedureProfile, QuantityType, Recommendation } from "./types";
import {
  adminLoadLogs,
  adminLogin,
  adminPublish,
  adminUploadExcel,
  type ApiRule,
  type ApiVersion,
  loadRuntimeData,
} from "./api";
import {
  mergeLatestStandardItems,
  runProcedureCombinationSkill as analyzeProcedure,
} from "./procedureCombinationSkill";
import { inferQuantityMeta, labelForQuantityType, suffixForQuantityType } from "./quantityConfirmationRules";
import { mainComboMeta, priceText, quantityMultiplierText } from "./resultComposer";
import {
  findNeuroGroupProcedure,
  isNeuroGroupListQuery,
  neuroGroupProcedures,
  shouldUseNeuroGroupProcedure,
  type NeuroGroupProcedure,
} from "./data/neuroGroup";
import "./styles.css";

type Tab = "procedure" | "campus";
type ProcedureRoute =
  | "root"
  | "cardio"
  | "peripheral"
  | "other"
  | "coronary"
  | "electrophysiology"
  | "pacemaker"
  | "congenital"
  | "hypertension"
  | "neuro"
  | "tumor"
  | "lower-limb";
type CampusRoute = "root" | "changchun" | "lianhe" | "jinpu";

function comboHint(rec: Recommendation) {
  if (rec.item.newName.includes("临时起搏器安装费")) {
    return "若为单纯临时起搏器安装，取出费待实际取出后另收；若为其他手术中临时放置并术毕当场取出，可同时提示取出费。";
  }
  return "";
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text);
}

function Tag({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "amber" | "red" | "green" | "gray" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

function ItemCard({ rec }: { rec: Recommendation }) {
  const subtotal = typeof rec.item.price === "number" ? rec.item.price * rec.quantity : null;
  return (
    <article className="result-card">
      {rec.reviews.length > 0 && <div className="warning-strip">需要人工确认：{rec.reviews[0]}</div>}
      <div className="card-head">
        <div>
          <h3>{rec.item.newName}</h3>
          <p className="code">{rec.item.newCode}</p>
        </div>
        <Tag tone={rec.item.itemType === "add_on" ? "green" : rec.item.itemType === "extension" ? "amber" : "blue"}>
          {rec.item.itemType === "main" ? "主项目" : rec.item.itemType === "add_on" ? "加收" : rec.item.itemType === "extension" ? "扩展" : "减收"}
        </Tag>
      </div>
      <div className="metric-grid">
        <div>
          <span>计价单位</span>
          <strong>{rec.item.unit || "待确认"}</strong>
        </div>
        <div>
          <span>建议数量</span>
          <strong>{Number(rec.quantity.toFixed(2))}</strong>
        </div>
        <div>
          <span>最高限价</span>
          <strong>{priceText(rec.item.price)}</strong>
        </div>
        <div>
          <span>计算小计</span>
          <strong>{priceText(subtotal)}</strong>
        </div>
      </div>
      <section className="detail-block">
        <b>三层匹配</b>
        <p>
          临床说法：{rec.clinicalTerm || rec.actionName || "未记录"} → 实际手术动作：{rec.actualAction || rec.actionName || "待确认"} → 收费项目：
          {rec.item.newName}
        </p>
      </section>
      <section className="detail-block">
        <b>匹配理由</b>
        <p>{rec.reason}</p>
      </section>
      {rec.addons.length > 0 && (
        <section className="detail-block">
          <b>可加收项目</b>
          <p>{rec.addons.join("；")}</p>
        </section>
      )}
      {rec.exclusions.length > 0 && (
        <section className="detail-block">
          <b>不可重复收费</b>
          <p>{rec.exclusions.join("；")}</p>
        </section>
      )}
      {rec.recordAdvice.length > 0 && (
        <section className="detail-block">
          <b>病历记录建议</b>
          <p>{rec.recordAdvice.join("；")}</p>
        </section>
      )}
      {rec.item.itemType === "extension" && (
        <section className="detail-block amber">
          <b>扩展提醒</b>
          <p>通常按主项目执行，不代表独立加价，需按院内医保收费口径确认。</p>
        </section>
      )}
    </article>
  );
}

const workTabs = ["手术费", "术中用药", "处置费 / 监测与辅助", "低值耗材", "高值耗材", "术中配合", "术者偏好"] as const;

function PlaceholderPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="placeholder-panel">
      <strong>{title}</strong>
      {items.length ? <p>{items.join("；")}</p> : <p>该模块后续逐步补充。</p>}
    </div>
  );
}

function AssistFeePanel({ profile, quantityValues }: { profile: ProcedureProfile; quantityValues: Partial<Record<QuantityType, string>> }) {
  return (
    <div className="placeholder-panel">
      <strong>处置费 / 术中辅助处置</strong>
      {profile.monitoringAndAssistFeeItems.length > 0 && (
        <CombinationSummary items={profile.monitoringAndAssistFeeItems} quantityValues={quantityValues} />
      )}
      {profile.monitoringAndAssistItems.length ? <p>{profile.monitoringAndAssistItems.join("；")}</p> : <p>该模块后续逐步补充。</p>}
    </div>
  );
}

function OverviewCard({ profile, result }: { profile: ProcedureProfile; result: ReturnType<typeof analyzeProcedure> }) {
  const hasManual =
    profile.manualReviewItems.length > 0 ||
    result.globalWarnings.some((warning) => warning.includes("人工确认") || warning.includes("确认"));
  const hasExclusion =
    profile.surgeryFeeItems.some((rec) => rec.exclusions.length > 0) ||
    result.globalWarnings.some((warning) => warning.includes("重复"));
  return (
    <section className="overview-card">
      <div className="overview-head">
        <div>
          <span>识别到的术式</span>
          <h2>{profile.procedureName}</h2>
        </div>
        <Tag tone={hasManual ? "amber" : "green"}>{hasManual ? "需确认" : "可初判"}</Tag>
      </div>
      <div className="overview-grid">
        <div>
          <span>所属系统</span>
          <strong>{profile.systemCategory || result.groupName}</strong>
        </div>
        <div>
          <span>收费项目</span>
          <strong>{profile.surgeryFeeItems.length} 项</strong>
        </div>
        <div>
          <span>人工确认</span>
          <strong>{hasManual ? "有" : "无"}</strong>
        </div>
        <div>
          <span>不可重复</span>
          <strong>{hasExclusion ? "有提醒" : "未发现"}</strong>
        </div>
      </div>
    </section>
  );
}

function CombinationSummary({ items, quantityValues }: { items: Recommendation[]; quantityValues: Partial<Record<QuantityType, string>> }) {
  return (
    <section className="combo-summary">
      <div className="combo-title">推荐收费组合</div>
      <div className="combo-chain">
        {items.map((rec, index) => {
          const quantityMeta = inferQuantityMeta(rec.item);
          const showQuantityNote = quantityMeta.needsQuantityConfirmation && !rec.tags.includes("skip_quantity_note");
          const multiplier = quantityMultiplierText(rec.quantity);
          return (
            <React.Fragment key={rec.id}>
              {index > 0 && <span className="combo-plus">+</span>}
              <div className={`combo-item ${showQuantityNote ? "quantity-sensitive" : ""}`}>
                <strong>{rec.item.newName}</strong>
                <span className="combo-meta">
                  <span>{mainComboMeta(rec, quantityValues)}</span>
                  {multiplier && <b className="quantity-multiplier">{multiplier}</b>}
                </span>
                {showQuantityNote && (
                  <div className="combo-quantity-note">
                    <b>需确认：{quantityMeta.label}</b>
                    {quantityMeta.ruleText && <small>{quantityMeta.ruleText}</small>}
                  </div>
                )}
                {comboHint(rec) && <small className="combo-hint">{comboHint(rec)}</small>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
}

function DisputePanel({ warnings, recommendations }: { warnings: string[]; recommendations: Recommendation[] }) {
  const disputes = [...new Set([
    ...warnings,
    ...recommendations.flatMap((rec) => rec.reviews),
    ...recommendations.flatMap((rec) => rec.exclusions),
    ...recommendations.flatMap((rec) => {
      const meta = inferQuantityMeta(rec.item);
      if (!meta.needsQuantityConfirmation) return [];
      return [`${rec.item.newName}：${meta.ruleText || rec.item.billingNote || "需确认实际数量后计费。"}`];
    }),
  ].filter(Boolean))];
  if (!disputes.length) return <div className="notice">暂未发现明确争议项。仍请以医院医保、物价、收费部门审核口径为准。</div>;
  return (
    <section className="dispute-panel">
      <strong>需要确认</strong>
      <ol>
        {disputes.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ol>
    </section>
  );
}

function QuantityQuestion({
  type,
  label,
  suffix,
  value,
  onChange,
}: {
  type: QuantityType;
  label: string;
  suffix: string;
  value: string;
  onChange: (type: QuantityType, value: string) => void;
}) {
  return (
    <label>
      {label}
      <div className="quantity-input-row">
        <input inputMode="numeric" placeholder="可不填" value={value} onChange={(event) => onChange(type, event.target.value)} />
        <span>{suffix}</span>
      </div>
    </label>
  );
}

function QuantityConfirmationPanel({
  recommendations,
  quantityValues,
  onQuantityChange,
}: {
  recommendations: Recommendation[];
  quantityValues: Partial<Record<QuantityType, string>>;
  onQuantityChange: (type: QuantityType, value: string) => void;
}) {
  const quantityTypes = [
    ...new Set(
      recommendations
        .map((rec) => inferQuantityMeta(rec.item).quantityType)
        .filter(Boolean) as QuantityType[],
    ),
  ];

  if (!quantityTypes.length) return null;

  return (
    <section className="vessel-question-card">
      <strong>数量确认</strong>
      <p>可选填写，不影响先显示完整收费组合。填写后会在上方组合中实时更新估算金额。</p>
      {quantityTypes.map((type) => (
        <QuantityQuestion
          key={type}
          type={type}
          label={`${labelForQuantityType(type)}：`}
          suffix={suffixForQuantityType(type)}
          value={quantityValues[type] || ""}
          onChange={onQuantityChange}
        />
      ))}
      <div className="notice amber">未填写时先按基础金额显示；最终金额需根据实际数量、同一血管/同一病变部位和院内收费口径确认。</div>
    </section>
  );
}

function ChoicePromptPanel({ prompts, onUsePrompt }: { prompts?: ChoicePrompt[]; onUsePrompt?: (query: string) => void }) {
  if (!prompts?.length) return null;
  return (
    <section className="choice-prompt-card">
      {prompts.map((prompt) => (
        <div key={prompt.id} className="choice-prompt">
          <strong>{prompt.title}</strong>
          {prompt.description && <p>{prompt.description}</p>}
          {prompt.groups.map((group) => (
            <div className="choice-group" key={group.title}>
              <span>{group.title}</span>
              <div className="choice-buttons">
                {group.options.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => option.query && onUsePrompt?.(option.query)}
                  >
                    <b>{option.label}</b>
                    {option.resultHint && <small>{option.resultHint}</small>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function stripCcfScopeDecision(query: string) {
  return query.replace(/\+?栓塞(?:仅动脉|仅静脉|数量\s*\d+)/g, "");
}

function CcfEmbolizationPanel({
  prompt,
  query,
  onUsePrompt,
}: {
  prompt?: ChoicePrompt;
  query: string;
  onUsePrompt?: (query: string) => void;
}) {
  const [manualCount, setManualCount] = useState("");
  if (!prompt) return null;
  const baseQuery = stripCcfScopeDecision(query);
  return (
    <section className="ccf-scope-panel">
      <strong>{prompt.title}</strong>
      {prompt.description && <p>{prompt.description}</p>}
      <div className="ccf-scope-buttons">
        {prompt.groups.flatMap((group) => group.options).map((option) => (
          <button key={option.label} type="button" onClick={() => option.query && onUsePrompt?.(option.query)}>
            <b>{option.label}</b>
            {option.resultHint && <small>{option.resultHint}</small>}
          </button>
        ))}
      </div>
      <div className="ccf-manual-row">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="其他数量"
          value={manualCount}
          onChange={(event) => setManualCount(event.target.value.replace(/\D/g, ""))}
        />
        <button
          type="button"
          disabled={!manualCount}
          onClick={() => manualCount && onUsePrompt?.(`${baseQuery}+栓塞数量${manualCount}`)}
        >
          手动填写
        </button>
      </div>
    </section>
  );
}

function ResultsPanel({ result, onUsePrompt }: { result: ReturnType<typeof analyzeProcedure> | null; onUsePrompt?: (query: string) => void }) {
  const [activeTab, setActiveTab] = useState<(typeof workTabs)[number]>("手术费");
  const [quantityValues, setQuantityValues] = useState<Partial<Record<QuantityType, string>>>({});
  useEffect(() => {
    setQuantityValues({});
  }, [result?.input]);

  if (!result) return null;
  if (result.unsupportedMessage) {
    return <div className="empty-card">{result.unsupportedMessage}</div>;
  }
  if (!result.recommendations.length) {
    return (
      <div className="results-wrap">
        <ChoicePromptPanel prompts={result.choicePrompts} onUsePrompt={onUsePrompt} />
        {result.globalWarnings.map((warning) => (
          <div className="notice amber" key={warning}>{warning}</div>
        ))}
        {!result.choicePrompts?.length && <div className="empty-card">没有找到明确结果，请换一种描述，或进入特殊术式挂靠。</div>}
      </div>
    );
  }
  const copy = result.recommendations
    .map((rec) => `${rec.item.newName}｜${rec.item.newCode}｜${rec.item.unit}｜${Number(rec.quantity.toFixed(2))}｜${priceText(rec.item.price)}`)
    .join("\n");
  const groups =
    result.systemGroups?.filter((group) => group.recommendations.length) ||
    [{ systemId: result.groupId, systemName: result.groupName, recommendations: result.recommendations }];
  const profile =
    result.procedureProfile || {
      procedureName: result.input,
      systemGroup: "other" as const,
      systemCategory: result.groupName,
      surgeryFeeItems: result.recommendations,
      intraoperativeDrugs: [],
      monitoringAndAssistItems: [],
      monitoringAndAssistFeeItems: [],
      lowValueConsumables: [],
      highValueConsumables: [],
      nursingCooperationPoints: [],
      operatorPreferences: [],
      riskWarnings: result.globalWarnings,
      manualReviewItems: result.recommendations.flatMap((rec) => rec.reviews),
    };
  const ccfPrompt = result.choicePrompts?.find((prompt) => prompt.type === "ccf_embolization_scope");
  const visiblePrompts = result.choicePrompts?.filter((prompt) => prompt.type !== "ccf_embolization_scope");
  return (
    <div className="results-wrap">
      <ChoicePromptPanel prompts={visiblePrompts} onUsePrompt={onUsePrompt} />
      <CombinationSummary items={profile.surgeryFeeItems} quantityValues={quantityValues} />
      <CcfEmbolizationPanel prompt={ccfPrompt} query={result.input} onUsePrompt={onUsePrompt} />
      <QuantityConfirmationPanel
        recommendations={profile.surgeryFeeItems}
        quantityValues={quantityValues}
        onQuantityChange={(type, value) => setQuantityValues((prev) => ({ ...prev, [type]: value }))}
      />
      <div className="work-tabs" role="tablist">
        {workTabs.map((tab) => (
          <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      {activeTab === "手术费" ? (
        <>
          <div className="result-action-bar">
            <button className="pill-button" onClick={() => copyText(copy)}>
              <Clipboard size={16} /> 一键复制手术费清单
            </button>
          </div>
          {groups.map((group) => (
            <section className="system-result" key={group.systemId}>
              <div className="system-heading">
                <Stethoscope size={16} />
                <strong>{group.systemName}</strong>
              </div>
              {group.recommendations.map((rec) => (
                <ItemCard rec={rec} key={rec.id} />
              ))}
            </section>
          ))}
          <DisputePanel warnings={result.globalWarnings} recommendations={profile.surgeryFeeItems} />
          <OverviewCard profile={profile} result={result} />
          {result.parsedFacts.map((fact) => (
            <div className="notice" key={fact}>{fact}</div>
          ))}
        </>
      ) : activeTab === "术中用药" ? (
        <PlaceholderPanel title="术中用药" items={profile.intraoperativeDrugs} />
      ) : activeTab === "处置费 / 监测与辅助" ? (
        <AssistFeePanel profile={profile} quantityValues={quantityValues} />
      ) : activeTab === "低值耗材" ? (
        <PlaceholderPanel title="低值耗材" items={profile.lowValueConsumables} />
      ) : activeTab === "高值耗材" ? (
        <PlaceholderPanel title="高值耗材" items={profile.highValueConsumables} />
      ) : activeTab === "术中配合" ? (
        <PlaceholderPanel title="术中配合" items={profile.nursingCooperationPoints} />
      ) : (
        <PlaceholderPanel title="术者偏好" items={profile.operatorPreferences} />
      )}
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <section className="page-heading">
      {onBack && <button className="back-button" onClick={onBack}>返回</button>}
      <div>
        <span>导管室工作台</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </section>
  );
}

function MinimalSearch({
  value,
  onChange,
  onRun,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: (value?: string) => void;
}) {
  return (
    <div className="center-search">
      <div className="search-box">
        <Search size={20} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onRun()}
          placeholder="请输入术式，例如：房颤、冠脉支架、脑血管支架+取栓"
        />
        <button onClick={() => onRun()}>搜索</button>
      </div>
    </div>
  );
}

function SimpleOptionGrid({
  options,
}: {
  options: Array<{ title: string; desc?: string; onClick: () => void; disabled?: boolean }>;
}) {
  return (
    <div className="simple-option-grid">
      {options.map((option) => (
        <button className="simple-option" key={option.title} onClick={option.onClick} disabled={option.disabled}>
          <div>
            <strong>{option.title}</strong>
            {option.desc && <span>{option.desc}</span>}
          </div>
          <ChevronRight size={18} />
        </button>
      ))}
    </div>
  );
}

function ProcedureLeafPage({
  title,
  subtitle,
  items,
  rules,
  onBack,
}: {
  title: string;
  subtitle?: string;
  items: BillingItem[];
  rules: ApiRule[];
  onBack: () => void;
}) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ReturnType<typeof analyzeProcedure> | null>(null);
  const run = (value = input) => {
    if (!value.trim()) return;
    setResult(analyzeProcedure(value, items, rules));
  };

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} onBack={onBack} />
      <MinimalSearch value={input} onChange={setInput} onRun={run} />
      <ResultsPanel
        result={result}
        onUsePrompt={(value) => {
          setInput(value);
          run(value);
        }}
      />
    </>
  );
}

type SelectableOption = {
  label: string;
  query: string;
};

type SelectionSection = {
  title: string;
  options: SelectableOption[];
};

type CoronaryVessel = {
  label: string;
  queryPrefix: string;
};

type CoronaryAction = {
  label: string;
  query: (vessel: CoronaryVessel) => string;
};

function ProcedureSelectionPage({
  title,
  subtitle,
  sections,
  items,
  rules,
  onBack,
}: {
  title: string;
  subtitle?: string;
  sections: SelectionSection[];
  items: BillingItem[];
  rules: ApiRule[];
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedQuery = selected.join("+");
  const result = selectedQuery ? analyzeProcedure(selectedQuery, items, rules) : null;
  const toggle = (query: string) => {
    setSelected((prev) => (prev.includes(query) ? prev.filter((item) => item !== query) : [...prev, query]));
  };

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} onBack={onBack} />
      <div className="selection-board">
        {sections.map((section) => (
          <section className="selection-section" key={section.title}>
            <strong>{section.title}</strong>
            <div className="selection-chip-grid">
              {section.options.map((option) => (
                <button
                  className={selected.includes(option.query) ? "active" : ""}
                  key={`${section.title}-${option.label}`}
                  onClick={() => toggle(option.query)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      {selectedQuery && (
        <div className="selected-query">
          <span>已选术式</span>
          <strong>{selectedQuery}</strong>
          <button onClick={() => setSelected([])}>清空</button>
        </div>
      )}
      <ResultsPanel
        result={result}
        onUsePrompt={(value) => {
          setSelected([value]);
        }}
      />
    </>
  );
}

function NeuroProcedureList({ onSelect }: { onSelect: (procedure: NeuroGroupProcedure) => void }) {
  return (
    <div className="neuro-procedure-list">
      {neuroGroupProcedures.map((procedure) => (
        <button className="simple-option" key={procedure.id} onClick={() => onSelect(procedure)}>
          <span>
            <strong>{procedure.procedureName}</strong>
            <span>{procedure.chargeItems.join(" + ")}</span>
          </span>
          <ChevronRight size={18} />
        </button>
      ))}
    </div>
  );
}

function SupportSection({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="support-section">
      <strong>{title}</strong>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function ImagePreview({
  images,
}: {
  images: NeuroGroupProcedure["images"];
}) {
  const [activeImage, setActiveImage] = useState<NeuroGroupProcedure["images"][number] | null>(null);
  if (!images.length) return null;
  return (
    <section className="support-section">
      <strong>图片资料</strong>
      <div className="image-preview-grid">
        {images.map((image) => (
          <button className="image-preview-button" key={image.src} onClick={() => setActiveImage(image)} type="button">
            <img src={image.src} alt={image.title} loading="lazy" />
            <span>{image.title}</span>
            {image.description && <small>{image.description}</small>}
          </button>
        ))}
      </div>
      {activeImage && (
        <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setActiveImage(null)}>
          <button className="lightbox-close" type="button" onClick={() => setActiveImage(null)}>关闭</button>
          <img src={activeImage.src} alt={activeImage.title} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </section>
  );
}

function NeuroSupportPanel({ procedure }: { procedure: NeuroGroupProcedure }) {
  return (
    <section className="support-panel">
      <div className="combo-title">手术配合资料</div>
      <SupportSection title="手术配合要点" items={procedure.nursingPoints} />
      <SupportSection title="液体准备" items={procedure.fluids} />
      <SupportSection title="耗材准备" items={procedure.consumables} />
      <SupportSection title="药品准备" items={procedure.medications} />
      <SupportSection title="麻醉方式" items={procedure.anesthesia ? [procedure.anesthesia] : []} />
      <SupportSection title="特殊提醒" items={procedure.specialNotes} />
      <ImagePreview images={procedure.images} />
      <SupportSection title="术式收费说明" items={procedure.chargeExplanation} />
    </section>
  );
}

function NeuroSupplementPanel({
  result,
  quantityValues,
  onQuantityChange,
  onUsePrompt,
}: {
  result: ReturnType<typeof analyzeProcedure>;
  quantityValues: Partial<Record<QuantityType, string>>;
  onQuantityChange: (type: QuantityType, value: string) => void;
  onUsePrompt: (query: string) => void;
}) {
  const hasQuantity = result.recommendations.some((rec) => inferQuantityMeta(rec.item).needsQuantityConfirmation);
  const nonBlockingPrompts = result.choicePrompts?.filter((prompt) => !["carotid_stent_location", "ccf_embolization_scope"].includes(prompt.type)) || [];
  const hasPrompt = nonBlockingPrompts.length > 0;
  const hasWarnings =
    result.globalWarnings.length > 0 ||
    result.recommendations.some((rec) => rec.reviews.length || rec.exclusions.length);
  if (!hasQuantity && !hasPrompt && !hasWarnings) return null;
  return (
    <section className="neuro-supplement">
      <div className="combo-title">补充确认</div>
      <ChoicePromptPanel prompts={nonBlockingPrompts} onUsePrompt={onUsePrompt} />
      <QuantityConfirmationPanel
        recommendations={result.recommendations}
        quantityValues={quantityValues}
        onQuantityChange={onQuantityChange}
      />
      {hasWarnings && <DisputePanel warnings={result.globalWarnings} recommendations={result.recommendations} />}
    </section>
  );
}

function NeuroProcedureDetail({
  procedure,
  items,
  rules,
  showTitle = true,
}: {
  procedure: NeuroGroupProcedure;
  items: BillingItem[];
  rules: ApiRule[];
  showTitle?: boolean;
}) {
  const [query, setQuery] = useState(procedure.procedureName);
  const [quantityValues, setQuantityValues] = useState<Partial<Record<QuantityType, string>>>({});
  useEffect(() => {
    setQuery(procedure.procedureName);
    setQuantityValues({});
  }, [procedure.id, procedure.procedureName]);
  const result = analyzeProcedure(query, items, rules);
  const blockingPrompts = result.choicePrompts?.filter((prompt) => prompt.type === "carotid_stent_location") || [];
  const ccfPrompt = result.choicePrompts?.find((prompt) => prompt.type === "ccf_embolization_scope");
  const needsUpfrontChoice = blockingPrompts.length > 0;
  return (
    <>
      {showTitle && <h2 className="neuro-detail-heading">{procedure.procedureName}</h2>}
      {procedure.priorityWarning && <div className="priority-warning">{procedure.priorityWarning}</div>}
      {needsUpfrontChoice && (
        <section className="upfront-confirm">
          <ChoicePromptPanel
            prompts={blockingPrompts}
            onUsePrompt={(value) => {
              setQuery(value);
              setQuantityValues({});
            }}
          />
        </section>
      )}
      {needsUpfrontChoice ? null : (
        <>
          <CombinationSummary items={result.recommendations} quantityValues={quantityValues} />
          <CcfEmbolizationPanel
            prompt={ccfPrompt}
            query={query}
            onUsePrompt={(value) => {
              setQuery(value);
              setQuantityValues({});
            }}
          />
          <NeuroSupportPanel procedure={procedure} />
          <NeuroSupplementPanel
            result={result}
            quantityValues={quantityValues}
            onQuantityChange={(type, value) => setQuantityValues((prev) => ({ ...prev, [type]: value }))}
            onUsePrompt={(value) => {
              setQuery(value);
              setQuantityValues({});
            }}
          />
        </>
      )}
    </>
  );
}

function NeuroGroupPage({ items, rules, onBack }: { items: BillingItem[]; rules: ApiRule[]; onBack: () => void }) {
  const [activeProcedure, setActiveProcedure] = useState<NeuroGroupProcedure | null>(null);
  return (
    <>
      <PageHeader
        title={activeProcedure ? activeProcedure.procedureName : "神经组"}
        subtitle={
          activeProcedure
            ? activeProcedure.id === "carotid-stent-rule" || activeProcedure.id === "carotid-stent-protection"
              ? "先确认支架位置，再显示最终收费组合"
              : "收费组合先看结果，配合资料在下方"
            : "外周血管 / 神经组"
        }
        onBack={activeProcedure ? () => setActiveProcedure(null) : onBack}
      />
      {activeProcedure ? (
        <NeuroProcedureDetail procedure={activeProcedure} items={items} rules={rules} showTitle={false} />
      ) : (
        <NeuroProcedureList onSelect={setActiveProcedure} />
      )}
    </>
  );
}

const coronaryVessels: CoronaryVessel[] = [
  { label: "左主干", queryPrefix: "左主干" },
  { label: "前降支", queryPrefix: "前降支" },
  { label: "回旋支", queryPrefix: "回旋支" },
  { label: "右冠", queryPrefix: "右冠" },
  { label: "桥血管", queryPrefix: "桥血管" },
];

const coronaryVesselActions: CoronaryAction[] = [
  { label: "球囊扩张", query: (vessel) => `${vessel.queryPrefix}冠脉球囊` },
  { label: "支架置入", query: (vessel) => `${vessel.queryPrefix}冠脉支架` },
  { label: "FFR / iFR / QFR", query: (vessel) => `${vessel.queryPrefix}冠脉FFR` },
  { label: "旋磨 / ROTA / IVL / 腔内减容", query: (vessel) => `${vessel.queryPrefix}冠脉旋磨` },
  { label: "血栓抽吸 / 取栓", query: (vessel) => `${vessel.queryPrefix}冠脉取栓` },
  { label: "冠脉溶栓", query: (vessel) => `${vessel.queryPrefix}冠脉溶栓` },
];

const coronaryIndependentAddons: SelectableOption[] = [
  { label: "CTO逆向开通", query: "冠脉CTO逆向开通" },
  { label: "IABP", query: "IABP" },
  { label: "TPM/临时起搏器", query: "临时起搏器" },
  { label: "桥血管造影", query: "冠脉桥血管造影" },
  { label: "左心室造影", query: "左室造影" },
  { label: "IVUS / OCT", query: "冠脉IVUS" },
];

const neuroSections: SelectionSection[] = [
  {
    title: "神经组术式",
    options: [
      { label: "脑血管造影", query: "脑血管造影" },
      { label: "脊髓血管造影", query: "脊髓血管造影" },
      { label: "脑血管球囊扩张", query: "脑血管球囊" },
      { label: "脑血管支架置入", query: "脑血管支架" },
      { label: "脑血管腔内减容 / 取栓 / 血栓抽吸", query: "脑血管取栓" },
      { label: "脑血管腔内溶栓", query: "脑血管溶栓" },
      { label: "脑血管栓塞", query: "脑血管栓塞" },
      { label: "颅内动脉瘤栓塞", query: "颅内动脉瘤栓塞" },
      { label: "慢性闭塞脑血管逆向再通", query: "慢性闭塞脑血管逆向再通" },
      { label: "周围神经电极置入", query: "周围神经电极置入" },
      { label: "颅神经松解", query: "颅神经松解" },
    ],
  },
];

function CoronaryMultivesselPage({
  items,
  rules,
  onBack,
}: {
  items: BillingItem[];
  rules: ApiRule[];
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const selectedQuery = selected.length ? ["冠脉造影", ...selected].join("+") : "";
  const result = selectedQuery ? analyzeProcedure(selectedQuery, items, rules) : null;
  const toggle = (query: string) => {
    setSelected((prev) => (prev.includes(query) ? prev.filter((item) => item !== query) : [...prev, query]));
  };

  return (
    <>
      <PageHeader
        title="冠心病"
        subtitle="冠心病术式默认包含冠脉造影；每根治疗血管单独选择操作，IVUS/OCT 和 CTO/IABP/TPM 等作为独立附加项目"
        onBack={onBack}
      />
      <div className="coronary-board">
        <section className="selection-section">
          <strong>治疗血管</strong>
          <div className="coronary-vessel-list">
            {coronaryVessels.map((vessel) => (
              <article className="coronary-vessel-card" key={vessel.label}>
                <div className="vessel-card-title">
                  <strong>{vessel.label}</strong>
                  <span>血管操作</span>
                </div>
                <div className="selection-chip-grid">
                  {coronaryVesselActions.map((action) => {
                    const query = action.query(vessel);
                    return (
                      <button
                        className={selected.includes(query) ? "active" : ""}
                        key={`${vessel.label}-${action.label}`}
                        onClick={() => toggle(query)}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="selection-section">
          <strong>独立附加项目</strong>
          <div className="selection-chip-grid">
            {coronaryIndependentAddons.map((option) => (
              <button
                className={selected.includes(option.query) ? "active" : ""}
                key={option.label}
                onClick={() => toggle(option.query)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      </div>
      {selectedQuery && (
        <div className="selected-query">
          <span>已选术式</span>
          <strong>{selectedQuery}</strong>
          <button onClick={() => setSelected([])}>清空</button>
        </div>
      )}
      <ResultsPanel
        result={result}
        onUsePrompt={(value) => {
          setSelected([value]);
        }}
      />
    </>
  );
}

const electrophysiologySections: SelectionSection[] = [
  {
    title: "复杂心律失常",
    options: [
      { label: "房颤", query: "房颤" },
      { label: "II型房扑", query: "II型房扑射频消融" },
      { label: "器质性心脏病室速", query: "器质性室速射频消融" },
    ],
  },
  {
    title: "常规心律失常",
    options: [
      { label: "室上速", query: "室上速射频消融" },
      { label: "预激综合征", query: "预激综合征消融" },
      { label: "I型房扑", query: "I型房扑射频消融" },
      { label: "房早", query: "房早射频消融" },
      { label: "室早", query: "室早射频消融" },
      { label: "房速", query: "房速射频消融" },
      { label: "非器质性室速", query: "非器质性室速射频消融" },
    ],
  },
  {
    title: "辅助项目",
    options: [
      { label: "三维标测", query: "三维标测" },
      { label: "ICE / 心腔内超声", query: "ICE" },
      { label: "左心耳封堵", query: "左心耳封堵" },
      { label: "房间隔穿刺 / 房间隔分流术", query: "房间隔穿刺" },
    ],
  },
];

const pacemakerSections: SelectionSection[] = [
  {
    title: "起搏器术式",
    options: [
      { label: "临时起搏器安装", query: "单纯临时起搏器安装" },
      { label: "临时起搏器运行监测", query: "临时起搏器运行监测" },
      { label: "临时起搏器取出", query: "临时起搏器取出" },
      { label: "永久起搏器植入", query: "永久起搏器植入" },
      { label: "单腔起搏器", query: "单腔起搏器" },
      { label: "双腔起搏器", query: "双腔起搏器" },
      { label: "三腔起搏器", query: "三腔起搏器" },
      { label: "ICD", query: "ICD" },
      { label: "起搏器更换", query: "起搏器更换" },
      { label: "起搏器升级", query: "起搏器升级" },
      { label: "电极调整术", query: "电极调整术" },
      { label: "囊袋清创", query: "囊袋清创" },
    ],
  },
];

const congenitalSections: SelectionSection[] = [
  {
    title: "先心病 / 结构性心脏病",
    options: [
      { label: "右心导管检查", query: "右心导管检查" },
      { label: "房缺封堵", query: "房缺封堵" },
      { label: "室缺封堵", query: "室缺封堵" },
      { label: "PFO封堵", query: "PFO封堵" },
      { label: "动脉导管未闭封堵", query: "动脉导管未闭封堵" },
      { label: "左心耳封堵", query: "单纯左心耳封堵" },
      { label: "结构性心脏病复杂封堵", query: "结构性心脏病复杂封堵" },
      { label: "TAVR", query: "TAVR+TPM" },
      { label: "TEER", query: "TEER" },
    ],
  },
];

const hypertensionSections: SelectionSection[] = [
  {
    title: "高血压相关",
    options: [
      { label: "肾上腺静脉采血", query: "肾上腺静脉采血" },
      { label: "肾动脉去神经", query: "肾动脉去神经" },
    ],
  },
];

function ProcedureSearchPage({ items, rules }: { items: BillingItem[]; rules: ApiRule[] }) {
  const [route, setRoute] = useState<ProcedureRoute>("root");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ReturnType<typeof analyzeProcedure> | null>(null);
  const [showNeuroList, setShowNeuroList] = useState(false);
  const [activeNeuroProcedure, setActiveNeuroProcedure] = useState<NeuroGroupProcedure | null>(null);
  const run = (value = input) => {
    if (!value.trim()) return;
    setShowNeuroList(false);
    setActiveNeuroProcedure(null);
    const neuroProcedure = findNeuroGroupProcedure(value);
    if (isNeuroGroupListQuery(value)) {
      setResult(null);
      setShowNeuroList(true);
      return;
    }
    if (neuroProcedure && shouldUseNeuroGroupProcedure(neuroProcedure, value)) {
      setResult(null);
      setActiveNeuroProcedure(neuroProcedure);
      return;
    }
    setResult(analyzeProcedure(value, items, rules));
  };
  const resetToRoot = () => {
    setRoute("root");
    setResult(null);
    setShowNeuroList(false);
    setActiveNeuroProcedure(null);
  };

  if (route === "cardio") {
    return (
      <>
        <PageHeader title="心血管" onBack={resetToRoot} />
        <SimpleOptionGrid
          options={[
            { title: "冠心病", onClick: () => setRoute("coronary") },
            { title: "电生理", onClick: () => setRoute("electrophysiology") },
            { title: "起搏器", onClick: () => setRoute("pacemaker") },
            { title: "先心病", onClick: () => setRoute("congenital") },
            { title: "高血压", onClick: () => setRoute("hypertension") },
          ]}
        />
      </>
    );
  }

  if (route === "peripheral") {
    return (
      <>
        <PageHeader title="外周血管" onBack={resetToRoot} />
        <SimpleOptionGrid
          options={[
            { title: "神经组", desc: "已导入神经系统和新外周神经介入收费", onClick: () => setRoute("neuro") },
            { title: "肿瘤组", desc: "该模块待补充肿瘤介入收费标准", onClick: () => setRoute("tumor") },
            { title: "下肢组", desc: "该模块待补充下肢/外周血管收费标准", onClick: () => setRoute("lower-limb") },
          ]}
        />
      </>
    );
  }

  if (route === "other") {
    return (
      <>
        <PageHeader title="其他" onBack={resetToRoot} />
        <div className="empty-card">该模块暂未配置，后续用于补充非心血管、非外周血管类导管室项目。</div>
      </>
    );
  }

  if (route === "tumor") {
    return (
      <>
        <PageHeader title="肿瘤组" onBack={() => setRoute("peripheral")} />
        <div className="empty-card">该模块待补充肿瘤介入收费标准。</div>
      </>
    );
  }

  if (route === "lower-limb") {
    return (
      <>
        <PageHeader title="下肢组" onBack={() => setRoute("peripheral")} />
        <div className="empty-card">该模块待补充下肢/外周血管收费标准。</div>
      </>
    );
  }

  const leafMap: Partial<Record<ProcedureRoute, { title: string; subtitle: string; back: ProcedureRoute }>> = {};
  if (route === "coronary") {
    return (
      <CoronaryMultivesselPage
        items={items}
        rules={rules}
        onBack={() => setRoute("cardio")}
      />
    );
  }

  if (route === "electrophysiology") {
    return (
      <ProcedureSelectionPage
        title="电生理"
        subtitle="按病种选择消融类型，房间隔穿刺按实际发生确认"
        sections={electrophysiologySections}
        items={items}
        rules={rules}
        onBack={() => setRoute("cardio")}
      />
    );
  }

  if (route === "pacemaker") {
    return (
      <ProcedureSelectionPage
        title="起搏器"
        subtitle="临时起搏器取出费不在安装当次自动加入；适配费仅限更换或电极调整"
        sections={pacemakerSections}
        items={items}
        rules={rules}
        onBack={() => setRoute("cardio")}
      />
    );
  }

  if (route === "congenital") {
    return (
      <ProcedureSelectionPage
        title="先心病"
        subtitle="结构性心脏病封堵、右心导管、TAVR、TEER 按实际操作组合"
        sections={congenitalSections}
        items={items}
        rules={rules}
        onBack={() => setRoute("cardio")}
      />
    );
  }

  if (route === "hypertension") {
    return (
      <ProcedureSelectionPage
        title="高血压"
        subtitle="项目无法准确匹配时显示人工确认，不做无关挂靠"
        sections={hypertensionSections}
        items={items}
        rules={rules}
        onBack={() => setRoute("cardio")}
      />
    );
  }

  if (route === "neuro") {
    return (
      <NeuroGroupPage
        items={items}
        rules={rules}
        onBack={() => setRoute("peripheral")}
      />
    );
  }

  const leaf = leafMap[route];
  if (leaf) {
    return (
      <ProcedureLeafPage
        title={leaf.title}
        subtitle={leaf.subtitle}
        items={items}
        rules={rules}
        onBack={() => setRoute(leaf.back)}
      />
    );
  }

  return (
    <>
      <PageHeader title="搜索-术式" />
      <MinimalSearch value={input} onChange={setInput} onRun={run} />
      <div className="primary-entry-row">
        <button onClick={() => setRoute("cardio")}>心血管</button>
        <button onClick={() => setRoute("peripheral")}>外周血管</button>
        <button onClick={() => setRoute("other")}>其他</button>
      </div>
      <ResultsPanel
        result={result}
        onUsePrompt={(value) => {
          setInput(value);
          run(value);
        }}
      />
      {showNeuroList && (
        <NeuroProcedureList
          onSelect={(procedure) => {
            setShowNeuroList(false);
            setActiveNeuroProcedure(procedure);
          }}
        />
      )}
      {activeNeuroProcedure && <NeuroProcedureDetail procedure={activeNeuroProcedure} items={items} rules={rules} />}
    </>
  );
}

function CampusTemplate({ title, onBack }: { title: string; onBack: () => void }) {
  const sections = ["该院区开展术式", "院区工作流程", "术中配合要点", "低值耗材准备", "高值耗材注意", "术者偏好"];
  return (
    <>
      <PageHeader title={title} subtitle="收费标准仍按统一规则执行" onBack={onBack} />
      <div className="campus-template">
        {sections.map((section) => (
          <section key={section}>
            <strong>{section}</strong>
            <p>待补充</p>
          </section>
        ))}
      </div>
    </>
  );
}

function CampusSearchPage() {
  const [route, setRoute] = useState<CampusRoute>("root");
  if (route === "changchun") return <CampusTemplate title="长春路院区" onBack={() => setRoute("root")} />;
  if (route === "lianhe") return <CampusTemplate title="联合路院区" onBack={() => setRoute("root")} />;
  if (route === "jinpu") return <CampusTemplate title="金普院区" onBack={() => setRoute("root")} />;

  return (
    <>
      <PageHeader title="搜索-院区" subtitle="查看院区流程、配合要点和工作习惯" />
      <SimpleOptionGrid
        options={[
          { title: "长春路院区", onClick: () => setRoute("changchun") },
          { title: "联合路院区", onClick: () => setRoute("lianhe") },
          { title: "金普院区", onClick: () => setRoute("jinpu") },
        ]}
      />
    </>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  return (
    <nav className="bottom-nav dock-two">
      <button className={tab === "procedure" ? "active" : ""} onClick={() => setTab("procedure")}>
        <Search size={20} />
        <span>搜索-术式</span>
      </button>
      <button className={tab === "campus" ? "active" : ""} onClick={() => setTab("campus")}>
        <Stethoscope size={20} />
        <span>搜索-院区</span>
      </button>
    </nav>
  );
}

function MobileApp() {
  const [tab, setTab] = useState<Tab>("procedure");
  const [items, setItems] = useState<BillingItem[]>([]);
  const [rules, setRules] = useState<ApiRule[]>([]);
  const [version, setVersion] = useState<ApiVersion | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRuntimeData().then((data) => {
      setItems(mergeLatestStandardItems(data.items));
      setRules(data.rules);
      setVersion(data.version);
      setOffline(data.offline);
      setLoading(false);
    });
  }, []);

  return (
    <div className="app-shell">
      <header className="top-status">
        <div>
          <ShieldCheck size={16} />
          <span>{offline ? "当前为离线缓存版本" : "公网同步 · 本地缓存"}</span>
        </div>
        <span>v{version?.version ?? "-"}</span>
      </header>
      <main className="app-main">
        {loading ? (
          <div className="skeleton-card" />
        ) : (
          <>
            {tab === "procedure" && <ProcedureSearchPage items={items} rules={rules} />}
            {tab === "campus" && <CampusSearchPage />}
          </>
        )}
      </main>
      <footer className="version-bar">
        <Database size={14} /> 当前数据版本 v{version?.version ?? "-"} · {version?.publishedAt ? new Date(version.publishedAt).toLocaleString() : "未同步"}
      </footer>
      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

function AdminApp() {
  const [token, setToken] = useState(localStorage.getItem("admin_token") || "");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<unknown[]>([]);

  const login = async () => {
    try {
      const result = await adminLogin(username, password);
      localStorage.setItem("admin_token", result.token);
      setToken(result.token);
      setMessage("登录成功");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    }
  };
  const upload = async () => {
    try {
      const result = await adminUploadExcel(token, files);
      setMessage(`已解析 ${result.draft.itemCount} 条收费项目，旧项目映射 ${result.draft.mappingCount} 条。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    }
  };
  const publish = async () => {
    try {
      const result = await adminPublish(token, note);
      setMessage(`已发布版本 v${result.version.version}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "发布失败");
    }
  };

  useEffect(() => {
    if (token) adminLoadLogs(token).then((data) => setLogs(data.logs));
  }, [token, message]);

  if (!token) {
    return (
      <div className="app-shell admin-shell">
        <main className="app-main">
          <section className="hero-card">
            <div className="hero-title">
              <div>
                <h1>管理员登录</h1>
                <p>上传 Excel、发布收费数据版本</p>
              </div>
              <Lock size={24} />
            </div>
            <input className="admin-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="管理员账号" />
            <input className="admin-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" />
            <button className="primary-button" onClick={login}>登录</button>
            {message && <div className="notice amber">{message}</div>}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell admin-shell">
      <header className="top-status">
        <div><ShieldCheck size={16} /><span>管理员后台</span></div>
        <button onClick={() => { localStorage.removeItem("admin_token"); setToken(""); }}>退出</button>
      </header>
      <main className="app-main">
        <section className="hero-card">
          <div className="hero-title">
            <div>
              <h1>发布收费数据</h1>
              <p>上传新版 Excel，确认后发布给所有手机端</p>
            </div>
            <FileUp size={26} />
          </div>
          <input className="file-input" type="file" multiple accept=".xlsx,.xls" onChange={(event) => setFiles(Array.from(event.target.files || []))} />
          <button className="primary-button" disabled={!files.length} onClick={upload}>上传并解析 Excel</button>
          <textarea className="admin-input textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="发布说明：例如 2026-05-20 调整冠脉和神经介入项目" />
          <button className="primary-button dark" onClick={publish}><RefreshCw size={18} /> 发布新版本</button>
          {message && <div className="notice">{message}</div>}
        </section>
        <section className="section-title">
          <h2>修改日志</h2>
          <span>最近 100 条</span>
        </section>
        {logs.slice(0, 20).map((log, index) => (
          <div className="recent-card" key={index}>{JSON.stringify(log)}</div>
        ))}
      </main>
    </div>
  );
}

function Root() {
  return window.location.pathname.startsWith("/admin") ? <AdminApp /> : <MobileApp />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
