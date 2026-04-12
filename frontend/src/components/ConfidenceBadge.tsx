/** Confidence indicator — gradient colour scales with score. */
interface ConfidenceBadgeProps {
  confidence: number;
  size?: "sm" | "md";
}

export default function ConfidenceBadge({
  confidence,
  size = "md",
}: ConfidenceBadgeProps) {
  const percent = Math.round(confidence * 100);
  const style = bandForScore(confidence);
  const textClass = size === "sm" ? "text-[11px]" : "text-xs";
  const shadowStyle =
    size === "md"
      ? { boxShadow: `2px 2px 0px ${style.shadow}` }
      : undefined;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 font-bold uppercase tracking-wide ${textClass} ${style.border} ${style.bg} ${style.text}`}
      style={shadowStyle}
    >
      <span className={`h-2 w-2 rounded-sm ${style.dot}`} />
      {percent}% confidence
    </span>
  );
}

function bandForScore(score: number) {
  if (score >= 0.85) {
    return {
      border: "border-emerald-400/40",
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
      dot: "bg-emerald-400",
      shadow: "rgba(16, 185, 129, 0.15)",
    };
  }
  if (score >= 0.6) {
    return {
      border: "border-neon-purple/40",
      bg: "bg-neon-purple/10",
      text: "text-neon-purple",
      dot: "bg-neon-purple",
      shadow: "rgba(139, 92, 246, 0.15)",
    };
  }
  if (score >= 0.35) {
    return {
      border: "border-amber-400/40",
      bg: "bg-amber-500/10",
      text: "text-amber-200",
      dot: "bg-amber-400",
      shadow: "rgba(245, 158, 11, 0.15)",
    };
  }
  return {
    border: "border-rose-400/40",
    bg: "bg-rose-500/10",
    text: "text-rose-200",
    dot: "bg-rose-400",
    shadow: "rgba(244, 63, 94, 0.15)",
  };
}
