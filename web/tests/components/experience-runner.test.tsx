import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExperiencePage, { metadata } from "@/app/experience/page";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { ExperienceRunner } from "@/components/experience/ExperienceRunner";
import { formatProbability } from "@/components/experience/format";
import type { DemoRunState } from "@/hooks/use-demo-run";
import type { DemoRunResponse } from "@/lib/sense-engine/types";

const useDemoRunMock = vi.hoisted(() => vi.fn<() => DemoRunState>());

vi.mock("@/hooks/use-demo-run", () => ({
  useDemoRun: useDemoRunMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/experience",
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

describe("ExperienceRunner states", () => {
  beforeEach(() => {
    useDemoRunMock.mockReset();
  });

  it("starts as an honest fixed simulation and runs only on request", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(state({ run }));
    const user = userEvent.setup();

    render(<ExperienceRunner />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "体验一次被理解，也体验一次不被打扰。",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("仅使用固定模拟场景，不读取真实设备信号。"))
      .toBeInTheDocument();
    expect(screen.queryByText("0.40")).not.toBeInTheDocument();
    expect(screen.queryByText("0.50")).not.toBeInTheDocument();
    expect(screen.queryByText("Ask")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "运行状态闭环" }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each([
    [false, "正在处理固定模拟场景"],
    [true, "正在唤醒 SenseEngine"],
  ])("announces running progress when waking is %s", (isWaking, message) => {
    useDemoRunMock.mockReturnValue(state({ status: "running", isWaking }));

    render(<ExperienceRunner />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("heading", { name: message })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "状态闭环运行进度" }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "运行状态闭环" })).toBeDisabled();
  });

  it("renders an alert, retries, and focuses the running title after the transition", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(
      state({ status: "unavailable", errorCode: "demo_unavailable", run }),
    );
    const user = userEvent.setup();
    const { rerender } = render(<ExperienceRunner />);

    expect(screen.getByRole("alert")).toHaveTextContent("演示暂时不可用，请稍后重试。");
    await user.click(screen.getByRole("button", { name: "重试状态闭环" }));
    expect(run).toHaveBeenCalledTimes(1);

    useDemoRunMock.mockReturnValue(state({ status: "running", run }));
    rerender(<ExperienceRunner />);

    expect(screen.getByRole("heading", { name: "正在处理固定模拟场景" }))
      .toHaveFocus();
  });

  it("focuses and displays the first API result when a run succeeds", () => {
    useDemoRunMock.mockReturnValue(state({ status: "success", data: fixture }));

    render(<ExperienceRunner />);

    const title = screen.getByRole("heading", {
      level: 2,
      name: fixture.steps[0].scenario.title,
    });
    expect(title).toHaveFocus();

    const desktop = screen.getByRole("region", { name: "桌面体验结果" });
    expect(desktop).toHaveTextContent("Ask");
    expect(desktop).toHaveTextContent("置信度0.40");
    expect(desktop).toHaveTextContent("历史基线0.50");
    expect(desktop).toHaveTextContent("认知负荷0.50");
  });
});

