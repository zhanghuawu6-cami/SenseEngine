// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { validateDemoResponse } from "@/scripts/validate-demo-response";

const fixtureText = fs.readFileSync(
  path.resolve(process.cwd(), "../contracts/demo-response.json"),
  "utf8",
);

type JsonObject = Record<string, unknown>;

function mutateFixture(mutator: (candidate: JsonObject) => void): string {
  const candidate = JSON.parse(fixtureText) as JsonObject;
  mutator(candidate);
  return JSON.stringify(candidate);
}

function stepsOf(candidate: JsonObject): JsonObject[] {
  return candidate.steps as JsonObject[];
}

describe("validateDemoResponse", () => {
  it("accepts the fixed three-step demo contract", () => {
    const parsed = validateDemoResponse(fixtureText);

    expect(parsed.steps.map((step) => step.scenario.id)).toEqual([
      "insufficient-evidence",
      "long-meeting",
      "deep-focus",
    ]);
    expect(parsed.steps.map((step) => step.intervention.action.type)).toEqual([
      "Ask",
      "Suggest Break",
      "Silence",
    ]);
    expect(parsed.steps.map((step) => step.baseline_before)).toEqual([0.5, 0.5, 0.7]);
    expect(parsed.baseline_after).toBe(0.65);
  });

  it("rejects a valid schema response with the wrong action sequence", () => {
    const candidate = mutateFixture((value) => {
      const steps = stepsOf(value);
      const firstIntervention = steps[0].intervention as JsonObject;
      const firstAction = firstIntervention.action as JsonObject;
      firstAction.type = "Silence";
    });

    expect(() => validateDemoResponse(candidate)).toThrow("Unexpected demo action sequence");
  });

  it.each([
    ["baseline_before", (value: JsonObject) => {
      stepsOf(value)[1].baseline_before = 0.6;
    }],
    ["baseline_after", (value: JsonObject) => {
      value.baseline_after = 0.66;
    }],
  ])("rejects an unexpected %s", (_field, mutate) => {
    expect(() => validateDemoResponse(mutateFixture(mutate))).toThrow(
      "Unexpected demo baseline",
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => validateDemoResponse("{not-json")).toThrow();
  });

  it("keeps invalid response content out of CLI stderr", () => {
    const secret = "integration-secret-that-must-not-leak";
    const scriptPath = path.resolve(process.cwd(), "scripts/validate-demo-response.ts");
    const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");
    const result = spawnSync(tsxPath, [scriptPath], {
      encoding: "utf8",
      input: JSON.stringify({ secret }),
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("SenseEngine demo response validation failed.\n");
    expect(result.stderr).not.toContain(secret);
  });
});
