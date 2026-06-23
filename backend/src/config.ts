import { config as loadEnv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../.env") });

const envSchema = z.object({
  API_KEY: z.string().min(8),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("0.0.0.0"),
  TMS_HOST: z.string().min(1),
  TMS_PORT: z.coerce.number().int().positive(),
  TMS_AUTH_TOKEN: z.string().min(1),
  TMS_CONNECT_TIMEOUT_MS: z.coerce.number().default(5000),
  TMS_READ_TIMEOUT_MS: z.coerce.number().default(10000),
  TMS_MAX_RETRIES: z.coerce.number().default(3),
  TMS_CACHE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  TMS_CACHE_TTL_SECONDS: z.coerce.number().default(45),
  FMCSA_WEB_KEY: z.string().min(1),
  FMCSA_BASE_URL: z.string().url().default("https://mobile.fmcsa.dot.gov/qc/services"),
  OTP_LENGTH: z.coerce.number().default(6),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(3),
  TWIN_DATA_DIR: z.string().default("./data/twin"),
  OTP_PHONE_OVERRIDE: z.string().optional(),
  /** Fake MC for demos — skips FMCSA; use this MC in voice tests for happy path + OTP */
  DEMO_MC_NUMBER: z.string().default("999999"),
  DEMO_MC_LEGAL_NAME: z.string().default("HappyRobot Demo Carrier"),
  DEMO_MC_DOT: z.string().default("1234567"),
  DEMO_MC_PHONE: z.string().default("+525510506746"),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = envSchema.parse(process.env);
