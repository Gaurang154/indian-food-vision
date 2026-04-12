/** Donut + bar chart visualisation of the macro nutrient breakdown. */
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Macros, NutritionPerServing } from "../types";

interface NutritionChartProps {
  perServing: NutritionPerServing;
  total: Macros;
}

const COLORS = {
  protein: "#8b5cf6",
  carbs: "#ec4899",
  fat: "#06b6d4",
};

const SHADOW_COLORS = {
  protein: "rgba(139, 92, 246, 0.18)",
  carbs: "rgba(236, 72, 153, 0.18)",
  fat: "rgba(6, 182, 212, 0.18)",
};

export default function NutritionChart({
  perServing,
  total,
}: NutritionChartProps) {
  const macros = [
    {
      key: "protein",
      name: "Protein",
      value: round(total.protein),
      color: COLORS.protein,
    },
    {
      key: "carbs",
      name: "Carbs",
      value: round(total.carbs),
      color: COLORS.carbs,
    },
    {
      key: "fat",
      name: "Fat",
      value: round(total.fat),
      color: COLORS.fat,
    },
  ];
  const totalMacros = macros.reduce((sum, m) => sum + m.value, 0) || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={macros}
                dataKey="value"
                innerRadius={58}
                outerRadius={88}
                paddingAngle={4}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={2}
                startAngle={90}
                endAngle={-270}
              >
                {macros.map((entry) => (
                  <Cell key={entry.key} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "rgba(10, 10, 18, 0.95)",
                  border: "2px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: "4px 4px 0px rgba(0,0,0,0.3)",
                }}
                formatter={(value: number, name: string) => [
                  `${value.toFixed(1)} g`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Calories
          </span>
          <span className="font-display text-3xl font-bold text-white">
            {Math.round(total.calories)}
          </span>
          <span className="text-xs font-medium text-white/40">kcal</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        {macros.map((m) => (
          <div
            key={m.key}
            className="flex flex-col gap-1 rounded-xl border-2 border-white/[0.08] bg-white/[0.03] px-3 py-3 backdrop-blur-xl transition-all duration-200 hover:border-white/[0.14] hover:-translate-y-px"
            style={{
              boxShadow: `4px 4px 0px ${SHADOW_COLORS[m.key as keyof typeof SHADOW_COLORS]}`,
            }}
          >
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/50">
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: m.color }}
              />
              {m.name}
            </span>
            <span className="font-display text-lg font-bold text-white">
              {m.value.toFixed(1)}
              <span className="ml-1 text-xs font-medium text-white/40">g</span>
            </span>
            <span className="text-[11px] font-medium text-white/40">
              {((m.value / totalMacros) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      <div
        className="flex items-center justify-between rounded-2xl border-2 border-white/[0.08] bg-white/[0.03] p-4 text-xs text-white/60 backdrop-blur-xl"
        style={{ boxShadow: "4px 4px 0px rgba(139, 92, 246, 0.12)" }}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Primary serving
          </p>
          <p className="mt-1 font-display text-lg font-bold text-white">
            {Math.round(perServing.serving_size_g)} g
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span className="font-medium text-white/40">Calories</span>
          <span className="text-right font-semibold text-white">
            {Math.round(perServing.calories)} kcal
          </span>
          <span className="font-medium text-white/40">Protein</span>
          <span className="text-right font-semibold text-white">
            {perServing.protein.toFixed(1)} g
          </span>
          <span className="font-medium text-white/40">Carbs</span>
          <span className="text-right font-semibold text-white">
            {perServing.carbs.toFixed(1)} g
          </span>
          <span className="font-medium text-white/40">Fat</span>
          <span className="text-right font-semibold text-white">
            {perServing.fat.toFixed(1)} g
          </span>
        </div>
      </div>
    </div>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
