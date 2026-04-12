import { History, Utensils } from "lucide-react";

interface HeaderProps {
  historyCount: number;
  onOpenHistory: () => void;
}

export default function Header({ historyCount, onOpenHistory }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b-[3px] border-black bg-cream-100/80 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl border-[3px] border-black bg-gradient-to-br from-brutal-pink via-brutal-gold to-brutal-lime"
            style={{ boxShadow: "3px 3px 0px #000" }}
          >
            <Utensils className="h-5 w-5 text-black" />
          </div>
          <div className="leading-tight">
            <p className="font-display text-base font-extrabold text-gray-900">
              Indian Food Vision AI
            </p>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
              Nutrition · Recognition · Real-time
            </p>
          </div>
        </div>

        <button
          onClick={onOpenHistory}
          className="relative hidden items-center gap-2 rounded-xl border-[3px] border-black bg-white px-4 py-2.5 text-sm font-extrabold text-gray-800 transition-all duration-150 hover:-translate-x-[2px] hover:-translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] lg:inline-flex cursor-pointer"
          style={{ boxShadow: "3px 3px 0px #000" }}
          aria-label="Open scan history"
        >
          <History className="h-4 w-4" />
          History
          {historyCount > 0 && (
            <span
              className="ml-1 rounded-full border-2 border-black bg-brutal-lime px-2.5 py-0.5 text-[11px] font-extrabold text-black"
            >
              {historyCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
