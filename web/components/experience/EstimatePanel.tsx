import type { CSSProperties } from "react";
import type { DemoStep } from "@/lib/sense-engine/types";
import { formatProbability } from "@/components/experience/format";
import styles from "@/components/experience/experience.module.css";

const distributionLabels = [
  ["flow", "心流"],
  ["friction", "交互摩擦"],
  ["cognitive_overload", "认知过载"],
  ["unknown", "未知"],
] as const;

function probabilityStyle(value: number): CSSProperties {
  return { "--probability": `${value * 100}%` } as CSSProperties;
}

export function EstimatePanel({ step }: { step: DemoStep }) {
  const cognitiveLoad = step.estimate.dimensions.cognitive_load;

  return (
    <section className={styles.estimatePanel} aria-label="状态估计">
      <header className={styles.panelHeader}>
        <span>ESTIMATE</span>
        <h3>状态估计</h3>
      </header>

      <div className={styles.primaryMetrics}>
        <div>
          <span>认知负荷</span>
          <strong className={styles.animatedValue}>{formatProbability(cognitiveLoad)}</strong>
        </div>
        <div>
          <span>置信度</span>
          <strong className={styles.animatedValue}>
            {formatProbability(step.estimate.confidence)}
          </strong>
        </div>
      </div>

      <div className={styles.distribution} aria-label="状态概率分布">
        {distributionLabels.map(([key, label]) => {
          const value = step.estimate.distribution[key];
          return (
            <div className={styles.distributionRow} key={key}>
              <div className={styles.distributionLabel}>
                <span>{label}</span>
                <strong>{formatProbability(value)}</strong>
              </div>
              <div className={styles.distributionBar} aria-hidden="true">
                <span style={probabilityStyle(value)} />
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.explanation}>
        <span>主要证据</span>
        {step.estimate.explanation.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </section>
  );
}
