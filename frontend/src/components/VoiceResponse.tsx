import { motion } from "framer-motion";
import { RotateCcw, Square } from "lucide-react";
import type { VoiceNutritionSummary } from "../types";

interface VoiceResponseProps {
  transcript: string;
  response: string;
  isPlaying: boolean;
  canReplay: boolean;
  onStop: () => void;
  onReplay: () => void;
  nutrition?: VoiceNutritionSummary | null;
}

const bars = [18, 32, 24, 42, 28, 36, 20, 46, 30, 24, 38, 22];

export default function VoiceResponse({
  transcript,
  response,
  isPlaying,
  canReplay,
  onStop,
  onReplay,
  nutrition,
}: VoiceResponseProps) {
  if (!transcript && !response) return null;

  return (
    <div className="mt-4 rounded-2xl border-[3px] border-black bg-white/75 p-4" style={{ boxShadow: "4px 4px 0px #000" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-14 flex-1 items-center gap-1.5 overflow-hidden rounded-xl border-2 border-black bg-black px-3">
          {bars.map((height, index) => (
            <motion.span
              key={`${height}-${index}`}
              className="w-full min-w-[5px] rounded-full bg-brutal-lime"
              animate={{ height: isPlaying ? [8, height, 10] : 10 }}
              transition={{
                duration: 0.65 + index * 0.03,
                repeat: isPlaying ? Infinity : 0,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={isPlaying ? onStop : onReplay}
          disabled={!isPlaying && !canReplay}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-[3px] border-black bg-brutal-gold text-black transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ boxShadow: "3px 3px 0px #000" }}
          aria-label={isPlaying ? "Stop voice response" : "Replay voice response"}
          title={isPlaying ? "Stop" : "Replay"}
        >
          {isPlaying ? <Square className="h-4 w-4 fill-current" /> : <RotateCcw className="h-4 w-4" />}
        </button>
      </div>

      {transcript && (
        <p className="mt-3 text-xs font-bold uppercase tracking-wider text-gray-400">
          You said: <span className="normal-case tracking-normal text-gray-700">{transcript}</span>
        </p>
      )}
      {response && <p className="mt-2 text-sm font-semibold leading-6 text-gray-800">{response}</p>}

      {nutrition && (
        <div className="mt-4 rounded-xl border-[3px] border-black bg-white p-4" style={{ boxShadow: "4px 4px 0px #000" }}>
          <div className="mb-3 flex items-center justify-between border-b-2 border-black pb-2">
            <div>
              <h3 className="font-display text-sm font-extrabold text-gray-950">{nutrition.dish_name}</h3>
              <p className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Estimated per {Math.round(nutrition.serving_grams)}g</p>
            </div>
            <div className="text-right">
              <span className="font-display text-xl font-extrabold text-gray-950">{Math.round(nutrition.calories)}</span>
              <span className="ml-0.5 text-[10px] font-bold text-gray-500">kcal</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex flex-col gap-0.5 rounded-lg border-2 border-black p-2" style={{ background: "rgba(254,156,232,0.25)", boxShadow: "2px 2px 0px #000" }}>
              <span className="text-[8px] font-extrabold uppercase tracking-widest text-gray-500">Protein</span>
              <span className="font-display text-sm font-extrabold text-gray-900">{nutrition.protein_g.toFixed(1)}g</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border-2 border-black p-2" style={{ background: "rgba(205,247,126,0.3)", boxShadow: "2px 2px 0px #000" }}>
              <span className="text-[8px] font-extrabold uppercase tracking-widest text-gray-500">Carbs</span>
              <span className="font-display text-sm font-extrabold text-gray-900">{nutrition.carbs_g.toFixed(1)}g</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg border-2 border-black p-2" style={{ background: "rgba(247,203,70,0.3)", boxShadow: "2px 2px 0px #000" }}>
              <span className="text-[8px] font-extrabold uppercase tracking-widest text-gray-500">Fat</span>
              <span className="font-display text-sm font-extrabold text-gray-900">{nutrition.fat_g.toFixed(1)}g</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
