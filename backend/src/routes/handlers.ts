import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { fmcsaClient } from "../fmcsa/client.js";
import { otpService } from "../otp/service.js";
import { AppError } from "../lib/errors.js";
import { createSession, getSession, updateSession } from "../sessions/store.js";
import { twinLogger } from "../twin/logger.js";
import { tmsClient } from "../tms/client.js";
import { TmsError } from "../lib/errors.js";
import { negotiate, toCarrierSafeLoad } from "../negotiation/engine.js";

const sessionBody = z.object({ session_id: z.string().uuid().optional() });

const verifyCarrierBody = z.object({
  session_id: z.string().uuid(),
  mc_number: z.string().min(1),
});

const otpSendBody = z.object({ session_id: z.string().uuid() });

const otpVerifyBody = z.object({
  session_id: z.string().uuid(),
  code: z.string().min(4),
});

const searchLoadsBody = z.object({
  session_id: z.string().uuid(),
  origin_city: z.string().optional(),
  origin_state: z.string().optional(),
  destination_city: z.string().optional(),
  destination_state: z.string().optional(),
  equipment_type: z.string().optional(),
  lane_preference: z.string().optional(),
  max_results: z.number().int().positive().max(20).optional(),
});

const negotiateBody = z.object({
  session_id: z.string().uuid(),
  action: z.enum(["accept", "reject", "counter"]),
  carrier_counter_rate: z.number().positive().optional(),
});

const bookBody = z.object({ session_id: z.string().uuid() });

const handoffBody = z.object({ session_id: z.string().uuid() });

const logBody = z.object({
  session_id: z.string().uuid(),
  outcome: z.string().optional(),
  notes: z.string().optional(),
});

export const API_CATALOG = {
  name: "HappyRobot Carrier Sales API",
  version: "v1",
  auth: "Authorization: Bearer <API_KEY> or X-API-Key: <API_KEY>",
  description:
    "Single integration proxy for FMCSA verification, OTP, legacy TMS, negotiation, booking, and handoff. HappyRobot workflow uses only this API — never call FMCSA or TMS directly.",
  tools: [
    { name: "create_session", method: "POST", path: "/api/v1/create_session" },
    { name: "verify_carrier", method: "POST", path: "/api/v1/verify_carrier", proxies: "FMCSA" },
    { name: "lookup_carrier", method: "GET", path: "/api/v1/carriers/:mc_number", proxies: "FMCSA" },
    { name: "send_otp", method: "POST", path: "/api/v1/send_otp" },
    { name: "verify_otp", method: "POST", path: "/api/v1/verify_otp" },
    { name: "find_available_loads", method: "POST", path: "/api/v1/find_available_loads", proxies: "TMS" },
    { name: "get_load_detail", method: "GET", path: "/api/v1/loads/:load_id", proxies: "TMS" },
    { name: "negotiate_rate", method: "POST", path: "/api/v1/negotiate_rate" },
    { name: "book_load", method: "POST", path: "/api/v1/book_load", proxies: "TMS" },
    { name: "transfer_to_colleague", method: "POST", path: "/api/v1/transfer_to_colleague" },
    { name: "log_call", method: "POST", path: "/api/v1/log_call" },
  ],
} as const;

export async function handleCreateSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = sessionBody.parse(request.body ?? {});
  const session = createSession(body.session_id);
  reply.send({ session_id: session.id });
}

export async function handleVerifyCarrier(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = verifyCarrierBody.parse(request.body);
  const session = getSession(body.session_id);
  const result = await fmcsaClient.verifyCarrier(body.mc_number);

  if (!result.authorized) {
    const updated = updateSession(body.session_id, {
      carrier_mc: result.mc_number,
      fmcsa_status: result.authority_status,
      outcome: "failed_verification",
      notes: [...session.notes, result.reason ?? "FMCSA verification failed"],
    });
    await twinLogger.logSession(updated);
    reply.send({
      authorized: false,
      mc_number: result.mc_number,
      legal_name: result.legal_name,
      authority_status: result.authority_status,
      reason: result.reason,
      voice_message:
        "I'm not able to verify active operating authority on that MC. You may want to double-check the number and call us back.",
    });
    return;
  }

  updateSession(body.session_id, {
    carrier_mc: result.mc_number,
    fmcsa_status: result.authority_status,
    notes: [...session.notes, `FMCSA verified: ${result.legal_name}`],
  });

  reply.send({
    authorized: true,
    mc_number: result.mc_number,
    legal_name: result.legal_name,
    dot_number: result.dot_number,
    authority_status: result.authority_status,
    registered_phone_masked: result.registered_phone
      ? `***${result.registered_phone.slice(-4)}`
      : null,
    voice_message: `Thanks. I've verified ${result.legal_name ?? "your carrier"}.`,
  });
}

