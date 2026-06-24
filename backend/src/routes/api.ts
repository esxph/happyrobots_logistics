import type { FastifyInstance } from "fastify";
import { handleError } from "../middleware/auth.js";
import {
  API_CATALOG,
  handleBookLoad,
  handleCreateSession,
  handleFindAvailableLoads,
  handleGetLoadDetail,
  handleLogCall,
  handleLookupCarrier,
  handleNegotiateRate,
  handleOpsCalls,
  handleOpsKpis,
  handleOtpLocked,
  handleSendOtp,
  handleTransferToColleague,
  handleVerifyCarrier,
  handleVerifyOtp,
} from "./handlers.js";

function wrap(
  handler: (req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>,
  options?: { onError?: (req: import("fastify").FastifyRequest, err: unknown) => Promise<void> },
) {
  return async (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => {
    try {
      await handler(request, reply);
    } catch (error) {
      if (options?.onError) await options.onError(request, error);
      handleError(error, reply);
    }
  };
}

/** Register one handler under canonical /api/v1 tool path and legacy kebab-case alias. */
function registerToolRoutes(
  app: FastifyInstance,
  canonical: { method: "get" | "post"; path: string; handler: ReturnType<typeof wrap> },
  legacy?: { method: "get" | "post"; path: string },
): void {
  app[canonical.method](canonical.path, canonical.handler);
  if (legacy) {
    app[legacy.method](legacy.path, canonical.handler);
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Catalog — what HappyRobot tools to wire
  app.get("/api/v1", async (_request, reply) => {
    reply.send(API_CATALOG);
  });

  // --- Canonical v1 tool routes (match AGENT_PROMPT.md) ---
  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/create_session",
    handler: wrap(handleCreateSession),
  }, { method: "post", path: "/sessions" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/verify_carrier",
    handler: wrap(handleVerifyCarrier),
  }, { method: "post", path: "/verify-carrier" });

  app.get("/api/v1/carriers/:mc_number", wrap(handleLookupCarrier));

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/send_otp",
    handler: wrap(handleSendOtp),
  }, { method: "post", path: "/send-otp" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/verify_otp",
    handler: wrap(handleVerifyOtp, { onError: handleOtpLocked }),
  }, { method: "post", path: "/verify-otp" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/find_available_loads",
    handler: wrap(handleFindAvailableLoads),
  }, { method: "post", path: "/search-loads" });

  registerToolRoutes(app, {
    method: "get",
    path: "/api/v1/loads/:load_id",
    handler: wrap(handleGetLoadDetail),
  }, { method: "get", path: "/loads/:loadId" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/negotiate_rate",
    handler: wrap(handleNegotiateRate),
  }, { method: "post", path: "/negotiate" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/accept_first_rate",
    handler: wrap(handleNegotiateRate),
  });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/book_load",
    handler: wrap(handleBookLoad),
  }, { method: "post", path: "/book-load" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/transfer_to_colleague",
    handler: wrap(handleTransferToColleague),
  }, { method: "post", path: "/handoff" });

  registerToolRoutes(app, {
    method: "post",
    path: "/api/v1/log_call",
    handler: wrap(handleLogCall),
  }, { method: "post", path: "/log-call" });

  app.get("/ops/calls", wrap(handleOpsCalls));
  app.get("/ops/kpis", wrap(handleOpsKpis));
  app.get("/api/v1/ops/calls", wrap(handleOpsCalls));
  app.get("/api/v1/ops/kpis", wrap(handleOpsKpis));
}