describe("ExperienceRunner scenario navigation", () => {
  beforeEach(() => {
    useDemoRunMock.mockReset();
  });

  it("switches all three desktop scenario buttons without another request", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(state({ status: "success", data: fixture, run }));
    const user = userEvent.setup();

    render(<ExperienceRunner />);

    const rail = screen.getByRole("region", { name: "场景选择" });
    const buttons = within(rail).getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("aria-current", "step");
    expect(buttons[1]).not.toHaveAttribute("aria-current");

    await user.click(buttons[1]);

    const desktop = screen.getByRole("region", { name: "桌面体验结果" });
    expect(desktop).toHaveTextContent(fixture.steps[1].scenario.title);
    expect(desktop).toHaveTextContent("Suggest Break");
    expect(desktop).toHaveTextContent("认知负荷0.90");
    expect(desktop).toHaveTextContent("历史基线0.50");
    expect(buttons[1]).toHaveAttribute("aria-current", "step");

    await user.click(buttons[2]);

    expect(desktop).toHaveTextContent("Silence");
    expect(desktop).toHaveTextContent("历史基线0.70");
    expect(buttons[2]).toHaveAttribute("aria-current", "step");
    expect(run).not.toHaveBeenCalled();
  });

  it("advances mobile results locally, then reruns and resets the local index", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    useDemoRunMock.mockReturnValue(state({ status: "success", data: fixture, run }));
    const user = userEvent.setup();

    render(<ExperienceRunner />);

    const mobile = screen.getByRole("region", { name: "移动端体验结果" });
    expect(mobile).toHaveTextContent("1 / 3");
    await user.click(within(mobile).getByRole("button", { name: "查看下一场景" }));
    expect(mobile).toHaveTextContent("2 / 3");
    expect(run).not.toHaveBeenCalled();

    await user.click(within(mobile).getByRole("button", { name: "查看下一场景" }));
    expect(mobile).toHaveTextContent("3 / 3");
    expect(within(mobile).getByRole("button", { name: "重新运行" }))
      .toBeInTheDocument();

    await user.click(within(mobile).getByRole("button", { name: "重新运行" }));

    expect(run).toHaveBeenCalledTimes(1);
    expect(mobile).toHaveTextContent("1 / 3");
  });

  it("renders formatted distribution, original explanation, and intervention safety fields", () => {
    useDemoRunMock.mockReturnValue(state({ status: "success", data: fixture }));

    render(<ExperienceRunner />);

    const desktop = screen.getByRole("region", { name: "桌面体验结果" });
    expect(formatProbability(0.4)).toBe("0.40");
    expect(formatProbability(0.09999999999999998)).toBe("0.10");
    expect(within(desktop).getByText("心流").parentElement).toHaveTextContent("0.20");
    expect(within(desktop).getByText("交互摩擦").parentElement).toHaveTextContent("0.20");
    expect(within(desktop).getByText("认知过载").parentElement).toHaveTextContent("0.20");
    expect(within(desktop).getByText("未知").parentElement).toHaveTextContent("0.40");
    expect(desktop).toHaveTextContent(fixture.steps[0].estimate.explanation[0]);
    expect(desktop).toHaveTextContent(fixture.steps[0].intervention.risk.rationale);
    expect(desktop).toHaveTextContent("风险等级low");
    expect(desktop).toHaveTextContent("可逆");
    expect(desktop).toHaveTextContent("本次演示不保留访客状态");
  });
});

describe("experience page wiring", () => {
  beforeEach(() => {
    useDemoRunMock.mockReset();
    useDemoRunMock.mockReturnValue(state());
  });

  it("exports page metadata and composes the runner with trust boundaries", () => {
    render(<ExperiencePage />);

    expect(metadata.title).toBe("体验 State Loop");
    expect(screen.getByRole("button", { name: "运行状态闭环" })).toBeInTheDocument();
    expect(screen.getByText("这是模拟，不是诊断。")).toBeInTheDocument();
    expect(screen.getByText("不读取真实电脑活动、日历、摄像头或麦克风。"))
      .toBeInTheDocument();
    expect(screen.getByText("一次请求结束后不保留访客状态。"))
      .toBeInTheDocument();
    expect(screen.getByText("不会执行真实通知或设备动作。"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "成为设计伙伴" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("links the experience from desktop, mobile, and footer navigation", () => {
    const { rerender } = render(<SiteHeader />);

    const desktopNav = screen.getByRole("navigation", { name: "主要导航" });
    expect(within(desktopNav).getByRole("link", { name: "体验" })).toHaveAttribute(
      "href",
      "/experience",
    );
    const mobileNav = screen.getByRole("navigation", { name: "移动端导航" });
    expect(within(mobileNav).getByRole("link", { name: /体验/ })).toHaveTextContent("05");
    expect(within(mobileNav).getByRole("link", { name: /建立合作/ })).toHaveTextContent("06");

    rerender(
      <SiteFooter settings={{ footer_notice: "测试页脚", stage_label: "测试阶段" }} />,
    );

    expect(screen.getByRole("link", { name: "完整体验" })).toHaveAttribute(
      "href",
      "/experience",
    );
  });
});
