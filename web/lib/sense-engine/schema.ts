import { z } from "zod";
import type { DemoRunResponse, DemoStep } from "@/lib/sense-engine/types";

const finiteNumber = z.number().finite();
const finiteProbability = finiteNumber.min(0).max(1);
const nonEmptyString = z.string().min(1);
const nonEmptyKey = z.string().min(1);

type FiniteJsonValue = DemoStep["intervention"]["action"]["parameters"][string];

const finiteJsonValue: z.ZodType<FiniteJsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    finiteNumber,
    z.string(),
    z.array(finiteJsonValue),
    z.record(z.string(), finiteJsonValue),
    z.null(),
  ]),
);

const estimateSchema = z.strictObject({
  confidence: finiteProbability,
  dimensions: z.record(nonEmptyKey, finiteNumber).refine((value) => Object.keys(value).length > 0),
  distribution: z
    .record(nonEmptyKey, finiteProbability)
    .refine((value) => Object.keys(value).length > 0),
  explanation: z.array(nonEmptyString).min(1),
  missingness: z.record(nonEmptyKey, finiteProbability),
  model_version: nonEmptyString,
});

const interventionSchema = z.strictObject({
  action: z.strictObject({
    channel: nonEmptyString,
    parameters: z.record(z.string(), finiteJsonValue),
    type: z.enum(["Ask", "Suggest Break", "Silence"]),
  }),
  expected_effect: z.record(nonEmptyKey, finiteNumber),
  objective: nonEmptyString,
  reversibility: z.strictObject({
    is_reversible: z.boolean(),
    method: nonEmptyString.nullable(),
    recovery_seconds: finiteNumber.min(0).nullable(),
  }),
  risk: z.strictObject({
    level: z.enum(["low", "medium", "high"]),
    rationale: nonEmptyString,
  }),
});

const evidenceSchema = z.strictObject({
  label: nonEmptyString,
  value: nonEmptyString,
});

function scenarioSchema<const TId extends string, const TSequence extends number>(
  id: TId,
  sequence: TSequence,
) {
  return z.strictObject({
    description: nonEmptyString,
    evidence: z.array(evidenceSchema).min(1),
    id: z.literal(id),
    sequence: z.literal(sequence),
    title: nonEmptyString,
  });
}

function stepSchema<const TId extends string, const TSequence extends number>(
  id: TId,
  sequence: TSequence,
) {
  return z.strictObject({
    baseline_before: finiteProbability,
    estimate: estimateSchema,
    intervention: interventionSchema,
    scenario: scenarioSchema(id, sequence),
  });
}

export const demoRunSchema: z.ZodType<DemoRunResponse> = z.strictObject({
  baseline_after: finiteProbability,
  generated_at: z.iso.datetime({ offset: true }),
  mode: z.literal("simulation"),
  retention: z.literal("none"),
  schema_version: z.literal("1.0"),
  steps: z.tuple([
    stepSchema("insufficient-evidence", 1),
    stepSchema("long-meeting", 2),
    stepSchema("deep-focus", 3),
  ]),
});
