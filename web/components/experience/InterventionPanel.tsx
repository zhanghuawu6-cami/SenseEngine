import { Check, ShieldCheck } from "lucide-react";
import type { DemoStep } from "@/lib/sense-engine/types";
import { formatProbability } from "@/components/experience/format";
import styles from "@/components/experience/experience.module.css";

export function InterventionPanel({ step }: { step: DemoStep }) {
  const reversibility = step.intervention.reversibility;

  return (
    <aside className={styles.interventionPanel} aria-label="克制干预">
      <header className={styles.panelHeader}>
        <span>DECIDE</span>
        <h3>克制干预</h3>
      </header>

      <div className={styles.actionResult}>
        <span>建议动作</span>
        <strong className={styles.animatedValue}>{step.intervention.action.type}</strong>
        <p>{step.intervention.risk.rationale}</p>
      </div>

      <dl className={styles.safetyList}>
        <div>
          <dt>历史基线</dt>
          <dd>{formatProbability(step.baseline_before)}</dd>
        </div>
        <div>
          <dt>风险等级</dt>
          <dd>{step.intervention.risk.level}</dd>
        </div>
        <div>
          <dt>行动性质</dt>
          <dd>{reversibility.is_reversible ? "可逆" : "不可逆"}</dd>
        </div>
      </dl>

      <div className={styles.retentionNote}>
        <ShieldCheck size={18} aria-hidden="true" />
        <p>
          <strong>本次演示不保留访客状态</strong>
          <span>请求结束即清除，不执行真实设备动作。</span>
        </p>
      </div>

      {reversibility.is_reversible ? (
        <p className={styles.reversibility}>
          <Check size={16} aria-hidden="true" />
          可通过 {reversibility.method} 撤销
        </p>
      ) : null}
    </aside>
  );
}
