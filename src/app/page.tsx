"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import UnitGrid from "@/components/UnitGrid";
import StatsPanel from "@/components/StatsPanel";
import { getAllUnits, getItemsForUnits } from "@/lib/content";
import { BookOpen, BarChart2, Map, Languages } from "lucide-react";
import type { Unit } from "@/types";

type Tab = "review" | "units" | "stats";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("review");
  const [unlockedUpTo, setUnlockedUpTo] = useState(6);
  const [learnedCount, setLearnedCount] = useState(0);
  const [stats, setStats] = useState<{
    streak: number;
    dueCount: number;
    totalSeen: number;
    calendar: Record<string, number>;
    weakItems: {
      itemId: string;
      forgetRate: number;
      sentences: string[];
      unitName: string;
      lessonId: string;
    }[];
  } | null>(null);

  const units: Unit[] = getAllUnits();

  useEffect(() => {
    const saved = parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
    setUnlockedUpTo(saved);
  }, []);

  useEffect(() => {
    const unlocked = parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
    const units = Array.from({ length: unlocked }, (_, i) => i + 1).join(",");
    fetch(`/api/reviews?units=${units}&mode=reverse`)
      .then((r) => r.json())
      .then((d) => setLearnedCount(d.total ?? 0));
  }, []);

  useEffect(() => {
    if (tab === "stats" && !stats) {
      fetch("/api/stats")
        .then((r) => r.json())
        .then(setStats);
    }
  }, [tab, stats]);

  function handleUnlockChange(upTo: number) {
    setUnlockedUpTo(upTo);
    localStorage.setItem("unlockedUpTo", String(upTo));
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col max-w-2xl mx-auto">
      {/* Top bar */}
      <header className="px-5 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-stone-800">
          🇳🇱 Dutch Review
        </h1>
        <p className="text-stone-500 text-sm mt-1">Rosetta Stone companion</p>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {tab === "review" && (
          <div className="px-5 space-y-4 pt-2">
            <Link
              href="/review"
              className="block w-full py-5 rounded-2xl bg-orange-500 text-white font-bold text-xl text-center shadow-sm active:scale-[0.98] transition-transform"
            >
              Start Review
            </Link>

            <Link
              href="/review?mode=reverse"
              className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-semibold text-base text-center shadow-sm active:scale-[0.98] transition-transform ${
                learnedCount > 0
                  ? "bg-blue-500 text-white"
                  : "bg-stone-200 text-stone-400 pointer-events-none"
              }`}
            >
              <Languages className="w-5 h-5" />
              Reverse Practice
              {learnedCount > 0 && (
                <span className="text-xs font-normal opacity-80">
                  ({learnedCount} learned)
                </span>
              )}
            </Link>

            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-1">
              <p className="text-xs text-stone-500 uppercase tracking-wide font-medium">Current progress</p>
              <p className="text-stone-800 font-semibold">
                Units 1–{unlockedUpTo} unlocked
              </p>
              <p className="text-stone-500 text-sm">
                {getItemsForUnits(
                  Array.from({ length: unlockedUpTo }, (_, i) => i + 1)
                ).length}{" "}
                items available
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-2">
              <p className="text-xs text-stone-500 uppercase tracking-wide font-medium">How it works</p>
              <ul className="text-sm text-stone-600 space-y-1.5">
                <li>🃏 Flashcard: read the Dutch, recall the meaning</li>
                <li>👁 Reveal the translation, then rate yourself</li>
                <li>🟢 Easy → see it in weeks · 🔴 Forgot → tomorrow</li>
                <li>📊 Weak spots tracked automatically</li>
              </ul>
            </div>
          </div>
        )}

        {tab === "units" && (
          <UnitGrid
            units={units}
            unlockedUpTo={unlockedUpTo}
            onUnlockChange={handleUnlockChange}
          />
        )}

        {tab === "stats" && (
          stats
            ? <StatsPanel {...stats} />
            : (
              <div className="flex items-center justify-center h-48 text-stone-400 text-sm">
                Loading stats…
              </div>
            )
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-white border-t border-stone-200 flex">
        <NavTab icon={<BookOpen className="w-5 h-5" />} label="Review" active={tab === "review"} onClick={() => setTab("review")} />
        <NavTab icon={<Map className="w-5 h-5" />} label="Units" active={tab === "units"} onClick={() => setTab("units")} />
        <NavTab icon={<BarChart2 className="w-5 h-5" />} label="Stats" active={tab === "stats"} onClick={() => { setStats(null); setTab("stats"); }} />
      </nav>
    </div>
  );
}

function NavTab({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors
        ${active ? "text-orange-500" : "text-stone-400 hover:text-stone-600"}`}
    >
      {icon}
      {label}
    </button>
  );
}
