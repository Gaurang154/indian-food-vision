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
  const { primary, alternatives, nutrition, processing_time_ms, notes } =
    response;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        type: "spring",
        stiffness: 200,
        damping: 25,
      }}
      className="neo-card-static glow-border rounded-3xl p-5 lg:p-6"
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-4">
          <div
            className="relative overflow-hidden rounded-2xl border-2 border-white/[0.08] bg-black/60"
            style={{ boxShadow: "4px 4px 0px rgba(0,0,0,0.3)" }}
          >
            <img
              src={image}
              alt={primary.dish_name}
              className="aspect-[4/3] w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Detected dish
                </p>
                <h2 className="font-display text-3xl font-bold text-white drop-shadow-lg">
                  {primary.dish_name}
                </h2>
              </div>
              <ConfidenceBadge confidence={primary.confidence} />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-wrap items-center gap-2"
          >
            <SourceBadge source={primary.source} />
            <span className="badge text-white/60">
              <Timer className="h-3 w-3" />
              {processing_time_ms} ms
            </span>
            {!primary.is_indian && (
              <span
                className="badge border-amber-500/30 bg-amber-500/10 text-amber-200"
                style={{
                  boxShadow: "2px 2px 0px rgba(245,158,11,0.1)",
                }}
              >
                Non-Indian dish detected
              </span>
            )}
          </motion.div>

          {notes && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass flex items-start gap-3 rounded-2xl p-4 text-sm text-white/70"
            >
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-neon-cyan" />
              <p>{notes}</p>
            </motion.div>
          )}

          {alternatives.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
                Alternative guesses
              </p>
              <div className="flex flex-col gap-2">
                {alternatives.slice(0, 4).map((alt, idx) => (
                  <motion.div
                    key={`${alt.dish_name}-${idx}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.06 }}
                    className="glass flex items-center justify-between rounded-xl px-4 py-2.5 transition-all duration-200 hover:border-white/15 hover:bg-white/[0.05]"
                  >
                    <div className="flex items-center gap-2">
                      <ChefHat className="h-3.5 w-3.5 text-white/50" />
                      <span className="text-sm font-medium text-white/80">
                        {alt.dish_name}
                      </span>
                      <SourceBadge source={alt.source} size="sm" />
                    </div>
                    <ConfidenceBadge confidence={alt.confidence} size="sm" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col gap-4"
        >
          {nutrition ? (
            <>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                  Macro breakdown
                </p>
                <h3 className="font-display text-xl font-bold text-white">
                  Nutrition estimate
                </h3>
              </div>
              <NutritionChart
                perServing={nutrition.per_serving}
                total={nutrition.total}
              />

              {nutrition.items.length > 1 && (
                <div>
                  <p className="mb-2 mt-1 text-[10px] font-bold uppercase tracking-widest text-white/40">
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
              <p className="text-sm font-medium">
                No nutrition data for this dish yet.
              </p>
              <p className="text-xs">
                Add it to{" "}
                <code className="rounded-lg border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px]">
                  nutrition_db.json
                </code>
                .
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function ItemRow({ item }: { item: FoodItem }) {
  return (
    <div className="glass flex items-center justify-between rounded-xl px-4 py-2.5 text-xs transition-all duration-200 hover:border-white/15 hover:bg-white/[0.05]">
      <div>
        <p className="text-sm font-medium text-white">{item.name}</p>
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          {Math.round(item.portion_g)} g portion
        </p>
      </div>
      <div className="text-right">
        <p className="font-bold text-white">
          {Math.round(item.nutrition.calories)} kcal
        </p>
        <p className="text-[10px] text-white/50">
          P {item.nutrition.protein.toFixed(1)}g · C{" "}
          {item.nutrition.carbs.toFixed(1)}g · F{" "}
          {item.nutrition.fat.toFixed(1)}g
        </p>
      </div>
    </div>
  );
}
