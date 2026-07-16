import { ArrowRight, RefreshCw } from "lucide-react";
import type { DemoStep } from "@/lib/sense-engine/types";
import { formatProbability } from "@/components/experience/format";
import styles from "@/components/experience/experience.module.css";

type MobileResultSheetProps = {
  step: DemoStep;
  index: number;
  onNext: () => void;
  onRerun: () => void;
};

export function MobileResultSheet({
  step,
  index,
  onNext,
  onRerun,
}: MobileResultSheetProps) {
  const isLast = index === 2;

  return (
    <section className={`${styles.resultSheet} ${styles.interventionPanel}`}>
      <div className={styles.mobileAction}>
        <span>干预建议</span>
        <strong>{step.intervention.action.type}</strong>
      </div>
      <dl className={styles.mobileSafety}>
        <div>
          <dt>历史基线</dt>
          <dd>{formatProbability(step.baseline_before)}</dd>
        </div>
        <div>
          <dt>安全理由</dt>
          <dd>{step.intervention.risk.rationale}</dd>
        </div>
      </dl>
      <button
        className={styles.nextButton}
        type="button"
        onClick={isLast ? onRerun : onNext}
      >
        {isLast ? (
          <>
            <RefreshCw size={18} aria-hidden="true" />
            重新运行
          </>
        ) : (
          <>
            查看下一场景
            <ArrowRight size={18} aria-hidden="true" />
          </>
        )}
      </button>
    </section>
  );
}
