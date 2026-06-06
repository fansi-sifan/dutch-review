"use client";

import { Flame, Brain, AlertCircle } from "lucide-react";

interface WeakItem {
  itemId: string;
  forgetRate: number;
  sentences: string[];
  unitName: string;
  lessonId: string;
}

interface Props {
  streak: number;
  dueCount: number;
  totalSeen: number;
  calendar: Record<string, number>;
  weakItems: WeakItem[];
}

export default function StatsPanel({ streak, dueCount, totalSeen, calendar, weakItems }: Props) {
  return (
    <div className="p-4 space-y-6">
      {/* Key numbers */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Flame className="w-5 h-5 text-orange-500" />} value={streak} label="Day streak" />
        <StatCard icon={<Brain className="w-5 h-5 text-blue-500" />} value={dueCount} label="Due today" />
        <StatCard icon={<AlertCircle className="w-5 h-5 text-stone-400" />} value={totalSeen} label="Cards seen" />
      </div>

      {/* Calendar heatmap */}
      <div>
        <h3 className="text-sm font-semibold text-stone-600 mb-3">Last 60 days</h3>
        <CalendarHeatmap calendar={calendar} />
      </div>

      {/* Weak spots */}
      {weakItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-stone-600 mb-3">Weak spots</h3>
          <div className="space-y-2">
            {weakItems.slice(0, 10).map((item) => (
              <div key={item.itemId} className="bg-white rounded-xl p-3 border border-stone-200">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-stone-800 leading-tight">
                      {item.sentences[0]}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">{item.unitName} · {item.lessonId}</p>
                  </div>
                  <span className="text-xs font-bold text-red-500 shrink-0">
                    {Math.round(item.forgetRate * 100)}% forgot
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-stone-200 flex flex-col gap-1">
      {icon}
      <span className="text-2xl font-bold text-stone-800">{value}</span>
      <span className="text-xs text-stone-500">{label}</span>
    </div>
  );
}

function CalendarHeatmap({ calendar }: { calendar: Record<string, number> }) {
  const days: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = 59; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split("T")[0];
    days.push({ date: key, count: calendar[key] ?? 0 });
  }

  const max = Math.max(...days.map((d) => d.count), 1);

  return (
    <div className="flex flex-wrap gap-1">
      {days.map(({ date, count }) => {
        const intensity = count === 0 ? 0 : Math.ceil((count / max) * 4);
        const colors = ["bg-stone-100", "bg-orange-100", "bg-orange-200", "bg-orange-400", "bg-orange-600"];
        return (
          <div
            key={date}
            title={`${date}: ${count} reviews`}
            className={`w-3 h-3 rounded-sm ${colors[intensity]}`}
          />
        );
      })}
    </div>
  );
}
