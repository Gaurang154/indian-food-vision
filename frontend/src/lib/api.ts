// Typed fetch wrapper around the FastAPI backend. Base URL comes from
// VITE_API_URL and falls back to localhost:8000 for dev.
import type { HealthResponse, PredictionResponse } from "../types";

const DEFAULT_BASE_URL = "http://localhost:8000";

const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_BASE_URL;

/** Unified error thrown on any API failure. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.error === "string") return data.error;
    if (Array.isArray(data?.detail) && data.detail.length > 0) {
      return data.detail.map((d: { msg?: string }) => d?.msg || "").join("; ");
    }
    return `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

/** Healthcheck used on first load to detect which backends are online. */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${BASE_URL}/api/health`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new ApiRequestError(await parseError(response), response.status);
  }
  return (await response.json()) as HealthResponse;
}

/** Upload a food image and receive the full prediction envelope. */
export async function predictFood(file: File): Promise<PredictionResponse> {
  const form = new FormData();
  form.append("file", file, file.name);

  const response = await fetch(`${BASE_URL}/api/predict`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const message = await parseError(response);
    throw new ApiRequestError(message, response.status);
  }

  return (await response.json()) as PredictionResponse;
}

/** Convert a data URL (from file reader or webcam) back to a File. */
export async function dataUrlToFile(
  dataUrl: string,
  fileName = "capture.jpg"
): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

/** Convert a File to a data URL (used by history + previews). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

/** Exposed for display in the UI footer. */
export function getApiBaseUrl(): string {
  return BASE_URL;
}
