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
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold uppercase tracking-wide ${textClass} ${style.border} ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {percent}% confidence
    </span>
  );
}

function bandForScore(score: number) {
  if (score >= 0.85) {
    return {
      border: "border-emerald-400/30",
      bg: "bg-emerald-500/10",
      text: "text-emerald-200",
      dot: "bg-emerald-400",
    };
  }
  if (score >= 0.6) {
    return {
      border: "border-accent-purple/40",
      bg: "bg-accent-purple/10",
      text: "text-accent-purple",
      dot: "bg-accent-purple",
    };
  }
  if (score >= 0.35) {
    return {
      border: "border-amber-400/30",
      bg: "bg-amber-500/10",
      text: "text-amber-200",
      dot: "bg-amber-400",
    };
  }
  return {
    border: "border-rose-400/30",
    bg: "bg-rose-500/10",
    text: "text-rose-200",
    dot: "bg-rose-400",
  };
}
