import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("provides a DOM and jest-dom matchers", () => {
    const node = document.createElement("main");
    node.textContent = "SenseOrder";
    expect(node).toHaveTextContent("SenseOrder");
  });
});