/** Stateless FMCSA proxy — same logic, no session required (debug / quick lookup). */
export async function handleLookupCarrier(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { mc_number } = request.params as { mc_number: string };
  const result = await fmcsaClient.verifyCarrier(mc_number);
  reply.send({
    ...result,
    voice_message: result.authorized
      ? `Carrier ${result.legal_name} is authorized.`
      : result.reason ?? "Carrier not authorized.",
  });
}

export async function handleSendOtp(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = otpSendBody.parse(request.body);
  const session = getSession(body.session_id);
  if (!session.carrier_mc) {
    throw new AppError("FMCSA required first", "FMCSA_REQUIRED", 400);
  }

  const verification = await fmcsaClient.verifyCarrier(session.carrier_mc);
  if (!verification.authorized) {
    throw new AppError("Carrier not authorized", "NOT_AUTHORIZED", 403);
  }

  const sent = otpService.send(body.session_id, session.carrier_mc, verification.registered_phone ?? "");
  updateSession(body.session_id, {
    otp_status: "sent",
    notes: [...session.notes, `OTP sent to ${sent.masked_phone}`],
  });

  reply.send({
    sent: true,
    masked_phone: sent.masked_phone,
    voice_message: `I've sent a verification code to the phone number on file ending in ${sent.masked_phone.slice(-4)}.`,
  });
}

export async function handleVerifyOtp(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = otpVerifyBody.parse(request.body);
  const session = getSession(body.session_id);
  otpService.verify(body.session_id, body.code);
  updateSession(body.session_id, {
    otp_status: "verified",
    notes: [...session.notes, "OTP verified"],
  });
  reply.send({
    verified: true,
    voice_message: "Identity verified. Let's find a load for you.",
  });
}

export async function handleOtpLocked(
  request: FastifyRequest,
  error: unknown,
): Promise<void> {
  const sessionId = (request.body as { session_id?: string })?.session_id;
  if (!sessionId || !(error instanceof AppError) || error.code !== "OTP_LOCKED") return;

  const session = getSession(sessionId);
  const updated = updateSession(sessionId, {
    otp_status: "failed",
    outcome: "failed_otp",
    notes: [...session.notes, error.message],
  });
  await twinLogger.logSession(updated);
}

export async function handleFindAvailableLoads(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = searchLoadsBody.parse(request.body);
  otpService.requireVerified(body.session_id);
  const session = getSession(body.session_id);

  let loads;
  try {
    loads = await tmsClient.searchLoads({
      origin_city: body.origin_city,
      origin_state: body.origin_state,
      destination_city: body.destination_city,
      destination_state: body.destination_state,
      equipment_type: body.equipment_type,
      max_results: body.max_results,
    });
  } catch (err) {
    if (err instanceof TmsError) {
      throw new AppError(
        err.message,
        err.tmsCode ?? "TMS_ERROR",
        502,
        "Our load board is temporarily unavailable. Please try again in a moment.",
      );
    }
    throw err;
  }

  updateSession(body.session_id, {
    lane_preference: body.lane_preference ?? null,
    equipment_type: body.equipment_type ?? null,
    loads_searched: loads,
  });

  if (loads.length === 0) {
    const updated = updateSession(body.session_id, {
      outcome: "no_match",
      notes: [...session.notes, "No matching loads found"],
    });
    await twinLogger.logSession(updated);
    reply.send({
      matches: [],
      voice_message: "I don't have any open loads matching that lane and equipment right now.",
    });
    return;
  }

  const top = loads[0];
  const detail = await tmsClient.getLoad(top.load_id);
  updateSession(body.session_id, {
    load_offered: detail,
    current_offer_rate: detail.loadboard_rate,
  });

  reply.send({
    matches: loads,
    recommended_load: toCarrierSafeLoad(detail),
    current_offer_rate: detail.loadboard_rate,
    voice_message: `I have a ${detail.equipment_type} load from ${detail.origin} to ${detail.destination} picking up ${detail.pickup_datetime} at $${detail.loadboard_rate}.`,
  });
}

export async function handleGetLoadDetail(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const { load_id, loadId } = request.params as { load_id?: string; loadId?: string };
  const id = load_id ?? loadId;
  if (!id) {
    throw new AppError("load_id required", "MISSING_LOAD_ID", 400);
  }
  const detail = await tmsClient.getLoad(id);
  reply.send(toCarrierSafeLoad(detail));
}

