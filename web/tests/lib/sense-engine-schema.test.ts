// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { demoRunSchema } from "@/lib/sense-engine/schema";
import type { DemoAction, DemoPublicError, DemoStep } from "@/lib/sense-engine/types";

const fixture: unknown = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "../contracts/demo-response.json"), "utf8"),
);

type JsonObject = Record<string, unknown>;

function mutateFixture(mutator: (candidate: JsonObject) => void): unknown {
  const candidate = structuredClone(fixture) as JsonObject;
  mutator(candidate);
  return candidate;
}

function stepsOf(candidate: JsonObject): JsonObject[] {
  return candidate.steps as JsonObject[];
}

function estimateOf(step: JsonObject): JsonObject {
  return step.estimate as JsonObject;
}

function interventionOf(step: JsonObject): JsonObject {
  return step.intervention as JsonObject;
}

describe("demoRunSchema", () => {
  it("exposes the web-facing action and public error types", () => {
    const action: DemoAction = "Ask";
    const publicError: DemoPublicError = {
      error: { code: "demo_unavailable", message: "Demo unavailable" },
    };

    expectTypeOf<DemoAction>().toEqualTypeOf<DemoStep["intervention"]["action"]["type"]>();
    expect(action).toBe("Ask");
    expect(publicError.error.code).toBe("demo_unavailable");
  });

  it("parses the complete generated demo fixture without dropping nested data", () => {
    const parsed = demoRunSchema.parse(fixture);

    expect(parsed).toEqual(fixture);
    expect(parsed).toMatchObject({
      schema_version: "1.0",
      mode: "simulation",
      retention: "none",
      baseline_after: 0.65,
    });
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.steps.map((step) => [step.scenario.id, step.scenario.sequence])).toEqual([
      ["insufficient-evidence", 1],
      ["long-meeting", 2],
      ["deep-focus", 3],
    ]);
    expect(parsed.steps.map((step) => step.intervention.action.type)).toEqual([
      "Ask",
      "Suggest Break",
      "Silence",
    ]);
    expect(parsed.steps.map((step) => step.baseline_before)).toEqual([0.5, 0.5, 0.7]);
    expect(parsed.steps[0].estimate).toEqual({
      confidence: 0.4,
      dimensions: { cognitive_load: 0.5 },
      distribution: {
        cognitive_overload: 0.2,
        flow: 0.2,
        friction: 0.2,
        unknown: 0.3999999999999999,
      },
      explanation: ["Available evidence does not strongly support a specific state."],
      missingness: { calendar_context: 1, computer_activity: 1 },
      model_version: "state-estimator-rules-v0.1",
    });
    expect(parsed.steps[1].intervention).toEqual({
      action: { channel: "recommendation", parameters: {}, type: "Suggest Break" },
      expected_effect: { cognitive_load: -0.2 },
      objective: "reduce-cognitive-load",
      reversibility: {
        is_reversible: true,
        method: "dismiss-suggestion",
        recovery_seconds: 0,
      },
      risk: {
        level: "low",
        rationale: "认知负荷显著高于个人基线，建议休息",
      },
    });
  });

  it.each([2, 4])("rejects a steps array containing %i items", (length) => {
    const candidate = mutateFixture((value) => {
      const steps = stepsOf(value);
      value.steps = length === 2 ? steps.slice(0, 2) : [...steps, structuredClone(steps[2])];
    });

    expect(demoRunSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects the three fixed scenarios in a different order", () => {
    const candidate = mutateFixture((value) => {
      const steps = stepsOf(value);
      [steps[0], steps[1]] = [steps[1], steps[0]];
    });

    expect(demoRunSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    [0, "long-meeting"],
    [1, "deep-focus"],
    [2, "insufficient-evidence"],
  ])("rejects scenario %i with the wrong fixed id %s", (index, id) => {
    const candidate = mutateFixture((value) => {
      const scenario = stepsOf(value)[index].scenario as JsonObject;
      scenario.id = id;
    });

    expect(demoRunSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    [0, 2],
    [1, 3],
    [2, 1],
  ])("rejects scenario %i with the wrong fixed sequence %i", (index, sequence) => {
    const candidate = mutateFixture((value) => {
      const scenario = stepsOf(value)[index].scenario as JsonObject;
      scenario.sequence = sequence;
    });

    expect(demoRunSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects an action type outside the public demo enum", () => {
    const candidate = mutateFixture((value) => {
      const action = interventionOf(stepsOf(value)[0]).action as JsonObject;
      action.type = "Notify";
    });

    expect(demoRunSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.01, 1.01])(
    "rejects invalid probability %s",
    (probability) => {
      const candidate = mutateFixture((value) => {
        const distribution = estimateOf(stepsOf(value)[0]).distribution as JsonObject;
        distribution.unknown = probability;
      });

      expect(demoRunSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite nested number %s",
    (number) => {
      const candidate = mutateFixture((value) => {
        const effect = interventionOf(stepsOf(value)[1]).expected_effect as JsonObject;
        effect.cognitive_load = number;
      });

      expect(demoRunSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects non-finite JSON action parameter %s",
    (number) => {
      const candidate = mutateFixture((value) => {
        const action = interventionOf(stepsOf(value)[0]).action as JsonObject;
        action.parameters = { nested: [true, null, { invalid: number }] };
      });

      expect(demoRunSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it("accepts finite JSON values in action parameters", () => {
    const candidate = mutateFixture((value) => {
      const action = interventionOf(stepsOf(value)[0]).action as JsonObject;
      action.parameters = {
        enabled: true,
        label: "confirm",
        nested: [null, 1.25, { count: 2 }],
      };
    });

    expect(demoRunSchema.parse(candidate).steps[0].intervention.action.parameters).toEqual({
      enabled: true,
      label: "confirm",
      nested: [null, 1.25, { count: 2 }],
    });
  });

  it.each([
    ["top-level", (value: JsonObject) => { value.extra = true; }],
    ["step", (value: JsonObject) => { stepsOf(value)[0].extra = true; }],
    ["estimate", (value: JsonObject) => { estimateOf(stepsOf(value)[0]).extra = true; }],
    ["intervention", (value: JsonObject) => { interventionOf(stepsOf(value)[0]).extra = true; }],
    ["risk", (value: JsonObject) => {
      const risk = interventionOf(stepsOf(value)[0]).risk as JsonObject;
      risk.extra = true;
    }],
  ])("rejects an extra %s field", (_location, mutate) => {
    expect(demoRunSchema.safeParse(mutateFixture(mutate)).success).toBe(false);
  });

  it.each(["2026-07-15T08:00:00", "not-a-datetime", "2026-02-30T08:00:00Z"])(
    "rejects invalid or timezone-naive generated_at %s",
    (generatedAt) => {
      const candidate = mutateFixture((value) => {
        value.generated_at = generatedAt;
      });

      expect(demoRunSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it.each([
    ["schema_version", "2.0"],
    ["mode", "live"],
    ["retention", "session"],
  ])("rejects an incorrect fixed %s literal", (field, invalid) => {
    const candidate = mutateFixture((value) => {
      value[field] = invalid;
    });

    expect(demoRunSchema.safeParse(candidate).success).toBe(false);
  });

  it.each(["confidence", "missingness"])(
    "rejects out-of-range estimate %s probabilities",
    (field) => {
      const candidate = mutateFixture((value) => {
        const estimate = estimateOf(stepsOf(value)[0]);
        if (field === "confidence") {
          estimate.confidence = 1.1;
        } else {
          (estimate.missingness as JsonObject).calendar_context = -0.1;
        }
      });

      expect(demoRunSchema.safeParse(candidate).success).toBe(false);
    },
  );

  it("rejects invalid risk and reversibility values", () => {
    const invalidRisk = mutateFixture((value) => {
      const risk = interventionOf(stepsOf(value)[0]).risk as JsonObject;
      risk.level = "critical";
    });
    const invalidRecovery = mutateFixture((value) => {
      const reversibility = interventionOf(stepsOf(value)[0]).reversibility as JsonObject;
      reversibility.recovery_seconds = -1;
    });

    expect(demoRunSchema.safeParse(invalidRisk).success).toBe(false);
    expect(demoRunSchema.safeParse(invalidRecovery).success).toBe(false);
  });

  it.each(["method", "recovery_seconds"])(
    "rejects reversibility without required %s",
    (field) => {
      const candidate = mutateFixture((value) => {
        const reversibility = interventionOf(stepsOf(value)[0]).reversibility as JsonObject;
        delete reversibility[field];
      });

      expect(demoRunSchema.safeParse(candidate).success).toBe(false);
    },
  );
});
