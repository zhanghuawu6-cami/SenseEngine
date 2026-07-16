"use client";

import { Play, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EstimatePanel } from "@/components/experience/EstimatePanel";
import { InterventionPanel } from "@/components/experience/InterventionPanel";
import { MobileResultSheet } from "@/components/experience/MobileResultSheet";
import { ScenarioRail } from "@/components/experience/ScenarioRail";
import styles from "@/components/experience/experience.module.css";
import { useDemoRun } from "@/hooks/use-demo-run";

const loopSteps = ["Perceive", "Estimate", "Remember", "Decide"];

export function ExperienceRunner() {
  const { status, isWaking, data, errorCode, run } = useDemoRun();
  const [activeIndex, setActiveIndex] = useState(0);
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (status !== "idle") statusHeadingRef.current?.focus();
  }, [status]);

  function handleRun(): void {
    setActiveIndex(0);
    void run();
  }

  return (
    <section className={styles.runner} aria-labelledby="experience-title">
      <div className={styles.shell}>
        <header className={styles.intro}>
          <span>STATE LOOP / LIVE SIMULATION</span>
          <h1 id="experience-title">体验一次被理解，也体验一次不被打扰。</h1>
          <p>仅使用固定模拟场景，不读取真实设备信号。</p>
        </header>

        {status === "idle" ? (
          <div className={`${styles.stage} ${styles.stateStage}`}>
            <div>
              <span>READY</span>
              <h2>准备运行固定场景</h2>
              <p>一次请求将返回三个连续场景，结果不会写入访客档案。</p>
            </div>
            <button className={styles.runButton} type="button" onClick={handleRun}>
              <Play size={18} aria-hidden="true" />
              运行状态闭环
            </button>
          </div>
        ) : null}

        {status === "running" ? (
          <div
            className={`${styles.stage} ${styles.stateStage}`}
            role="status"
            aria-live="polite"
          >
            <div>
              <span>PROCESSING</span>
              <h2 ref={statusHeadingRef} tabIndex={-1}>
                {isWaking ? "正在唤醒 SenseEngine" : "正在处理固定模拟场景"}
              </h2>
              <div
                className={styles.runningTrack}
                role="progressbar"
                aria-label="状态闭环运行进度"
              >
                <span />
              </div>
              <p>{isWaking ? "服务正在启动，请稍候。" : "正在验证三步完整响应。"}</p>
            </div>
            <button className={styles.runButton} type="button" disabled>
              <Play size={18} aria-hidden="true" />
              运行状态闭环
            </button>
          </div>
        ) : null}

        {status === "unavailable" ? (
          <div className={`${styles.stage} ${styles.stateStage}`} role="alert">
            <div>
              <span>UNAVAILABLE</span>
              <h2 ref={statusHeadingRef} tabIndex={-1}>暂时不可用</h2>
              <p>
                {errorCode === "rate_limited"
                  ? "请求较多，请稍后重试。"
                  : "演示暂时不可用，请稍后重试。"}
              </p>
            </div>
            <button className={styles.runButton} type="button" onClick={handleRun}>
              <RefreshCw size={18} aria-hidden="true" />
              重试状态闭环
            </button>
          </div>
        ) : null}

        {status === "success" && data === null ? (
          <div className={`${styles.stage} ${styles.stateStage}`} role="alert">
            <div>
              <span>INVALID RESULT</span>
              <h2 ref={statusHeadingRef} tabIndex={-1}>演示结果不可用</h2>
              <p>没有收到完整的三场景结果，请重新运行。</p>
            </div>
            <button className={styles.runButton} type="button" onClick={handleRun}>
              <RefreshCw size={18} aria-hidden="true" />
              重新运行
            </button>
          </div>
        ) : null}

        {status === "success" && data !== null ? (
          <div className={styles.successStage}>
            <div className={styles.resultAnnouncement} role="status" aria-live="polite">
              <span>
                {activeIndex + 1} / {data.steps.length}
              </span>
              <h2 ref={statusHeadingRef} tabIndex={-1}>
                {data.steps[activeIndex].scenario.title}
              </h2>
              <p>{data.steps[activeIndex].scenario.description}</p>
            </div>

            <div className={styles.desktopExperience} role="region" aria-label="桌面体验结果">
              <div className={styles.workspace}>
                <ScenarioRail
                  steps={data.steps}
                  activeIndex={activeIndex}
                  onSelect={setActiveIndex}
                />
                <EstimatePanel step={data.steps[activeIndex]} />
                <InterventionPanel step={data.steps[activeIndex]} />
              </div>
            </div>

            <div className={styles.mobileExperience} role="region" aria-label="移动端体验结果">
              <div className={styles.mobileScenarioMeta}>
                <span>{activeIndex + 1} / {data.steps.length}</span>
                <strong>{data.steps[activeIndex].scenario.title}</strong>
              </div>
              <EstimatePanel step={data.steps[activeIndex]} />
              <MobileResultSheet
                step={data.steps[activeIndex]}
                index={activeIndex}
                onNext={() => setActiveIndex((current) => Math.min(current + 1, 2))}
                onRerun={handleRun}
              />
            </div>

            <ol className={styles.loopProgress} aria-label="State Loop 进度">
              {loopSteps.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{step}</strong>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <a className={styles.scrollCue} href="#decision-explanations">
          继续理解决策
        </a>
      </div>
    </section>
  );
}
