import { Activity, BrainCircuit, CircleCheck, ScanLine, SlidersHorizontal } from "lucide-react";

const stages = [
  { code: "01", english: "SIGNAL", chinese: "信号", detail: "设备 · 行为 · 环境", Icon: Activity },
  { code: "02", english: "ESTIMATE", chinese: "状态估计", detail: "概率 · 置信度", Icon: ScanLine },
  { code: "03", english: "MEMORY", chinese: "长期记忆", detail: "基线 · 偏好 · 节律", Icon: BrainCircuit },
  { code: "04", english: "POLICY", chinese: "行动策略", detail: "行动 · 询问 · 克制", Icon: SlidersHorizontal },
  { code: "05", english: "OUTCOME", chinese: "干预结果", detail: "接受 · 调整 · 改善", Icon: CircleCheck },
];

export function StateLoopDiagram() {
  return (
    <div className="state-loop-diagram" aria-label="状态闭环：信号、状态估计、长期记忆、行动策略和干预结果">
      <svg className="state-loop-diagram__path" viewBox="0 0 1200 360" preserveAspectRatio="none" aria-hidden="true">
        <path className="state-loop-diagram__track" d="M86 135 C270 34 930 34 1114 135 C1018 306 182 306 86 135Z" />
        <path className="state-loop-diagram__signal" d="M86 135 C270 34 930 34 1114 135 C1018 306 182 306 86 135Z" />
      </svg>
      <div className="state-loop-diagram__nodes">
        {stages.map(({ code, english, chinese, detail, Icon }) => (
          <div className="state-loop-node group" key={english}>
            <div className="flex items-start justify-between">
              <span className="state-loop-node__code">{code}</span>
              <Icon className="state-loop-node__icon" size={20} strokeWidth={1.35} />
            </div>
            <div className="mt-auto">
              <span className="state-loop-node__english">{english}</span>
              <h3>{chinese}</h3>
              <p>{detail}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="state-loop-diagram__feedback">
        <span>FEEDBACK / 结果反馈</span>
        <p>结果回哺个体模型与全局评测，原始敏感数据默认不离端。</p>
      </div>
    </div>
  );
}
