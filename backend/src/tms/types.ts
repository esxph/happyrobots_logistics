export interface LoadSummary {
  load_id: string;
  origin: string;
  destination: string;
  pickup_datetime: string;
  equipment_type: string;
  loadboard_rate: number;
  miles: number;
  status: string;
}

export interface LoadDetail {
  load_id: string;
  origin: string;
  destination: string;
  origin_zip: string;
  destination_zip: string;
  pickup_datetime: string;
  delivery_datetime: string;
  equipment_type: string;
  loadboard_rate: number;
  max_rate: number | null;
  weight: number;
  commodity_type: string;
  num_of_pieces: number;
  miles: number;
  dimensions: string;
  notes: string;
  status: string;
}

export interface TmsErrorResponse {
  code: string;
  message: string;
}

export type TmsResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: TmsErrorResponse };

export interface LoadQueryParams {
  origin_city?: string;
  origin_state?: string;
  destination_city?: string;
  destination_state?: string;
  equipment_type?: string;
  max_results?: number;
}

export interface LoadBookParams {
  load_id: string;
  mc_number: string;
  agreed_rate: number;
}

export interface TmsReadOptions {
  /** Bypass cache and fetch live from TMS */
  fresh?: boolean;
}
