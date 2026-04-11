// Scan history persisted in localStorage. Each entry stores a small
// JPEG thumbnail alongside the full API response so we can reopen a
// past scan without re-uploading the original image.
import type { HistoryEntry, PredictionResponse } from "../types";

const STORAGE_KEY = "food_vision_history_v1";
const MAX_ENTRIES = 20;
const THUMB_MAX_DIM = 320;
const THUMB_QUALITY = 0.75;

/** Read all history entries, newest first. */
export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is HistoryEntry =>
          typeof entry?.id === "string" &&
          typeof entry?.imageDataUrl === "string" &&
          typeof entry?.timestamp === "number" &&
          !!entry?.response
      )
      .slice(0, MAX_ENTRIES);
  } catch (error) {
    console.warn("Failed to read history from localStorage", error);
    return [];
  }
}

/** Append a new entry to the front of the history list. */
export function saveHistoryEntry(
  imageDataUrl: string,
  response: PredictionResponse
): HistoryEntry {
  const entry: HistoryEntry = {
    id: generateId(),
    timestamp: Date.now(),
    imageDataUrl,
    response,
  };

  const existing = loadHistory();
  const next = [entry, ...existing].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn(
      "Failed to persist history (likely quota exceeded) — shrinking and retrying",
      error
    );
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(next.slice(0, 5))
      );
    } catch {
      // give up silently — next save will try again
    }
  }
  return entry;
}

/** Remove a specific entry by id. */
export function deleteHistoryEntry(id: string): HistoryEntry[] {
  const remaining = loadHistory().filter((entry) => entry.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
  return remaining;
}

/** Wipe the history store completely. */
export function clearHistory(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Compress a data URL into a smaller thumbnail suitable for storage. */
export async function compressDataUrl(dataUrl: string): Promise<string> {
  if (typeof window === "undefined") return dataUrl;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const scale = Math.min(1, THUMB_MAX_DIM / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      try {
        resolve(canvas.toDataURL("image/jpeg", THUMB_QUALITY));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
