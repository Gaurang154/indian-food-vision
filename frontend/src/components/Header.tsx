/** Top navigation bar with brand mark and history toggle. */
import { History, Utensils } from "lucide-react";

interface HeaderProps {
  historyCount: number;
  onOpenHistory: () => void;
}

export default function Header({ historyCount, onOpenHistory }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-white/[0.06] bg-void-900/70 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div
            className="relative flex h-11 w-11 items-center justify-center rounded-xl border-2 border-white/20 bg-gradient-to-br from-neon-purple via-neon-pink to-neon-cyan"
            style={{ boxShadow: "4px 4px 0px rgba(139, 92, 246, 0.3)" }}
          >
            <Utensils className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-base font-bold tracking-wide text-white">
              Indian Food Vision AI
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/40">
              Nutrition · Recognition · Real-time
            </p>
          </div>
        </div>

        <button
          onClick={onOpenHistory}
          className="relative hidden items-center gap-2 rounded-xl border-2 border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white/80 transition-all duration-150 hover:border-white/20 hover:bg-white/[0.08] hover:-translate-x-px hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] lg:inline-flex"
          style={{ boxShadow: "3px 3px 0px rgba(139, 92, 246, 0.2)" }}
          aria-label="Open scan history"
        >
          <History className="h-4 w-4" />
          History
          {historyCount > 0 && (
            <span className="ml-1 rounded-full border-[1.5px] border-neon-purple/40 bg-neon-purple/20 px-2 py-0.5 text-[11px] font-bold text-neon-purple">
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
