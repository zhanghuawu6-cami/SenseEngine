import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/SectionHeading";
import { SubpageHero } from "@/components/SubpageHero";

export const metadata: Metadata = {
  title: "技术",
  description: "了解序感科技 State Runtime、状态模型、长期记忆、行动策略和可信治理架构。",
};

const runtimeLayers = [
  ["01", "Signal Adapters", "信号适配", "连接设备、行为、日历、环境与可选穿戴信号，记录来源、质量、缺失与授权。"],
  ["02", "State Model", "状态估计", "输出状态分布、置信度、个体基线偏差和可解释的主要证据。"],
  ["03", "State Memory", "长期记忆", "管理情节、语义、程序与关系记忆，支持纠正、衰减、同步和删除。"],
  ["04", "State Policy", "行动策略", "根据目标、风险与接受概率选择行动、询问、延迟或保持安静。"],
  ["05", "Evaluation & Governance", "评测治理", "记录模型版本、数据来源、干预结果、撤回、异常、回滚与审计。"],
];

const dimensions = [
  ["认知负荷", "低 / 适中 / 高", "专注、减少打扰、建议切换", "不评价智商或工作能力"],
  ["疲劳 / 能量", "低能量 / 高能量", "休息、降低刺激、延迟任务", "不诊断疾病或睡眠障碍"],
  ["唤醒度", "平静 / 激活", "呼吸、声音、灯光或保持安静", "不诊断焦虑症"],
  ["情绪效价", "负向 / 正向", "询问、陪伴或不行动", "不推断人格或精神疾病"],
  ["社交可用性", "独处 / 连接", "减少打扰或建议联系", "不判断关系质量或社会价值"],
];

const dimensionLabels = ["状态维度", "范围", "允许行动", "禁止推断"];

export default function TechnologyPage() {
  return (
    <main>
      <SubpageHero
        eyebrow="TECHNOLOGY / STATE RUNTIME"
        title={<>不是一次情绪识别，<br />而是一套可治理的状态闭环。</>}
        description="State Runtime 把终端已有信号转化为带置信度的状态估计，与长期记忆结合，选择克制行动，并从结果中持续学习。"
        meta={["端侧优先", "个体基线", "结果学习", "全程审计"]}
      />

      <section className="runtime section" id="runtime">
        <div className="shell">
          <SectionHeading index="01" eyebrow="FIVE CAPABILITIES" title="五层能力，一条数据与责任链。" description="每一层都明确输入、输出、授权、版本和失败时的降级行为。" />
          <div className="runtime-layers">
            {runtimeLayers.map(([code, english, chinese, summary]) => (
              <div className="runtime-layer" key={code}>
                <span>{code}</span><h3>{english}<small>{chinese}</small></h3><p>{summary}</p><i />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ontology section section--dark" id="ontology">
        <div className="shell">
          <SectionHeading index="02" eyebrow="STATE ONTOLOGY v0.2" title={<>只定义可解释、<br />可反馈、可行动的状态。</>} description="首版刻意缩小范围。活动类别与心理状态分离，低置信度判断允许保留为未知。" inverse />
          <div className="ontology-table" role="table" aria-label="首版状态维度与边界">
            <div className="ontology-row ontology-row--head" role="row">
              {dimensionLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
            {dimensions.map((dimension) => (
              <div className="ontology-row" role="row" key={dimension[0]}>
                {dimension.map((cell, index) => <span key={cell} data-label={dimensionLabels[index]}>{cell}</span>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="memory section section--tint" id="memory">
        <div className="shell">
          <SectionHeading index="03" eyebrow="STATE MEMORY" title={<>记住变化，<br />而不是制造画像。</>} description="记忆服务于用户长期连续性，同时保留来源、纠正、衰减和删除。" />
          <div className="memory-grid">
            <div><span>EPISODIC</span><h3>情节记忆</h3><p>记录具体状态事件、环境、采取的行动与用户反馈，随时间自然衰减。</p></div>
            <div><span>SEMANTIC</span><h3>语义记忆</h3><p>抽象用户在特定状态下的偏好，重复验证提高可信度。</p></div>
            <div><span>PROCEDURAL</span><h3>程序记忆</h3><p>学习作息与任务切换规律，帮助系统在更合适的时间响应。</p></div>
            <div><span>RELATIONSHIP</span><h3>关系记忆</h3><p>仅保留用户明确选择的重要时刻，永久记忆需要更高授权。</p></div>
          </div>
        </div>
      </section>

      <section className="data-boundary section">
        <div className="shell">
          <SectionHeading index="04" eyebrow="DATA BOUNDARY" title="原始信号尽量不离端，抽象状态按需流动。" description="跨端连续性不要求复制原始敏感数据。每一类处理都有默认位置、云端条件和用户控制。" />
          <div className="boundary-flow">
            <div><span>ON DEVICE</span><h3>原始音频 / 行为特征</h3><p>内存或端侧临时处理，生产默认不持久化原始音频。</p></div>
            <i><ArrowRight size={20} /></i>
            <div><span>STATE LAYER</span><h3>状态估计 / 个体记忆</h3><p>端侧优先；跨端同步与复杂推理需明确授权并加密。</p></div>
            <i><ArrowRight size={20} /></i>
            <div><span>USER CONTROL</span><h3>查看 / 纠正 / 撤销</h3><p>用户可按信号类别关闭，按记忆逐条删除或全部重置。</p></div>
          </div>
          <div className="page-link-row"><Link href="/contact">讨论技术接入 <ArrowRight size={17} /></Link><Link href="/insights/state-memory-across-terminals">阅读跨端记忆说明 <ArrowRight size={17} /></Link></div>
        </div>
      </section>
    </main>
  );
}
