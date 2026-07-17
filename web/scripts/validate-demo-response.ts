import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { demoRunSchema } from "@/lib/sense-engine/schema";
import type { DemoRunResponse } from "@/lib/sense-engine/types";

const expectedActions = ["Ask", "Suggest Break", "Silence"] as const;
const expectedBaselines = [0.5, 0.5, 0.7] as const;
const expectedBaselineAfter = 0.65;

function valuesMatch<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function validateDemoResponse(input: string): DemoRunResponse {
  const parsed = demoRunSchema.parse(JSON.parse(input));
  const actions = parsed.steps.map((step) => step.intervention.action.type);
  if (!valuesMatch(actions, expectedActions)) {
    throw new Error("Unexpected demo action sequence");
  }

  const baselines = parsed.steps.map((step) => step.baseline_before);
  if (!valuesMatch(baselines, expectedBaselines) || parsed.baseline_after !== expectedBaselineAfter) {
    throw new Error("Unexpected demo baseline");
  }

  return parsed;
}

function isDirectInvocation(): boolean {
  const scriptPath = process.argv[1];
  return scriptPath !== undefined && import.meta.url === pathToFileURL(scriptPath).href;
}

if (isDirectInvocation()) {
  try {
    validateDemoResponse(fs.readFileSync(0, "utf8"));
    process.stdout.write("validated SenseEngine demo response\n");
  } catch {
    process.stderr.write("SenseEngine demo response validation failed.\n");
    process.exitCode = 1;
  }
}
