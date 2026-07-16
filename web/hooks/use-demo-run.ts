"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { demoRunSchema } from "@/lib/sense-engine/schema";
import type { DemoPublicError, DemoRunResponse } from "@/lib/sense-engine/types";

export type DemoStatus = "idle" | "running" | "success" | "unavailable";

export type DemoRunState = {
  status: DemoStatus;
  isWaking: boolean;
  data: DemoRunResponse | null;
  errorCode: DemoPublicError["error"]["code"] | null;
  run: () => Promise<void>;
};

type DemoViewState = Omit<DemoRunState, "run">;
type Timer = ReturnType<typeof setTimeout>;

const INITIAL_STATE: DemoViewState = {
  status: "idle",
  isWaking: false,
  data: null,
  errorCode: null,
};

function unavailableState(
  errorCode: NonNullable<DemoRunState["errorCode"]>,
): DemoViewState {
  return {
    status: "unavailable",
    isWaking: false,
    data: null,
    errorCode,
  };
}

function clearTimer(timer: Timer | null): void {
  if (timer !== null) clearTimeout(timer);
}

export function useDemoRun(): DemoRunState {
  const [state, setState] = useState<DemoViewState>(INITIAL_STATE);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const wakingTimerRef = useRef<Timer | null>(null);
  const timeoutTimerRef = useRef<Timer | null>(null);

  const run = useCallback(async (): Promise<void> => {
    if (!mountedRef.current) return;

    controllerRef.current?.abort();
    clearTimer(wakingTimerRef.current);
    clearTimer(timeoutTimerRef.current);
    wakingTimerRef.current = null;
    timeoutTimerRef.current = null;

    const id = ++runIdRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({
      status: "running",
      isWaking: false,
      data: null,
      errorCode: null,
    });

    const isCurrent = () =>
      mountedRef.current &&
      runIdRef.current === id &&
      controllerRef.current === controller;

    const wakingTimer = setTimeout(() => {
      if (!isCurrent()) return;
      setState((current) =>
        current.status === "running" ? { ...current, isWaking: true } : current,
      );
    }, 2_000);
    wakingTimerRef.current = wakingTimer;

    const timeoutTimer = setTimeout(() => {
      if (!isCurrent()) return;

      controller.abort();
      controllerRef.current = null;
      clearTimer(wakingTimer);
      if (wakingTimerRef.current === wakingTimer) wakingTimerRef.current = null;
      if (timeoutTimerRef.current === timeoutTimer) timeoutTimerRef.current = null;

      if (mountedRef.current && runIdRef.current === id) {
        setState(unavailableState("demo_unavailable"));
      }
    }, 20_000);
    timeoutTimerRef.current = timeoutTimer;

    try {
      const response = await fetch("/api/demo/run", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!isCurrent()) return;

      if (!response.ok) {
        setState(
          unavailableState(response.status === 429 ? "rate_limited" : "demo_unavailable"),
        );
        return;
      }

      const data = demoRunSchema.parse(await response.json());
      if (!isCurrent()) return;
      setState({
        status: "success",
        isWaking: false,
        data,
        errorCode: null,
      });
    } catch {
      if (isCurrent()) setState(unavailableState("demo_unavailable"));
    } finally {
      clearTimer(wakingTimer);
      clearTimer(timeoutTimer);
      if (wakingTimerRef.current === wakingTimer) wakingTimerRef.current = null;
      if (timeoutTimerRef.current === timeoutTimer) timeoutTimerRef.current = null;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      clearTimer(wakingTimerRef.current);
      clearTimer(timeoutTimerRef.current);
      wakingTimerRef.current = null;
      timeoutTimerRef.current = null;
    };
  }, []);

  return { ...state, run };
}
