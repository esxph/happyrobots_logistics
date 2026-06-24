#!/usr/bin/env node
/**
 * Apply Twin SQL schema one statement at a time (WAF-safe).
 * Usage: node scripts/apply-twin-schema.mjs [path-to.sql]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

const sqlPath = process.argv[2] ?? resolve(__dirname, "twin_schema_carrier_calls.sql");
const apiKey = process.env.HP_API;
const baseUrl = (process.env.HP_BASE_URL ?? "https://platform.happyrobot.ai/api/v2").replace(/\/$/, "");

if (!apiKey) {
  console.error("HP_API is not set in backend/.env");
  process.exit(1);
}

const raw = readFileSync(sqlPath, "utf8").replace(/^[ \t]*--[^\n]*$/gm, "");
const parts = raw.includes("STATEMENT BREAK")
  ? raw.split(/===\s*STATEMENT BREAK\s*===/)
  : raw.split(/;[ \t]*\n/);

const statements = parts.map((p) => p.trim().replace(/;$/, "").trim()).filter(Boolean);
console.log(`${sqlPath}: ${statements.length} statement(s)`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
  console.log(`  [${i + 1}/${statements.length}] ${preview}...`);

  const resp = await fetch(`${baseUrl}/twin/sql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: stmt }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`ERR: HTTP ${resp.status} on statement ${i + 1}: ${err.slice(0, 300)}`);
    process.exit(1);
  }
}

console.log("OK");
