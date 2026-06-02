import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Camera as CameraIcon,
  History as HistoryIcon,
  ImageUp,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";

import CameraCapture from "./components/CameraCapture";
import Header from "./components/Header";
import HistoryDrawer from "./components/HistoryDrawer";
import ImageUploader from "./components/ImageUploader";
import LoadingSpinner from "./components/LoadingSpinner";
import ResultCard from "./components/ResultCard";
import VoiceButton from "./components/VoiceButton";
import {
  ApiRequestError,
  dataUrlToFile,
  fetchHealth,
  fileToDataUrl,
  getApiBaseUrl,
  predictFood,
} from "./lib/api";
import {
  compressDataUrl,
  loadHistory,
  saveHistoryEntry,
  clearHistory as clearHistoryStore,
  deleteHistoryEntry,
} from "./lib/storage";
import type {
  HealthResponse,
  HistoryEntry,
  PredictionResponse,
} from "./types";

type Tab = "upload" | "camera";

type HealthState =
  | { status: "loading" }
  | { status: "ok"; data: HealthResponse }
  | { status: "error"; message: string };

export default function App() {
  const [tab, setTab] = useState<Tab>("upload");
  const [isPredicting, setIsPredicting] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentResult, setCurrentResult] =
    useState<PredictionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHealth();
        if (!cancelled) setHealth({ status: "ok", data });
      } catch (err) {
        if (!cancelled)
          setHealth({
            status: "error",
            message: err instanceof Error ? err.message : "Could not reach the backend.",
          });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const runPrediction = useCallback(async (file: File, previewUrl?: string) => {
    setError(null);
    setIsPredicting(true);
    setCurrentResult(null);
    try {
      const imageDataUrl = previewUrl ?? (await fileToDataUrl(file));
      setCurrentImage(imageDataUrl);
      const response = await predictFood(file);
      setCurrentResult(response);
      const thumb = await compressDataUrl(imageDataUrl);
      const entry = saveHistoryEntry(thumb, response);
      setHistory((prev) => [entry, ...prev].slice(0, 20));
    } catch (err) {
      console.error(err);
      if (err instanceof ApiRequestError) setError(err.detail ?? err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Something went wrong while analysing the image.");
    } finally {
      setIsPredicting(false);
    }
  }, []);

  const handleFile = useCallback((file: File) => { void runPrediction(file); }, [runPrediction]);

  const handleCapture = useCallback(async (dataUrl: string) => {
    try {
      const file = await dataUrlToFile(dataUrl, `capture-${Date.now()}.jpg`);
      await runPrediction(file, dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process the webcam capture.");
    }
  }, [runPrediction]);

  const handleSelectHistory = useCallback((entry: HistoryEntry) => {
    setCurrentImage(entry.imageDataUrl);
    setCurrentResult(entry.response);
    setHistoryOpen(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleDeleteHistory = useCallback((id: string) => { setHistory(deleteHistoryEntry(id)); }, []);
  const handleClearHistory = useCallback(() => { clearHistoryStore(); setHistory([]); }, []);

  const modelBadges = useMemo(() => {
    if (health.status !== "ok") return [];
    const m = health.data.models;
    return [
      { key: "custom_model", label: "Custom Model", active: !!m.custom_model },
      { key: "clip_zero_shot", label: "CLIP Zero-shot", active: !!m.clip_zero_shot },
      { key: "ai_vision", label: "AI Vision", active: !!m.ai_vision },
    ];
  }, [health]);

  return (
    <div className="relative min-h-screen overflow-x-hidden pb-24">
      {/* Grid */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)] bg-grid-fade bg-grid" />

      {/* Floating shapes */}
      <div className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
        <div className="absolute -left-12 top-28 h-36 w-36 rotate-12 rounded-2xl border-[3px] border-brutal-pink/20 opacity-40 animate-float" />
        <div className="absolute -right-8 top-56 h-28 w-28 rounded-full border-[3px] border-brutal-lime/20 opacity-35 animate-float-slow" />
        <div className="absolute left-1/4 top-16 h-16 w-16 rotate-45 border-[3px] border-brutal-gold/20 opacity-30 animate-float-delay" />
        <div className="absolute right-1/3 top-[28rem] h-14 w-14 border-[3px] border-brutal-green/15 opacity-25 animate-morph" />
      </div>

      <Header historyCount={history.length} onOpenHistory={() => setHistoryOpen(true)} />

      <main className="mx-auto w-full max-w-6xl px-5 pt-10 sm:px-8">
        {/* Hero */}
        <section className="mb-14 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border-[3px] border-black bg-brutal-lime px-5 py-2 text-xs font-extrabold uppercase tracking-wider text-black"
            style={{ boxShadow: "3px 3px 0px #000" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Powered by EfficientNet · CLIP · AI Vision
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            <span className="text-gradient">Indian Food</span>
            <br />
            <span className="text-gray-900">
              Vision <span className="text-highlight">AI</span>
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mx-auto mt-5 max-w-2xl text-base text-gray-500 sm:text-lg"
          >
            Snap or upload a plate of food and get instant dish recognition,
            confidence scores, and a full macro-nutrition breakdown — optimised
            for Indian cuisine.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-2"
          >
            {health.status === "loading" ? (
              <span className="badge"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />Connecting…</span>
            ) : health.status === "error" ? (
              <span className="badge border-red-400 bg-red-50 text-red-600"><WifiOff className="h-3.5 w-3.5" />Offline — {health.message}</span>
            ) : (
              <>
                <span className="badge border-black bg-brutal-green/30 text-gray-900" style={{ boxShadow: "2px 2px 0px #000" }}>
                  <Wifi className="h-3.5 w-3.5" />Backend online · v{health.data.version}
                </span>
                {modelBadges.map((b) => (
                  <span key={b.key}
                    className={`badge ${b.active ? "border-black bg-brutal-pink/25 text-gray-900" : "border-gray-300 text-gray-400"}`}
                    style={b.active ? { boxShadow: "2px 2px 0px #000" } : undefined}
                  >
                    <span className={`h-1.5 w-1.5 rounded-sm ${b.active ? "bg-brutal-pink" : "bg-gray-300"}`} />
                    {b.label}
                  </span>
                ))}
              </>
            )}
          </motion.div>
        </section>

        <VoiceButton imageUrl={currentImage} result={currentResult} />

        {/* Tabs — polymorphic: active = black fill, white text */}
        <section className="mb-6 flex justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.22 }}
            className="inline-flex items-center gap-1 rounded-full border-[3px] border-black bg-white p-1.5 text-sm font-extrabold"
            style={{ boxShadow: "4px 4px 0px #000" }}
          >
            <button
              onClick={() => setTab("upload")}
              className={`flex items-center gap-2 rounded-full px-6 py-2.5 transition-all duration-200 cursor-pointer ${
                tab === "upload"
                  ? "bg-black text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <ImageUp className="h-4 w-4" />Upload
            </button>
            <button
              onClick={() => setTab("camera")}
              className={`flex items-center gap-2 rounded-full px-6 py-2.5 transition-all duration-200 cursor-pointer ${
                tab === "camera"
                  ? "bg-black text-white"
                  : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <CameraIcon className="h-4 w-4" />Camera
            </button>
          </motion.div>
        </section>

        {/* Grid */}
        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {tab === "upload" ? (
                <motion.div key="upload" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                  <ImageUploader disabled={isPredicting} onSelect={handleFile} />
                </motion.div>
              ) : (
                <motion.div key="camera" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.97 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
                  <CameraCapture disabled={isPredicting} onCapture={handleCapture} />
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-start gap-3 rounded-2xl border-[3px] border-red-400 bg-red-50 p-4 text-sm text-red-700"
                style={{ boxShadow: "4px 4px 0px #000" }}>
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div><p className="font-extrabold">Prediction failed</p><p className="mt-0.5 text-red-600">{error}</p></div>
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {isPredicting ? (
                <motion.div key="loading" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }}>
                  <LoadingSpinner />
                </motion.div>
              ) : currentResult && currentImage ? (
                <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.3 }}>
                  <ResultCard image={currentImage} response={currentResult} />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                  <EmptyState />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <footer className="mt-20 flex flex-col items-center gap-2 text-xs text-gray-400">
          <p>API · <span className="font-mono font-bold text-gray-500">{getApiBaseUrl()}</span></p>
          <p>Built with FastAPI · PyTorch · CLIP · Vision LLM · React · Vite · Tailwind</p>
        </footer>
      </main>

      <HistoryDrawer open={historyOpen} entries={history} onClose={() => setHistoryOpen(false)} onSelect={handleSelectHistory} onDelete={handleDeleteHistory} onClear={handleClearHistory} />

      <button
        onClick={() => setHistoryOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-xl border-[3px] border-black bg-white px-4 py-3 text-sm font-extrabold text-gray-800 transition-all duration-150 hover:-translate-x-[2px] hover:-translate-y-[2px] active:translate-x-[3px] active:translate-y-[3px] lg:hidden cursor-pointer"
        style={{ boxShadow: "4px 4px 0px #000" }}
        aria-label="Open history drawer"
      >
        <HistoryIcon className="h-4 w-4" />
        {history.length > 0 && (
          <span className="rounded-full border-2 border-black bg-brutal-pink px-2.5 py-0.5 text-xs font-extrabold text-black">{history.length}</span>
        )}
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="neo-card-static flex h-full min-h-[360px] flex-col items-center justify-center rounded-3xl p-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-[3px] border-black bg-brutal-pink/30" style={{ boxShadow: "3px 3px 0px #000" }}>
        <Sparkles className="h-7 w-7 text-gray-800" />
      </div>
      <h3 className="font-display text-xl font-extrabold text-gray-900">Ready when you are</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500">Drop a food image on the left or use the camera tab to see real-time dish recognition and a full macro-nutrition breakdown.</p>
    </div>
  );
}
