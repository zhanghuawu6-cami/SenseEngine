import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Testing Library cleanup", () => {
  it("renders a cleanup sentinel", () => {
    render(<div>cleanup sentinel</div>);

    expect(screen.getByText("cleanup sentinel")).toBeInTheDocument();
  });

  it("removes rendered elements after each test", () => {
    expect(screen.queryByText("cleanup sentinel")).not.toBeInTheDocument();
  });
});
