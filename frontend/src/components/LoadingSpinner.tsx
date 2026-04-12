import { motion } from "framer-motion";

export default function LoadingSpinner() {
  return (
    <div className="neo-card-static flex min-h-[360px] flex-col items-center justify-center gap-6 rounded-3xl p-10 text-center">
      <div className="relative h-24 w-24">
        <motion.span className="absolute inset-0 rounded-xl border-[3px] border-brutal-pink" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3.5, ease: "linear" }} style={{ boxShadow: "3px 3px 0px #000" }} />
        <motion.span className="absolute inset-4 rounded-full border-[3px] border-brutal-lime" animate={{ rotate: -360 }} transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }} />
        <motion.span className="absolute inset-8 rotate-45 rounded-sm border-[3px] border-brutal-gold" animate={{ rotate: [45, 405] }} transition={{ repeat: Infinity, duration: 4, ease: "linear" }} />
        <span className="absolute inset-9 rounded-full bg-gradient-to-br from-brutal-pink via-brutal-lime to-brutal-gold opacity-50 blur-sm" />
      </div>
      <div>
        <p className="font-display text-lg font-extrabold text-gray-900">Analysing plate…</p>
        <p className="mt-1 text-sm text-gray-500">Running local classifier <span className="font-extrabold text-brutal-pink">·</span> CLIP fallback <span className="font-extrabold text-brutal-lime">·</span> AI vision</p>
      </div>
      <div className="h-2.5 w-56 overflow-hidden rounded-full border-[3px] border-black bg-gray-100" style={{ boxShadow: "3px 3px 0px #000" }}>
        <div className="shimmer h-full rounded-full" />
      </div>
    </div>
  );
}
