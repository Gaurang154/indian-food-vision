/** Animated loading indicator shown while a prediction is in flight. */
import { motion } from "framer-motion";

export default function LoadingSpinner() {
  return (
    <div className="glass glow-border flex min-h-[360px] flex-col items-center justify-center gap-6 rounded-3xl p-10 text-center">
      <div className="relative h-16 w-16">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent-purple"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
        />
        <motion.span
          className="absolute inset-2 rounded-full border-2 border-transparent border-b-accent-pink"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        />
        <span className="absolute inset-5 rounded-full bg-gradient-to-br from-accent-purple via-accent-pink to-accent-cyan opacity-80 blur-sm" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold text-white">
          Analysing plate…
        </p>
        <p className="mt-1 text-sm text-white/50">
          Running local classifier{" "}
          <span className="text-white/80">·</span> CLIP fallback{" "}
          <span className="text-white/80">·</span> AI vision
        </p>
      </div>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="shimmer h-full rounded-full" />
      </div>
    </div>
  );
}
