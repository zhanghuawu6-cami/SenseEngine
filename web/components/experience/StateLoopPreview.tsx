"use client";

import type { CSSProperties } from "react";
import { ArrowUpRight, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useDemoRun } from "@/hooks/use-demo-run";

function format(value: number): string {
  return value.toFixed(2);
}

function level(value: number): CSSProperties {
  return { "--level": `${value * 100}%` } as CSSProperties;
}

export function StateLoopPreview() {
  const { status, isWaking, data, errorCode, run } = useDemoRun();

  if (status === "idle") {
    return (
      <div className="hero__readout" role="status" aria-live="polite">
        <div className="readout-title">
          <span>STATE LOOP PREVIEW</span>
          <b>固定模拟场景</b>
        </div>
        <p>
          <span>SIMULATION ONLY</span>
          <b>不读取真实设备信号</b>
          <em>不保留访客状态</em>
        </p>
        <div className="hero__actions">
          <button className="button button--light" type="button" onClick={() => void run()}>
            <Play size={17} aria-hidden="true" />
            运行状态闭环
          </button>
        </div>
      </div>
    );
  }

  if (status === "running") {
    const message = isWaking ? "正在唤醒 SenseEngine" : "正在处理固定模拟场景";

    return (
      <div className="hero__readout" role="status" aria-live="polite">
        <div className="readout-title">
          <span>STATE LOOP PREVIEW</span>
          <b>运行中</b>
        </div>
        <div className="readout-axis">
          <span>运行状态</span>
          <i role="progressbar" aria-label="状态闭环运行进度" />
          <b>{isWaking ? "唤醒中" : "处理中"}</b>
        </div>
        <p>
          <span>FIXED SCENARIO</span>
          <b>{message}</b>
          <em>不读取真实设备信号</em>
        </p>
        <div className="hero__actions">
          <button className="button button--line" type="button" disabled>
            <Play size={17} aria-hidden="true" />
            运行状态闭环
          </button>
        </div>
      </div>
    );
  }

  if (status === "success" && data) {
    const step = data.steps[1];
    const cognitiveLoad = step.estimate.dimensions.cognitive_load;
    const baselineBefore = step.baseline_before;
    const confidence = step.estimate.confidence;

    return (
      <div className="hero__readout" role="status" aria-live="polite">
        <div className="readout-title">
          <span>STATE LOOP PREVIEW</span>
          <b>{step.scenario.title}</b>
        </div>
        <div className="readout-axis">
          <span>认知负荷</span>
          <i style={level(cognitiveLoad)} aria-hidden="true" />
          <b>{format(cognitiveLoad)}</b>
        </div>
        <div className="readout-axis">
          <span>个体基线</span>
          <i style={level(baselineBefore)} aria-hidden="true" />
          <b>{format(baselineBefore)}</b>
        </div>
        <div className="readout-axis">
          <span>置信度</span>
          <i style={level(confidence)} aria-hidden="true" />
          <b>{format(confidence)}</b>
        </div>
        <p>
          <span>ACTION</span>
          <b>{step.intervention.action.type}</b>
          <em>模拟建议，不执行真实动作</em>
        </p>
        <div className="hero__actions">
          <Link href="/experience" className="button button--light">
            进入完整体验
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
    );
  }

  const unavailableMessage =
    errorCode === "rate_limited"
      ? "请求较多，请稍后重试。"
      : "演示暂时不可用，请稍后重试。";

  return (
    <div className="hero__readout" aria-live="polite">
      <div className="readout-title">
        <span>STATE LOOP PREVIEW</span>
        <b>暂时不可用</b>
      </div>
      <p role="alert">
        <span>UNAVAILABLE</span>
        <b>{unavailableMessage}</b>
        <em>不保留访客状态</em>
      </p>
      <div className="hero__actions">
        <button className="button button--line" type="button" onClick={() => void run()}>
          <RefreshCw size={17} aria-hidden="true" />
          重试状态闭环
        </button>
      </div>
    </div>
  );
}
