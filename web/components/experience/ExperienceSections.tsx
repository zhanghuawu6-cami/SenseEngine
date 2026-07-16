import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import styles from "@/components/experience/experience.module.css";

const decisions = [
  {
    action: "Ask",
    title: "证据不足时，先询问。",
    copy: "保留未知，不把低置信度判断包装成确定结论。",
  },
  {
    action: "Suggest Break",
    title: "负荷明显升高时，给出可撤销建议。",
    copy: "建议基于相对个体基线，用户可以忽略或关闭。",
  },
  {
    action: "Silence",
    title: "专注成立时，保持安静。",
    copy: "没有动作也是明确决策，避免把主动打扰当作产品价值。",
  },
] as const;

const loop = [
  ["01", "Perceive", "接收固定模拟证据，同时标记缺失。"],
  ["02", "Estimate", "输出概率分布、负荷与置信度。"],
  ["03", "Remember", "读取写入前个体基线，不建立访客记忆。"],
  ["04", "Decide", "在询问、建议和安静之间选择克制动作。"],
] as const;

const boundaries = [
  "这是模拟，不是诊断。",
  "不读取真实电脑活动、日历、摄像头或麦克风。",
  "一次请求结束后不保留访客状态。",
  "不会执行真实通知或设备动作。",
] as const;

export function ExperienceSections() {
  return (
    <>
      <section className={styles.contentBand} id="decision-explanations">
        <div className={styles.shell}>
          <header className={styles.sectionHeading}>
            <span>01 / WHY THIS DECISION</span>
            <h2>好的状态智能，不以行动数量证明自己。</h2>
          </header>
          <div className={styles.decisionRows}>
            {decisions.map((decision, index) => (
              <article key={decision.action}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{decision.action}</strong>
                <h3>{decision.title}</h3>
                <p>{decision.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.contentBand} ${styles.contentBandTint}`}>
        <div className={styles.shell}>
          <header className={styles.sectionHeading}>
            <span>02 / LOOP ANATOMY</span>
            <h2>一次请求，一条完整责任链。</h2>
          </header>
          <ol className={styles.loopRows}>
            {loop.map(([number, title, copy]) => (
              <li key={title}>
                <span>{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${styles.contentBand} ${styles.trustBand}`}>
        <div className={`${styles.shell} ${styles.trustLayout}`}>
          <header className={styles.sectionHeading}>
            <span>03 / TRUST BOUNDARY</span>
            <h2>理解越深入，边界越要清楚。</h2>
          </header>
          <ul className={styles.boundaryList}>
            {boundaries.map((boundary) => (
              <li key={boundary}>{boundary}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className={`${styles.contentBand} ${styles.ctaBand}`}>
        <div className={`${styles.shell} ${styles.ctaLayout}`}>
          <div>
            <span>DESIGN PARTNERS</span>
            <h2>从一个可衡量的状态闭环开始。</h2>
          </div>
          <Link href="/contact" className={styles.ctaLink}>
            成为设计伙伴
            <ArrowUpRight size={19} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
