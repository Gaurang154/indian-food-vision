/** Badge showing which backend produced a given prediction. */
import { BrainCircuit, Sparkles, Wand2 } from "lucide-react";
import type { PredictionSource } from "../types";

interface SourceBadgeProps {
  source: PredictionSource;
  size?: "sm" | "md";
}

const LABELS: Record<PredictionSource, { label: string; icon: typeof Sparkles; accent: string }> = {
  ai_vision: {
    label: "AI Vision",
    icon: Sparkles,
    accent: "from-accent-purple/25 to-accent-pink/25 text-accent-purple border-accent-purple/30",
  },
  custom_model: {
    label: "Custom Model",
    icon: BrainCircuit,
    accent: "from-emerald-500/20 to-teal-400/20 text-emerald-200 border-emerald-400/30",
  },
  clip_zero_shot: {
    label: "CLIP Zero-shot",
    icon: Wand2,
    accent: "from-accent-cyan/20 to-blue-500/20 text-accent-cyan border-accent-cyan/30",
  },
};

export default function SourceBadge({ source, size = "md" }: SourceBadgeProps) {
  const meta = LABELS[source] ?? LABELS.custom_model;
  const Icon = meta.icon;
  const paddingClass = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-gradient-to-r font-medium ${paddingClass} ${meta.accent}`}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
