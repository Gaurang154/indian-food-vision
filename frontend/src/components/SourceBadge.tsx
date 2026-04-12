import { BrainCircuit, Sparkles, Wand2 } from "lucide-react";
import type { PredictionSource } from "../types";

interface SourceBadgeProps { source: PredictionSource; size?: "sm" | "md"; }

const LABELS: Record<PredictionSource, { label: string; icon: typeof Sparkles; bg: string }> = {
  ai_vision: { label: "AI Vision", icon: Sparkles, bg: "bg-brutal-pink/30" },
  custom_model: { label: "Custom Model", icon: BrainCircuit, bg: "bg-brutal-green/30" },
  clip_zero_shot: { label: "CLIP Zero-shot", icon: Wand2, bg: "bg-brutal-lime/35" },
};

export default function SourceBadge({ source, size = "md" }: SourceBadgeProps) {
  const m = LABELS[source] ?? LABELS.custom_model;
  const Icon = m.icon;
  const pad = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 border-black font-extrabold text-gray-900 ${pad} ${m.bg}`}
      style={size === "md" ? { boxShadow: "2px 2px 0px #000" } : undefined}>
      <Icon className="h-3 w-3" />{m.label}
    </span>
  );
}
