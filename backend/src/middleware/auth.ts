import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { config } from "../config.js";
import { AppError } from "../lib/errors.js";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.url === "/health") return;

  const header = request.headers.authorization;
  const apiKey = request.headers["x-api-key"];
  const token =
    (typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7)
      : undefined) ?? (typeof apiKey === "string" ? apiKey : undefined);

  if (!token || token !== config.API_KEY) {
    reply.code(401).send({ error: "Unauthorized" });
  }
}

export function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply.code(error.statusCode).send({
      error: error.code,
      message: error.message,
      voice_message: error.voiceMessage ?? error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    reply.code(400).send({
      error: "VALIDATION_ERROR",
      message: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      voice_message: "I didn't catch that correctly. Can you repeat the rate?",
    });
    return;
  }

  console.error(error);
  reply.code(500).send({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    voice_message: "Our system is temporarily unavailable. Please try again shortly.",
  });
}
