/** Badge showing which backend produced a given prediction. */
import { BrainCircuit, Sparkles, Wand2 } from "lucide-react";
import type { PredictionSource } from "../types";

interface SourceBadgeProps {
  source: PredictionSource;
  size?: "sm" | "md";
}

const LABELS: Record<
  PredictionSource,
  { label: string; icon: typeof Sparkles; accent: string; shadow: string }
> = {
  ai_vision: {
    label: "AI Vision",
    icon: Sparkles,
    accent:
      "from-neon-purple/20 to-neon-pink/20 text-neon-purple border-neon-purple/30",
    shadow: "rgba(139, 92, 246, 0.12)",
  },
  custom_model: {
    label: "Custom Model",
    icon: BrainCircuit,
    accent:
      "from-emerald-500/15 to-teal-400/15 text-emerald-200 border-emerald-400/30",
    shadow: "rgba(16, 185, 129, 0.12)",
  },
  clip_zero_shot: {
    label: "CLIP Zero-shot",
    icon: Wand2,
    accent:
      "from-neon-cyan/15 to-blue-500/15 text-neon-cyan border-neon-cyan/30",
    shadow: "rgba(6, 182, 212, 0.12)",
  },
};

export default function SourceBadge({ source, size = "md" }: SourceBadgeProps) {
  const meta = LABELS[source] ?? LABELS.custom_model;
  const Icon = meta.icon;
  const paddingClass =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] bg-gradient-to-r font-bold ${paddingClass} ${meta.accent}`}
      style={
        size === "md"
          ? { boxShadow: `2px 2px 0px ${meta.shadow}` }
          : undefined
      }
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
