import { AppError } from "../lib/errors.js";

export type NegotiationAction = "accept" | "reject" | "counter";

export interface NegotiationInput {
  action: NegotiationAction;
  carrier_counter_rate?: number;
  current_offer_rate: number;
  loadboard_rate: number;
  max_rate: number;
  round: number;
}

export interface NegotiationResult {
  status: "accepted" | "counter_offer" | "rejected" | "failed_negotiation";
  agreed_rate: number | null;
  next_offer_rate: number | null;
  round: number;
  message: string;
}

const MAX_ROUNDS = 3;

export function negotiate(input: NegotiationInput): NegotiationResult {
  const { action, current_offer_rate, loadboard_rate, max_rate, round } = input;

  if (round > MAX_ROUNDS) {
    return {
      status: "failed_negotiation",
      agreed_rate: null,
      next_offer_rate: null,
      round,
      message: "We have reached the maximum number of negotiation rounds.",
    };
  }

  if (action === "reject") {
    return {
      status: "rejected",
      agreed_rate: null,
      next_offer_rate: null,
      round,
      message: "Carrier declined the offer.",
    };
  }

  if (action === "accept") {
    if (current_offer_rate > max_rate) {
      throw new AppError("Rate above ceiling", "RATE_ABOVE_CEILING", 400);
    }
    return {
      status: "accepted",
      agreed_rate: current_offer_rate,
      next_offer_rate: null,
      round,
      message: "Rate accepted.",
    };
  }

  const counter = input.carrier_counter_rate;
  if (counter === undefined || counter <= 0) {
    throw new AppError("Counter rate required", "MISSING_COUNTER", 400);
  }

  if (counter <= current_offer_rate) {
    if (counter > max_rate) {
      throw new AppError("Rate above ceiling", "RATE_ABOVE_CEILING", 400);
    }
    return {
      status: "accepted",
      agreed_rate: counter,
      next_offer_rate: null,
      round,
      message: "Carrier counter accepted.",
    };
  }

  if (counter <= max_rate) {
    return {
      status: "accepted",
      agreed_rate: counter,
      next_offer_rate: null,
      round,
      message: "Carrier counter within range — accepted.",
    };
  }

  if (round >= MAX_ROUNDS) {
    return {
      status: "failed_negotiation",
      agreed_rate: null,
      next_offer_rate: null,
      round,
      message: "Unable to reach agreement after maximum negotiation rounds.",
    };
  }

  const nextOffer = Math.min(max_rate, Math.max(current_offer_rate, Math.floor((current_offer_rate + counter) / 2)));
  const anchored = Math.max(loadboard_rate, nextOffer);

  return {
    status: "counter_offer",
    agreed_rate: null,
    next_offer_rate: Math.min(anchored, max_rate),
    round: round + 1,
    message: "Broker counter offer.",
  };
}

export function toCarrierSafeLoad(load: {
  load_id: string;
  origin: string;
  destination: string;
  pickup_datetime: string;
  delivery_datetime?: string;
  equipment_type: string;
  loadboard_rate: number;
  weight?: number;
  commodity_type?: string;
  num_of_pieces?: number;
  miles?: number;
  dimensions?: string;
  notes?: string;
  status?: string;
}) {
  return {
    load_id: load.load_id,
    origin: load.origin,
    destination: load.destination,
    pickup_datetime: load.pickup_datetime,
    delivery_datetime: load.delivery_datetime,
    equipment_type: load.equipment_type,
    loadboard_rate: load.loadboard_rate,
    weight: load.weight,
    commodity_type: load.commodity_type,
    num_of_pieces: load.num_of_pieces,
    miles: load.miles,
    dimensions: load.dimensions,
    notes: load.notes,
    status: load.status,
  };
}

export const MAX_NEGOTIATION_ROUNDS = MAX_ROUNDS;
