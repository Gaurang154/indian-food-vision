/** Right-side slide-out drawer showing past scans. */
import { AnimatePresence, motion } from "framer-motion";
import { Flame, History, Trash2, X } from "lucide-react";
import type { HistoryEntry } from "../types";

interface HistoryDrawerProps {
  open: boolean;
  entries: HistoryEntry[];
  onClose: () => void;
  onSelect: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export default function HistoryDrawer({
  open,
  entries,
  onClose,
  onSelect,
  onDelete,
  onClear,
}: HistoryDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-void-900/95 backdrop-blur-2xl"
          >
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-purple/30 via-accent-pink/20 to-accent-cyan/20">
                  <History className="h-5 w-5 text-accent-purple" />
                </div>
                <div>
                  <p className="font-display text-lg font-semibold text-white">
                    Scan history
                  </p>
                  <p className="text-xs text-white/40">
                    {entries.length}{" "}
                    {entries.length === 1 ? "scan" : "scans"} · stored locally
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:border-white/20 hover:bg-white/10"
                aria-label="Close history"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 scroll-fade">
              {entries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-white/40">
                  <History className="h-10 w-10 text-white/20" />
                  <p className="font-medium text-white/60">No scans yet</p>
                  <p className="text-xs">
                    Upload or capture an image to build your history.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        onClick={() => onSelect(entry)}
                        className="glass group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all hover:border-white/20 hover:bg-white/[0.06]"
                      >
                        <img
                          src={entry.imageDataUrl}
                          alt={entry.response.primary.dish_name}
                          className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                        />
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate font-display text-sm font-semibold text-white">
                            {entry.response.primary.dish_name}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/50">
                            <Flame className="h-3 w-3 text-accent-pink" />
                            {entry.response.nutrition
                              ? `${Math.round(
                                  entry.response.nutrition.total.calories
                                )} kcal total`
                              : "no nutrition"}
                            <span className="text-white/20">·</span>
                            {Math.round(entry.response.primary.confidence * 100)}%
                          </p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/30">
                            {formatTime(entry.timestamp)}
                          </p>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(entry.id);
                          }}
                          className="rounded-lg border border-white/10 p-1.5 text-white/50 opacity-0 transition-opacity hover:border-red-400/40 hover:text-red-300 group-hover:opacity-100"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {entries.length > 0 && (
              <footer className="border-t border-white/10 p-5">
                <button
                  onClick={onClear}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 py-2.5 text-sm font-medium text-red-200 transition-colors hover:border-red-400/50 hover:bg-red-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear all history
                </button>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - ts;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
