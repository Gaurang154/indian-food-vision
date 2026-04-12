import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Macros, NutritionPerServing } from "../types";

interface NutritionChartProps { perServing: NutritionPerServing; total: Macros; }

const COLORS = { protein: "#FE9CE8", carbs: "#CDF77E", fat: "#F7CB46" };
const BG_COLORS = { protein: "rgba(254,156,232,0.35)", carbs: "rgba(205,247,126,0.4)", fat: "rgba(247,203,70,0.4)" };

export default function NutritionChart({ perServing, total }: NutritionChartProps) {
  const macros = [
    { key: "protein", name: "Protein", value: round(total.protein), color: COLORS.protein },
    { key: "carbs", name: "Carbs", value: round(total.carbs), color: COLORS.carbs },
    { key: "fat", name: "Fat", value: round(total.fat), color: COLORS.fat },
  ];
  const totalMacros = macros.reduce((s, m) => s + m.value, 0) || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={macros} dataKey="value" innerRadius={56} outerRadius={86} paddingAngle={5} stroke="#000" strokeWidth={3} startAngle={90} endAngle={-270}>
                {macros.map((e) => <Cell key={e.key} fill={e.color} />)}
              </Pie>
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }}
                contentStyle={{ background: "#fff", border: "3px solid #000", borderRadius: 12, fontSize: 12, fontWeight: 700, boxShadow: "4px 4px 0px #000" }}
                formatter={(v: number, n: string) => [`${v.toFixed(1)} g`, n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">Calories</span>
          <span className="font-display text-3xl font-extrabold text-gray-900">{Math.round(total.calories)}</span>
          <span className="text-xs font-bold text-gray-400">kcal</span>
        </div>
      </div>

      {/* Solid colored macro cards — like the reference feature cards */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        {macros.map((m) => (
          <div key={m.key}
            className="flex flex-col gap-1 rounded-xl border-[3px] border-black px-3 py-3 transition-all duration-200 hover:-translate-y-px cursor-pointer"
            style={{ background: BG_COLORS[m.key as keyof typeof BG_COLORS], boxShadow: "4px 4px 0px #000" }}>
            <span className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-widest text-gray-600">
              <span className="h-2.5 w-2.5 rounded-sm border-2 border-black" style={{ background: m.color }} />{m.name}
            </span>
            <span className="font-display text-lg font-extrabold text-gray-900">{m.value.toFixed(1)}<span className="ml-1 text-xs font-bold text-gray-500">g</span></span>
            <span className="text-[11px] font-bold text-gray-500">{((m.value / totalMacros) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-2xl border-[3px] border-black bg-white/70 p-4 text-xs text-gray-600 backdrop-blur-xl" style={{ boxShadow: "4px 4px 0px #000" }}>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-gray-400">Primary serving</p>
          <p className="mt-1 font-display text-lg font-extrabold text-gray-900">{Math.round(perServing.serving_size_g)} g</p>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span className="font-bold text-gray-400">Calories</span><span className="text-right font-extrabold text-gray-900">{Math.round(perServing.calories)} kcal</span>
          <span className="font-bold text-gray-400">Protein</span><span className="text-right font-extrabold text-gray-900">{perServing.protein.toFixed(1)} g</span>
          <span className="font-bold text-gray-400">Carbs</span><span className="text-right font-extrabold text-gray-900">{perServing.carbs.toFixed(1)} g</span>
          <span className="font-bold text-gray-400">Fat</span><span className="text-right font-extrabold text-gray-900">{perServing.fat.toFixed(1)} g</span>
        </div>
      </div>
    </div>
  );
}

function round(v: number) { return Math.round(v * 10) / 10; }
