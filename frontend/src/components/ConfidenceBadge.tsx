interface ConfidenceBadgeProps { confidence: number; size?: "sm" | "md"; }

export default function ConfidenceBadge({ confidence, size = "md" }: ConfidenceBadgeProps) {
  const percent = Math.round(confidence * 100);
  const b = bandForScore(confidence);
  const cls = size === "sm" ? "text-[11px]" : "text-xs";
  const shadow = size === "md" ? { boxShadow: "2px 2px 0px #000" } : undefined;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 border-black px-3 py-1 font-extrabold uppercase tracking-wide ${cls} ${b.bg} ${b.text}`} style={shadow}>
      <span className={`h-2 w-2 rounded-sm border border-black ${b.dot}`} />{percent}% confidence
    </span>
  );
}

function bandForScore(s: number) {
  if (s >= 0.85) return { bg: "bg-brutal-green/40", text: "text-gray-900", dot: "bg-brutal-green" };
  if (s >= 0.6) return { bg: "bg-brutal-pink/30", text: "text-gray-900", dot: "bg-brutal-pink" };
  if (s >= 0.35) return { bg: "bg-brutal-gold/40", text: "text-gray-900", dot: "bg-brutal-gold" };
  return { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-400" };
}
