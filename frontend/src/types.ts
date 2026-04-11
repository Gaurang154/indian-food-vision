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
