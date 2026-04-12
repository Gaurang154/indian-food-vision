import { AnimatePresence, motion } from "framer-motion";
import { Flame, History, Trash2, X } from "lucide-react";
import type { HistoryEntry } from "../types";

interface HistoryDrawerProps { open: boolean; entries: HistoryEntry[]; onClose: () => void; onSelect: (e: HistoryEntry) => void; onDelete: (id: string) => void; onClear: () => void; }

export default function HistoryDrawer({ open, entries, onClose, onSelect, onDelete, onClear }: HistoryDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
          <motion.aside key="drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 280, damping: 32 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l-[3px] border-black bg-cream-100/95 backdrop-blur-2xl" style={{ boxShadow: "-6px 0 20px rgba(0,0,0,0.1)" }}>
            <header className="flex items-center justify-between border-b-[3px] border-black px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-black bg-brutal-pink/30" style={{ boxShadow: "3px 3px 0px #000" }}>
                  <History className="h-5 w-5 text-gray-800" />
                </div>
                <div>
                  <p className="font-display text-lg font-extrabold text-gray-900">Scan history</p>
                  <p className="text-xs font-bold text-gray-400">{entries.length} {entries.length === 1 ? "scan" : "scans"} · stored locally</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-xl border-[3px] border-black bg-white p-2 text-gray-600 transition-all duration-150 hover:bg-gray-100 active:translate-x-[2px] active:translate-y-[2px] cursor-pointer" style={{ boxShadow: "2px 2px 0px #000" }} aria-label="Close history">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 scroll-fade">
              {entries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-gray-400">
                  <History className="h-10 w-10 text-gray-300" /><p className="font-extrabold text-gray-500">No scans yet</p><p className="text-xs">Upload or capture an image to build your history.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {entries.map((entry, idx) => (
                    <motion.li key={entry.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}>
                      <button onClick={() => onSelect(entry)}
                        className="group flex w-full items-center gap-3 rounded-2xl border-[3px] border-black bg-white/70 p-3 text-left backdrop-blur-xl transition-all duration-200 hover:bg-white hover:-translate-y-px cursor-pointer"
                        style={{ boxShadow: "3px 3px 0px #000" }}>
                        <img src={entry.imageDataUrl} alt={entry.response.primary.dish_name} className="h-16 w-16 flex-shrink-0 rounded-xl border-2 border-black object-cover" />
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate font-display text-sm font-extrabold text-gray-900">{entry.response.primary.dish_name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
                            <Flame className="h-3 w-3 text-brutal-gold" />
                            {entry.response.nutrition ? `${Math.round(entry.response.nutrition.total.calories)} kcal total` : "no nutrition"}
                            <span className="text-gray-300">·</span>{Math.round(entry.response.primary.confidence * 100)}%
                          </p>
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{formatTime(entry.timestamp)}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
                          className="rounded-lg border-2 border-gray-200 p-1.5 text-gray-400 opacity-0 transition-all duration-150 hover:border-red-400 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 active:translate-x-px active:translate-y-px cursor-pointer" aria-label="Delete entry">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </button>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>

            {entries.length > 0 && (
              <footer className="border-t-[3px] border-black p-5">
                <button onClick={onClear}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-[3px] border-red-400 bg-red-50 py-2.5 text-sm font-extrabold text-red-600 transition-all duration-150 hover:bg-red-100 hover:-translate-y-px active:translate-y-[3px] cursor-pointer"
                  style={{ boxShadow: "4px 4px 0px #000" }}>
                  <Trash2 className="h-4 w-4" />Clear all history
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
  const diffMin = Math.round((Date.now() - ts) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
