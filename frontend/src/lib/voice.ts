import type {
  VoiceQueryRequest,
  VoiceQueryResponse,
  VoiceStreamMessage,
  VoiceTranscriptionResponse,
} from "../types";
import { ApiRequestError } from "./api";

const DEFAULT_BASE_URL = "http://localhost:8000";
const BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  DEFAULT_BASE_URL;

const SILENCE_THRESHOLD = 0.035;
const SILENCE_MS = 1500;

async function parseVoiceError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.error === "string") return data.error;
  } catch {
    return `Request failed with status ${response.status}`;
  }
  return `Request failed with status ${response.status}`;
}

export async function transcribeAudio(
  blob: Blob,
  language = "en"
): Promise<VoiceTranscriptionResponse> {
  const form = new FormData();
  form.append("file", blob, "voice.webm");
  form.append("language", language);

  const response = await fetch(`${BASE_URL}/api/voice/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new ApiRequestError(await parseVoiceError(response), response.status);
  }
  return (await response.json()) as VoiceTranscriptionResponse;
}

export async function queryVoiceAgent(
  request: VoiceQueryRequest
): Promise<VoiceQueryResponse> {
  const response = await fetch(`${BASE_URL}/api/voice/query`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new ApiRequestError(await parseVoiceError(response), response.status);
  }
  return (await response.json()) as VoiceQueryResponse;
}

export async function speakText(text: string, language = "en"): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/api/voice/speak`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  if (!response.ok) {
    throw new ApiRequestError(await parseVoiceError(response), response.status);
  }
  return await response.blob();
}

export function createVoiceSocket(
  onMessage: (message: VoiceStreamMessage) => void,
  onError: (message: string) => void
): WebSocket {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/voice/stream";
  url.search = "";
  const socket = new WebSocket(url.toString());
  socket.onmessage = (event: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(event.data) as VoiceStreamMessage);
    } catch {
      onError("Received an invalid voice stream message.");
    }
  };
  socket.onerror = () => onError("Voice WebSocket connection failed.");
  return socket;
}

export async function playAudioBlob(blob: Blob): Promise<void> {
  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  await audioContext.resume();
  source.start();
  await new Promise<void>((resolve) => {
    source.onended = () => {
      void audioContext.close();
      resolve();
    };
  });
}

export class BufferedAudioPlayer {
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;

  async play(blob: Blob, onEnded?: () => void): Promise<void> {
    this.stop();
    this.audioContext = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
    this.source = this.audioContext.createBufferSource();
    this.source.buffer = audioBuffer;
    this.source.connect(this.audioContext.destination);
    this.source.onended = () => {
      this.cleanup();
      onEnded?.();
    };
    await this.audioContext.resume();
    this.source.start();
  }

  stop(): void {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
      } catch {
        // ignore
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.source = null;
    void this.audioContext?.close();
    this.audioContext = null;
  }
}

export function base64ToBlob(base64: string, contentType = "audio/mpeg"): Blob {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frameId: number | null = null;
  private chunks: Blob[] = [];
  private silenceStartedAt: number | null = null;
  private stopResolver: ((blob: Blob) => void) | null = null;
  private hasSpoken = false;

  constructor(
    private readonly onAutoStop?: (blob: Blob, wasSilent: boolean) => void
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);

    this.chunks = [];
    const mimeType = pickMimeType();
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start(250);
    this.watchSilence();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this.stopResolver = resolve;
      if (!this.recorder || this.recorder.state === "inactive") {
        resolve(new Blob(this.chunks, { type: "audio/webm" }));
        this.cleanup();
        return;
      }
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: this.recorder?.mimeType || "audio/webm",
        });
        this.cleanup();
        this.stopResolver?.(blob);
      };
      this.recorder.stop();
    });
  }

  private watchSilence(): void {
    if (!this.analyser || !this.recorder || this.recorder.state !== "recording") {
      return;
    }
    const samples = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(samples);
    let total = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      total += normalized * normalized;
    }
    const rms = Math.sqrt(total / samples.length);
    const now = performance.now();

    if (rms >= SILENCE_THRESHOLD) {
      this.hasSpoken = true;
      this.silenceStartedAt = null;
    }

    if (rms < SILENCE_THRESHOLD) {
      if (this.silenceStartedAt === null) this.silenceStartedAt = now;

      const timeout = this.hasSpoken ? SILENCE_MS : 6000; // 1.5 seconds if they spoke, 6 seconds if they haven't spoken yet
      if (now - this.silenceStartedAt > timeout) {
        const wasSilent = !this.hasSpoken;
        void this.stop().then((blob) => {
          this.onAutoStop?.(blob, wasSilent);
        });
        return;
      }
    } else {
      this.silenceStartedAt = null;
    }
    this.frameId = window.requestAnimationFrame(() => this.watchSilence());
  }

  private cleanup(): void {
    if (this.frameId !== null) window.cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.recorder = null;
    this.silenceStartedAt = null;
    this.hasSpoken = false;
  }
}

function pickMimeType(): string {
  const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return preferred.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}
