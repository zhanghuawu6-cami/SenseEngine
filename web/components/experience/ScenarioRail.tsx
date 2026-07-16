import type { DemoStep } from "@/lib/sense-engine/types";
import styles from "@/components/experience/experience.module.css";

type ScenarioRailProps = {
  steps: DemoStep[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

export function ScenarioRail({ steps, activeIndex, onSelect }: ScenarioRailProps) {
  return (
    <section className={styles.scenarioRail} role="region" aria-label="场景选择">
      <span className={styles.railLabel}>SCENARIO SEQUENCE</span>
      <div className={styles.scenarioList}>
        {steps.map((step, index) => (
          <button
            className={styles.metricButton}
            type="button"
            key={step.scenario.id}
            aria-current={activeIndex === index ? "step" : undefined}
            onClick={() => onSelect(index)}
          >
            <span>{String(step.scenario.sequence).padStart(2, "0")}</span>
            <strong>{step.scenario.title}</strong>
            <small>{step.intervention.action.type}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