export async function handleNegotiateRate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = negotiateBody.parse(request.body);
  otpService.requireVerified(body.session_id);
  const session = getSession(body.session_id);
  const load = session.load_offered;
  if (!load || load.max_rate === null) {
    throw new AppError("No load in session", "NO_LOAD", 400);
  }

  const currentRound =
    session.negotiation_rounds.length > 0
      ? session.negotiation_rounds[session.negotiation_rounds.length - 1].round
      : 0;

  const result = negotiate({
    action: body.action,
    carrier_counter_rate: body.carrier_counter_rate,
    current_offer_rate: session.current_offer_rate ?? load.loadboard_rate,
    loadboard_rate: load.loadboard_rate,
    max_rate: load.max_rate,
    round: currentRound,
  });

  const roundRecord = {
    round: result.round,
    action: body.action,
    carrier_rate: body.carrier_counter_rate,
    broker_rate:
      result.next_offer_rate ??
      result.agreed_rate ??
      session.current_offer_rate ??
      load.loadboard_rate,
  };

  const updated = updateSession(body.session_id, {
    negotiation_rounds: [...session.negotiation_rounds, roundRecord],
    current_offer_rate: result.next_offer_rate ?? session.current_offer_rate,
    agreed_rate: result.agreed_rate,
    outcome:
      result.status === "failed_negotiation"
        ? "failed_negotiation"
        : result.status === "rejected"
          ? "rejected_by_carrier"
          : session.outcome,
  });

  if (result.status === "failed_negotiation" || result.status === "rejected") {
    await twinLogger.logSession(updated);
  }

  reply.send({
    status: result.status,
    agreed_rate: result.agreed_rate,
    next_offer_rate: result.next_offer_rate,
    round: result.round,
    voice_message:
      result.status === "accepted"
        ? `Agreed at $${result.agreed_rate}.`
        : result.status === "counter_offer"
          ? `The best I can offer is $${result.next_offer_rate}.`
          : result.status === "failed_negotiation"
            ? "We weren't able to reach an agreement on rate. Thank you for calling."
            : "Understood. Thank you for your time.",
  });
}

export async function handleBookLoad(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = bookBody.parse(request.body);
  const session = getSession(body.session_id);
  if (!session.load_offered || !session.carrier_mc || !session.agreed_rate) {
    throw new AppError("Booking prerequisites missing", "INVALID_STATE", 400);
  }

  const freshLoad = await tmsClient.getLoad(session.load_offered.load_id, { fresh: true });
  if (freshLoad.status !== "OPEN") {
    throw new AppError(
      "Load no longer available",
      "LOAD_NOT_AVAILABLE",
      409,
      "That load is no longer available for booking.",
    );
  }

  const booking = await tmsClient.bookLoad({
    load_id: session.load_offered.load_id,
    mc_number: session.carrier_mc,
    agreed_rate: session.agreed_rate,
  });

  updateSession(body.session_id, {
    outcome: "booked",
    notes: [...session.notes, `TMS booking: ${booking.confirmation}`],
  });

  reply.send({
    booked: true,
    confirmation: booking.confirmation,
    load_id: session.load_offered.load_id,
    agreed_rate: session.agreed_rate,
    voice_message: "Load tentatively reserved.",
  });
}

export async function handleTransferToColleague(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const body = handoffBody.parse(request.body);
  const session = getSession(body.session_id);
  if (session.outcome !== "booked" && !session.agreed_rate) {
    throw new AppError("No agreed booking to hand off", "INVALID_STATE", 400);
  }

  const queueId = `SRQ-${Date.now().toString(36).toUpperCase()}`;
  const updated = updateSession(body.session_id, {
    handoff_queue_id: queueId,
    notes: [...session.notes, `Mock handoff to senior rep queue ${queueId}`],
  });
  await twinLogger.logSession(updated);

  reply.send({
    handoff: true,
    queue_id: queueId,
    estimated_wait_seconds: 45,
    voice_message:
      "Great — let me transfer you to my colleague to finalize the booking.",
  });
}

export async function handleLogCall(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = logBody.parse(request.body);
  const session = getSession(body.session_id);
  const updated = updateSession(body.session_id, {
    outcome: (body.outcome as typeof session.outcome) ?? session.outcome,
    notes: body.notes ? [...session.notes, body.notes] : session.notes,
  });
  const record = await twinLogger.logSession(updated);
  reply.send({ logged: true, record });
}

export async function handleOpsCalls(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const records = await twinLogger.listRecords(100);
  reply.send({ calls: records });
}

export async function handleOpsKpis(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const kpis = await twinLogger.getKpis();
  reply.send({ kpis });
}
