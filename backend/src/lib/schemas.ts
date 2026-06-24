import { z } from "zod";

/** Strip currency formatting; HappyRobot tools often send numbers as strings. */
function normalizeNumericInput(val: unknown): unknown {
  if (typeof val === "string") {
    const cleaned = val.replace(/[$,\s]/g, "");
    if (cleaned === "") return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : val;
  }
  return val;
}

export const apiNumber = z.preprocess(normalizeNumericInput, z.number());

export const optionalApiNumber = apiNumber.optional();

export const positiveApiNumber = z.preprocess(normalizeNumericInput, z.number().positive());

export const optionalPositiveApiNumber = positiveApiNumber.optional();

export const optionalPositiveInt = z.preprocess(
  normalizeNumericInput,
  z.number().int().positive(),
).optional();

export const optionalMaxResults = z.preprocess(
  normalizeNumericInput,
  z.number().int().positive().max(20).optional(),
);
