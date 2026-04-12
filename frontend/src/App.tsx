// Root application shell. Pulls backend health on mount, drives the
// upload / camera tabs, owns the current result and the scan history.
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
  const [currentResult, setCurrentResult] = useState<PredictionResponse | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [health, setHealth] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

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
            message:
              err instanceof Error
                ? err.message
                : "Could not reach the backend.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
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
      if (err instanceof ApiRequestError) {
        setError(err.detail ?? err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong while analysing the image.");
      }
    } finally {
      setIsPredicting(false);
    }
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      void runPrediction(file);
    },
    [runPrediction]
  );

  const handleCapture = useCallback(
    async (dataUrl: string) => {
      try {
        const file = await dataUrlToFile(dataUrl, `capture-${Date.now()}.jpg`);
        await runPrediction(file, dataUrl);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not process the webcam capture."
        );
      }
    },
    [runPrediction]
  );

  const handleSelectHistory = useCallback((entry: HistoryEntry) => {
    setCurrentImage(entry.imageDataUrl);
    setCurrentResult(entry.response);
    setHistoryOpen(false);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleDeleteHistory = useCallback((id: string) => {
    const next = deleteHistoryEntry(id);
    setHistory(next);
  }, []);

  const handleClearHistory = useCallback(() => {
    clearHistoryStore();
    setHistory([]);
  }, []);

  const modelBadges = useMemo(() => {
    if (health.status !== "ok") return [];
    const models = health.data.models;
    return [
      {
        key: "custom_model",
        label: "Custom Model",
        active: !!models.custom_model,
      },
      {
        key: "clip_zero_shot",
        label: "CLIP Zero-shot",
        active: !!models.clip_zero_shot,
      },
      {
        key: "ai_vision",
        label: "AI Vision",
        active: !!models.ai_vision,
      },
    ];
  }, [health]);

  return (
    <div className="relative min-h-screen overflow-x-hidden pb-24">
      {/* Background grid overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_85%)] bg-grid-fade bg-grid" />

      {/* Floating neo-brutal geometric decorators */}
      <div className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
        <div className="absolute -left-16 top-32 h-36 w-36 rotate-12 rounded-2xl border-2 border-neon-purple/[0.08] opacity-60 animate-float" />
        <div className="absolute -right-12 top-64 h-28 w-28 rounded-full border-2 border-neon-pink/[0.07] opacity-50 animate-float-slow" />
        <div className="absolute left-1/4 top-20 h-20 w-20 rotate-45 border-2 border-neon-cyan/[0.06] opacity-40 animate-float-delay" />
        <div className="absolute right-1/3 top-96 h-14 w-14 rounded-lg border-2 border-neon-lime/[0.05] opacity-30 animate-float" />
        <div className="absolute -left-8 bottom-1/3 h-24 w-24 rotate-[30deg] rounded-xl border-2 border-neon-purple/[0.06] opacity-40 animate-float-slow" />
      </div>

      <Header
        historyCount={history.length}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <main className="mx-auto w-full max-w-6xl px-5 pt-10 sm:px-8">
        {/* Hero */}
        <section className="mb-14 text-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border-[1.5px] border-neon-purple/25 bg-neon-purple/[0.08] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white/80 backdrop-blur-xl"
            style={{ boxShadow: "3px 3px 0px rgba(139, 92, 246, 0.15)" }}
          >
            <Sparkles className="h-3.5 w-3.5 text-neon-purple" />
            Powered by EfficientNet · CLIP · AI Vision
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          >
            <span className="text-gradient">Indian Food</span>
            <br />
            <span className="text-white">
              Vision <span className="text-highlight">AI</span>
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mx-auto mt-5 max-w-2xl text-base text-white/55 sm:text-lg"
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
              <span className="badge text-white/50">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50" />
                Connecting to backend…
              </span>
            ) : health.status === "error" ? (
              <span className="badge border-red-500/30 bg-red-500/10 text-red-200">
                <WifiOff className="h-3.5 w-3.5" />
                Backend offline — {health.message}
              </span>
            ) : (
              <>
                <span
                  className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  style={{
                    boxShadow: "2px 2px 0px rgba(16, 185, 129, 0.15)",
                  }}
                >
                  <Wifi className="h-3.5 w-3.5" />
                  Backend online · v{health.data.version}
                </span>
                {modelBadges.map((badge) => (
                  <span
                    key={badge.key}
                    className={`badge ${
                      badge.active
                        ? "border-neon-purple/30 bg-neon-purple/10 text-neon-purple"
                        : "text-white/40"
                    }`}
                    style={
                      badge.active
                        ? {
                            boxShadow:
                              "2px 2px 0px rgba(139, 92, 246, 0.12)",
                          }
                        : undefined
                    }
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        badge.active ? "bg-neon-purple" : "bg-white/30"
                      }`}
                    />
                    {badge.label}
                  </span>
                ))}
              </>
            )}
          </motion.div>
        </section>

        {/* Tabs */}
        <section className="mb-6 flex justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="neo-card-static flex items-center gap-1.5 rounded-2xl p-1.5 text-sm font-bold"
          >
            <button
              onClick={() => setTab("upload")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 ${
                tab === "upload"
                  ? "border-2 border-neon-purple/30 bg-neon-purple/15 text-white shadow-brutal-sm"
                  : "border-2 border-transparent text-white/55 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <ImageUp className="h-4 w-4" />
              Upload
            </button>
            <button
              onClick={() => setTab("camera")}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 ${
                tab === "camera"
                  ? "border-2 border-neon-purple/30 bg-neon-purple/15 text-white shadow-brutal-sm"
                  : "border-2 border-transparent text-white/55 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <CameraIcon className="h-4 w-4" />
              Camera
            </button>
          </motion.div>
        </section>

        {/* Input + result grid */}
        <section className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <AnimatePresence mode="wait">
              {tab === "upload" ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{
                    duration: 0.3,
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <ImageUploader
                    disabled={isPredicting}
                    onSelect={handleFile}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="camera"
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.98 }}
                  transition={{
                    duration: 0.3,
                    type: "spring",
                    stiffness: 300,
                    damping: 30,
                  }}
                >
                  <CameraCapture
                    disabled={isPredicting}
                    onCapture={handleCapture}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-red-500/30 bg-red-500/[0.08] p-4 text-sm text-red-100 backdrop-blur-xl"
                style={{
                  boxShadow: "4px 4px 0px rgba(220, 38, 38, 0.15)",
                }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-bold">Prediction failed</p>
                  <p className="mt-0.5 text-red-200/80">{error}</p>
                </div>
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {isPredicting ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3 }}
                >
                  <LoadingSpinner />
                </motion.div>
              ) : currentResult && currentImage ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.3 }}
                >
                  <ResultCard image={currentImage} response={currentResult} />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <EmptyState />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <footer className="mt-20 flex flex-col items-center gap-2 text-xs text-white/35">
          <p>
            API ·{" "}
            <span className="font-mono font-medium text-white/55">
              {getApiBaseUrl()}
            </span>
          </p>
          <p>
            Built with FastAPI · PyTorch · CLIP · Vision LLM · React · Vite ·
            Tailwind
          </p>
        </footer>
      </main>

      <HistoryDrawer
        open={historyOpen}
        entries={history}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectHistory}
        onDelete={handleDeleteHistory}
        onClear={handleClearHistory}
      />

      {/* Floating history trigger (mobile) */}
      <button
        onClick={() => setHistoryOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-xl border-2 border-white/[0.12] bg-white/[0.06] px-4 py-3 text-sm font-bold text-white/90 backdrop-blur-xl transition-all duration-150 hover:border-white/20 hover:bg-white/[0.1] hover:-translate-x-px hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] lg:hidden"
        style={{ boxShadow: "4px 4px 0px rgba(139, 92, 246, 0.2)" }}
        aria-label="Open history drawer"
      >
        <HistoryIcon className="h-4 w-4" />
        {history.length > 0 && (
          <span className="rounded-full border-[1.5px] border-neon-purple/40 bg-neon-purple/20 px-2 py-0.5 text-xs font-bold text-neon-purple">
            {history.length}
          </span>
        )}
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="neo-card-static glow-border flex h-full min-h-[360px] flex-col items-center justify-center rounded-3xl p-10 text-center">
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-neon-purple/20 bg-gradient-to-br from-neon-purple/20 via-neon-pink/15 to-neon-cyan/15"
        style={{ boxShadow: "3px 3px 0px rgba(139, 92, 246, 0.15)" }}
      >
        <Sparkles className="h-7 w-7 text-neon-purple" />
      </div>
      <h3 className="font-display text-xl font-bold text-white">
        Ready when you are
      </h3>
      <p className="mt-2 max-w-sm text-sm text-white/45">
        Drop a food image on the left or use the camera tab to see real-time
        dish recognition and a full macro-nutrition breakdown.
      </p>
    </div>
  );
}
