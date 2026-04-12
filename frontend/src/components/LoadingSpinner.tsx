/** Animated loading indicator shown while a prediction is in flight. */
import { motion } from "framer-motion";

export default function LoadingSpinner() {
  return (
    <div className="neo-card-static glow-border flex min-h-[360px] flex-col items-center justify-center gap-6 rounded-3xl p-10 text-center">
      <div className="relative h-20 w-20">
        {/* Outer rotating square (neo-brutal geometric) */}
        <motion.span
          className="absolute inset-0 rounded-xl border-2 border-neon-purple/60"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
          style={{ boxShadow: "3px 3px 0px rgba(139, 92, 246, 0.2)" }}
        />
        {/* Inner rotating circle */}
        <motion.span
          className="absolute inset-3 rounded-full border-2 border-neon-pink/50"
          animate={{ rotate: -360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
        />
        {/* Center diamond */}
        <motion.span
          className="absolute inset-6 rotate-45 rounded-sm border-2 border-neon-cyan/40"
          animate={{ rotate: [45, 405] }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
        />
        {/* Center glow */}
        <span className="absolute inset-7 rounded-full bg-gradient-to-br from-neon-purple via-neon-pink to-neon-cyan opacity-70 blur-sm" />
      </div>
      <div>
        <p className="font-display text-lg font-bold text-white">
          Analysing plate…
        </p>
        <p className="mt-1 text-sm text-white/50">
          Running local classifier{" "}
          <span className="font-bold text-neon-purple/80">·</span> CLIP
          fallback{" "}
          <span className="font-bold text-neon-pink/80">·</span> AI vision
        </p>
      </div>
      <div
        className="h-2 w-56 overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.04]"
        style={{ boxShadow: "3px 3px 0px rgba(0,0,0,0.15)" }}
      >
        <div className="shimmer h-full rounded-full" />
      </div>
    </div>
  );
}
