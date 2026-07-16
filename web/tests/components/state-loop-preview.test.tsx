import fs from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import type { DemoRunState } from "@/hooks/use-demo-run";
import type { DemoRunResponse } from "@/lib/sense-engine/types";
import { StateLoopPreview } from "@/components/experience/StateLoopPreview";

const useDemoRunMock = vi.hoisted(() => vi.fn<() => DemoRunState>());

vi.mock("@/hooks/use-demo-run", () => ({
  useDemoRun: useDemoRunMock,
}));

vi.mock("@/components/StateField", () => ({
  StateField: () => <div data-testid="state-field" />,
}));

vi.mock("@/lib/repository", () => ({
  repository: {
    getSettings: () => ({
      stage_label: "测试阶段",
      hero_title: "测试标题",
      hero_description: "测试说明",
      contact_note: "测试联系说明",
    }),
    listPosts: () => [],
  },
}));

const fixture = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "../contracts/demo-response.json"), "utf8"),
) as DemoRunResponse;

function state(overrides: Partial<DemoRunState> = {}): DemoRunState {
  return {
    status: "idle",
    isWaking: false,
    data: null,
    errorCode: null,
    run: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("StateLoopPreview", () => {
  beforeEach(() => {
    useDemoRunMock.mockReset();
  });

  it("starts with an honest fixed-simulation invitation and runs on request", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(state({ run }));
    const user = userEvent.setup();

    render(<StateLoopPreview />);

    expect(screen.getByText("固定模拟场景")).toBeInTheDocument();
    expect(screen.getByText("不读取真实设备信号")).toBeInTheDocument();
    expect(screen.queryByText("0.90")).not.toBeInTheDocument();
    expect(screen.queryByText("0.80")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggest Break")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "运行状态闭环" }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("announces processing progress and disables duplicate runs", () => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(state({ status: "running", run }));

    render(<StateLoopPreview />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("progressbar", { name: "状态闭环运行进度" })).toBeInTheDocument();
    expect(screen.getByText("正在处理固定模拟场景")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行状态闭环" })).toBeDisabled();
    expect(screen.queryByText("正在唤醒 SenseEngine")).not.toBeInTheDocument();
  });

  it("announces when SenseEngine is waking after the running delay", () => {
    useDemoRunMock.mockReturnValue(state({ status: "running", isWaking: true }));

    render(<StateLoopPreview />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("正在唤醒 SenseEngine")).toBeInTheDocument();
    expect(screen.queryByText("正在处理固定模拟场景")).not.toBeInTheDocument();
  });

  it("renders the second API step with locally formatted values and dynamic action", () => {
    useDemoRunMock.mockReturnValue(state({ status: "success", data: fixture }));

    render(<StateLoopPreview />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(fixture.steps[1].scenario.title)).toBeInTheDocument();
    expect(
      screen.getByText(fixture.steps[1].estimate.dimensions.cognitive_load.toFixed(2)),
    ).toBeInTheDocument();
    expect(screen.getByText(fixture.steps[1].baseline_before.toFixed(2))).toBeInTheDocument();
    expect(screen.getByText(fixture.steps[1].estimate.confidence.toFixed(2))).toBeInTheDocument();
    expect(screen.getByText(fixture.steps[1].intervention.action.type)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入完整体验" })).toHaveAttribute(
      "href",
      "/experience",
    );
  });

  it.each([
    ["rate_limited", "请求较多，请稍后重试。"],
    ["demo_unavailable", "演示暂时不可用，请稍后重试。"],
  ] as const)("renders a restrained %s alert, clears old data, and retries", async (errorCode, message) => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(
      state({ status: "unavailable", data: fixture, errorCode, run }),
    );
    const user = userEvent.setup();

    render(<StateLoopPreview />);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText(fixture.steps[1].scenario.title)).not.toBeInTheDocument();
    expect(screen.queryByText(fixture.steps[1].intervention.action.type)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "重试状态闭环" }));

    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("Home", () => {
  it("keeps the ambient state field and replaces the static readout with the preview", () => {
    useDemoRunMock.mockReturnValue(state());

    render(<Home />);

    expect(screen.getByTestId("state-field")).toBeInTheDocument();
    expect(screen.getByText("固定模拟场景")).toBeInTheDocument();
    expect(screen.queryByLabelText("状态计算维度示意")).not.toBeInTheDocument();
  });
});
