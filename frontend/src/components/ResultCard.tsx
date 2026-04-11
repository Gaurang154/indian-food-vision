/** Main result panel — image, dish, confidence, nutrition breakdown. */
import { motion } from "framer-motion";
import { ChefHat, Info, Timer } from "lucide-react";
import ConfidenceBadge from "./ConfidenceBadge";
import NutritionChart from "./NutritionChart";
import SourceBadge from "./SourceBadge";
import type { FoodItem, PredictionResponse } from "../types";

interface ResultCardProps {
  image: string;
  response: PredictionResponse;
}

export default function ResultCard({ image, response }: ResultCardProps) {
  const { primary, alternatives, nutrition, processing_time_ms, notes } = response;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass glow-border rounded-3xl p-5 lg:p-6"
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-black/60">
            <img
              src={image}
              alt={primary.dish_name}
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                  Detected dish
                </p>
                <h2 className="font-display text-3xl font-bold text-white drop-shadow-lg">
                  {primary.dish_name}
                </h2>
              </div>
              <ConfidenceBadge confidence={primary.confidence} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={primary.source} />
            <span className="badge text-white/60">
              <Timer className="h-3 w-3" />
              {processing_time_ms} ms
            </span>
            {!primary.is_indian && (
              <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-200">
                Non-Indian dish detected
              </span>
            )}
          </div>

          {notes && (
            <div className="glass flex items-start gap-3 rounded-2xl p-4 text-sm text-white/70">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-cyan" />
              <p>{notes}</p>
            </div>
          )}

          {alternatives.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Alternative guesses
              </p>
              <div className="flex flex-col gap-2">
                {alternatives.slice(0, 4).map((alt, idx) => (
                  <div
                    key={`${alt.dish_name}-${idx}`}
                    className="glass flex items-center justify-between rounded-xl px-4 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <ChefHat className="h-3.5 w-3.5 text-white/50" />
                      <span className="text-sm text-white/80">{alt.dish_name}</span>
                      <SourceBadge source={alt.source} size="sm" />
                    </div>
                    <ConfidenceBadge confidence={alt.confidence} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {nutrition ? (
            <>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  Macro breakdown
                </p>
                <h3 className="font-display text-xl font-semibold text-white">
                  Nutrition estimate
                </h3>
              </div>
              <NutritionChart
                perServing={nutrition.per_serving}
                total={nutrition.total}
              />

              {nutrition.items.length > 1 && (
                <div>
                  <p className="mb-2 mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                    Items on plate
                  </p>
                  <div className="flex flex-col gap-2">
                    {nutrition.items.map((item, idx) => (
                      <ItemRow key={`${item.name}-${idx}`} item={item} />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="glass flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center text-white/50">
              <Info className="h-5 w-5 text-white/40" />
              <p className="text-sm">No nutrition data for this dish yet.</p>
              <p className="text-xs">
                Add it to <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">nutrition_db.json</code>.
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ItemRow({ item }: { item: FoodItem }) {
  return (
    <div className="glass flex items-center justify-between rounded-xl px-4 py-2.5 text-xs">
      <div>
        <p className="text-sm text-white">{item.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          {Math.round(item.portion_g)} g portion
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold text-white">
          {Math.round(item.nutrition.calories)} kcal
        </p>
        <p className="text-[10px] text-white/50">
          P {item.nutrition.protein.toFixed(1)}g · C {item.nutrition.carbs.toFixed(1)}g · F {item.nutrition.fat.toFixed(1)}g
        </p>
      </div>
    </div>
  );
}
