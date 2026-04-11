/** Top navigation bar with brand mark and history toggle. */
import { History, Utensils } from "lucide-react";

interface HeaderProps {
  historyCount: number;
  onOpenHistory: () => void;
}

export default function Header({ historyCount, onOpenHistory }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-void-900/60 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-purple via-accent-pink to-accent-cyan shadow-glow">
            <Utensils className="h-5 w-5 text-white" />
            <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold tracking-wide text-white">
              Indian Food Vision AI
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              Nutrition · Recognition · Real-time
            </p>
          </div>
        </div>

        <button
          onClick={onOpenHistory}
          className="relative hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white/80 transition-all hover:border-white/20 hover:bg-white/[0.08] lg:inline-flex"
          aria-label="Open scan history"
        >
          <History className="h-4 w-4" />
          History
          {historyCount > 0 && (
            <span className="ml-1 rounded-full bg-accent-purple/30 px-2 py-0.5 text-[11px] font-semibold text-accent-purple">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
