import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Send, Volume2 } from "lucide-react";

import VoiceResponse from "./VoiceResponse";
import {
  base64ToBlob,
  BufferedAudioPlayer,
  createVoiceSocket,
  transcribeAudio,
  VoiceRecorder,
} from "../lib/voice";
import type { PredictionResponse, VoiceNutritionSummary, VoicePageContext, VoiceStreamMessage } from "../types";

type VoiceStatus = "idle" | "listening" | "thinking" | "speaking" | "error";

interface VoiceButtonProps {
  imageUrl?: string | null;
  result?: PredictionResponse | null;
}

export default function VoiceButton({ imageUrl, result }: VoiceButtonProps) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAudio, setLastAudio] = useState<Blob | null>(null);
  const [nutrition, setNutrition] = useState<VoiceNutritionSummary | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const playerRef = useRef(new BufferedAudioPlayer());
  const startRecordingRef = useRef<() => Promise<void>>();

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      playerRef.current.stop();
    };
  }, []);

  const playBlob = useCallback(async (blob: Blob) => {
    setLastAudio(blob);
    setStatus("speaking");
    await playerRef.current.play(blob, () => {
      void startRecordingRef.current?.();
    });
  }, []);

  const handleStreamMessage = useCallback(
    (message: VoiceStreamMessage) => {
      if (message.type === "text_chunk") {
        setAssistantText((prev) => `${prev}${prev ? " " : ""}${message.content}`);
      } else if (message.type === "audio_chunk") {
        const blob = base64ToBlob(message.data);
        void playBlob(blob);
      } else if (message.type === "done") {
        if (message.session_id) sessionIdRef.current = message.session_id;
        if (message.nutrition) {
          setNutrition(message.nutrition);
        }
        setStatus((current) => (current === "thinking" ? "idle" : current));
      } else if (message.type === "error" || message.type === "audio_error") {
        setError(message.message);
        setStatus("error");
      }
    },
    [playBlob]
  );

  const sendTranscript = useCallback(
    (text: string) => {
      setAssistantText("");
      setNutrition(null);
      setError(null);
      setStatus("thinking");
      socketRef.current?.close();
      const socket = createVoiceSocket(handleStreamMessage, (message) => {
        setError(message);
        setStatus("error");
      });
      socketRef.current = socket;
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "text",
            content: text,
            session_id: sessionIdRef.current,
            language: "en",
            image_url: imageUrl || undefined,
            page_context: buildPageContext(result),
          })
        );
      };
      socket.onclose = () => {
        socketRef.current = null;
      };
    },
    [handleStreamMessage, imageUrl, result]
  );

  const processAudio = useCallback(
    async (blob: Blob) => {
      if (blob.size < 512) {
        setError("I did not catch enough audio. Try speaking a little closer to the mic.");
        setStatus("error");
        return;
      }
      try {
        setStatus("thinking");
        const result = await transcribeAudio(blob, "en");
        setTranscript(result.text);
        sendTranscript(result.text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not process voice input.");
        setStatus("error");
      }
    },
    [sendTranscript]
  );

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    setAssistantText("");
    setNutrition(null);
    playerRef.current.stop();
    setLastAudio(null);
    const recorder = new VoiceRecorder((blob, wasSilent) => {
      recorderRef.current = null;
      if (wasSilent) {
        setStatus("idle");
      } else {
        void processAudio(blob);
      }
    });
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setStatus("listening");
    } catch (err) {
      recorderRef.current = null;
      setError(err instanceof Error ? err.message : "Microphone permission was not granted.");
      setStatus("error");
    }
  }, [processAudio]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    const blob = await recorder.stop();
    await processAudio(blob);
  }, [processAudio]);

  const handlePrimaryClick = useCallback(() => {
    if (status === "listening") void stopRecording();
    else void startRecording();
  }, [startRecording, status, stopRecording]);

  const handleStopPlayback = useCallback(() => {
    playerRef.current.stop();
    setStatus("idle");
  }, []);

  const handleReplay = useCallback(() => {
    if (lastAudio) void playBlob(lastAudio);
  }, [lastAudio, playBlob]);

  const label = status === "listening" ? "Listening" : status === "thinking" ? "Thinking" : status === "speaking" ? "Speaking" : "Ask DxAi Nourish";
  const disabled = status === "thinking" || status === "speaking";

  return (
    <section className="mx-auto mb-10 max-w-3xl">
      <div className="neo-card-static rounded-3xl bg-white/80 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border-2 border-black bg-brutal-lime px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-black">
              <Volume2 className="h-3.5 w-3.5" />
              DxAi Nourish
            </div>
            <h2 className="font-display text-2xl font-extrabold text-gray-950">Talk to your food assistant</h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Ask about calories, ingredients, blood sugar, Ayurveda, or the food you just scanned.
            </p>
          </div>

          <button
            type="button"
            onClick={handlePrimaryClick}
            disabled={disabled}
            className={`flex min-h-16 min-w-40 items-center justify-center gap-3 rounded-2xl border-[3px] border-black px-5 py-4 text-sm font-extrabold transition-all ${
              status === "listening"
                ? "bg-brutal-pink text-black"
                : "bg-black text-white hover:-translate-x-0.5 hover:-translate-y-0.5"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            style={{ boxShadow: status === "listening" ? "0px 0px 0px #000" : "5px 5px 0px #000" }}
            aria-label={status === "listening" ? "Stop recording" : "Start voice recording"}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={status === "listening" ? "mic-off" : "mic"}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="flex items-center gap-2"
              >
                {status === "listening" ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                {label}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>

        {status === "listening" && (
          <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Stop manually or pause for 1.5 seconds
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-700">
            <Send className="mt-0.5 h-4 w-4" />
            {error}
          </div>
        )}

        <VoiceResponse
          transcript={transcript}
          response={assistantText}
          isPlaying={status === "speaking"}
          canReplay={!!lastAudio}
          onStop={handleStopPlayback}
          onReplay={handleReplay}
          nutrition={nutrition}
        />
      </div>
    </section>
  );
}

function buildPageContext(result?: PredictionResponse | null): VoicePageContext | null {
  if (!result) return null;
  const nutrition = result.nutrition;
  return {
    dish_name: result.primary.dish_name,
    confidence: result.primary.confidence,
    source: result.primary.source,
    nutrition: nutrition
      ? {
          dish_name: result.primary.dish_name,
          serving_grams: nutrition.per_serving.serving_size_g,
          calories: nutrition.per_serving.calories,
          protein_g: nutrition.per_serving.protein,
          carbs_g: nutrition.per_serving.carbs,
          fat_g: nutrition.per_serving.fat,
          fiber_g: 0,
          source: "current_page_scan",
        }
      : null,
    items: nutrition
      ? nutrition.items.map((item) => ({
          name: item.name,
          portion_g: item.portion_g,
          calories: item.nutrition.calories,
          protein_g: item.nutrition.protein,
          carbs_g: item.nutrition.carbs,
          fat_g: item.nutrition.fat,
        }))
      : [],
    alternatives: result.alternatives.map((alt) => ({
      dish_name: alt.dish_name,
      confidence: alt.confidence,
      source: alt.source,
    })),
  };
}
