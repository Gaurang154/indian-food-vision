/** Shared TypeScript types for the prediction API + local app state. */

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionPerServing extends Macros {
  serving_size_g: number;
}

export interface FoodItem {
  name: string;
  portion_g: number;
  nutrition: Macros;
}

export interface Prediction {
  dish_name: string;
  confidence: number;
  source: PredictionSource;
  is_indian: boolean;
}

export type PredictionSource =
  | "custom_model"
  | "clip_zero_shot"
  | "ai_vision";

export interface NutritionBreakdown {
  per_100g: Macros;
  per_serving: NutritionPerServing;
  items: FoodItem[];
  total: Macros;
}

export interface PredictionResponse {
  success: boolean;
  primary: Prediction;
  alternatives: Prediction[];
  nutrition: NutritionBreakdown | null;
  sources_used: PredictionSource[];
  processing_time_ms: number;
  notes?: string | null;
}

export interface HealthResponse {
  status: string;
  version: string;
  models: {
    custom_model?: boolean;
    clip_zero_shot?: boolean;
    ai_vision?: boolean;
    nutrition_entries?: number;
    [key: string]: unknown;
  };
}

export interface ApiError {
  success: false;
  error: string;
  detail?: string;
}

/** A single entry saved to the browser's scan history. */
export interface HistoryEntry {
  id: string;
  timestamp: number;
  imageDataUrl: string;
  response: PredictionResponse;
}

export interface VoiceTranscriptionResponse {
  success: boolean;
  text: string;
  language: string;
}

export interface VoiceQueryRequest {
  text: string;
  session_id?: string | null;
  image_url?: string | null;
  language?: string;
  page_context?: VoicePageContext | null;
}

export interface VoiceNutritionSummary {
  dish_name: string;
  serving_grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
  source?: string;
}

export interface VoiceQueryResponse {
  success: boolean;
  session_id: string;
  text: string;
  tools_used: string[];
  nutrition?: VoiceNutritionSummary | null;
}

export interface VoicePageContext {
  dish_name: string;
  confidence: number;
  source: PredictionSource;
  nutrition: VoiceNutritionSummary | null;
  items: Array<{
    name: string;
    portion_g: number;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  }>;
  alternatives: Array<{
    dish_name: string;
    confidence: number;
    source: PredictionSource;
  }>;
}

export type VoiceStreamMessage =
  | { type: "transcript"; text: string }
  | { type: "text_chunk"; content: string; done: boolean }
  | { type: "audio_chunk"; data: string; done: boolean }
  | { type: "audio_error"; message: string }
  | { type: "done"; session_id?: string; tools_used?: string[]; nutrition?: VoiceNutritionSummary | null }
  | { type: "error"; message: string }
  | { type: "ack"; content: string };
