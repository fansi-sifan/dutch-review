"use client";

import { useState, useEffect } from "react";
import type { StudiedCard } from "@/types";

type StatusFilter = "all" | "due" | "struggling" | "strong" | "custom";
type SortKey = "nextReview" | "forgetRate" | "totalReviews" | "dutch";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(dateStr + "T00:00:00");
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

function reviewLabel(card: StudiedCard): { text: string; className: string } {
  if (card.isDue) return { text: "Due now", className: "text-orange-500 font-semibold" };
  const d = daysUntil(card.nextReview);
  if (d === 1) return { text: "Tomorrow", className: "text-stone-400" };
  return { text: `in ${d}d`, className: "text-stone-400" };
}

function strengthClass(forgetRate: number, totalReviews: number): string {
  if (totalReviews < 2) return "bg-stone-300";
  if (forgetRate >= 0.4) return "bg-red-400";
  if (forgetRate >= 0.2) return "bg-yellow-400";
  return "bg-green-400";
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "due", label: "Due" },
  { key: "struggling", label: "Struggling" },
  { key: "strong", label: "Strong" },
  { key: "custom", label: "My Cards" },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "nextReview", label: "Next review" },
  { key: "forgetRate", label: "Weakest first" },
  { key: "totalReviews", label: "Most practiced" },
  { key: "dutch", label: "A–Z" },
];

export default function CardsList() {
  const [cards, setCards] = useState<StudiedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("nextReview");

  useEffect(() => {
    fetch("/api/cards")
      .then((r) => r.json())
      .then((d) => {
        setCards(d.cards ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-stone-400 text-sm">
        Loading cards…
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-stone-400 px-8 text-center">
        <p className="text-sm">No cards studied yet.</p>
        <p className="text-xs">Complete a review session and your cards will appear here.</p>
      </div>
    );
  }

  const filtered = cards.filter((c) => {
    if (status === "due") return c.isDue;
    if (status === "struggling") return c.forgetRate >= 0.3 && c.totalReviews >= 3;
    if (status === "strong") return c.interval >= 14;
    if (status === "custom") return c.isCustom;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "nextReview": return a.nextReview.localeCompare(b.nextReview);
      case "forgetRate": return b.forgetRate - a.forgetRate;
      case "totalReviews": return b.totalReviews - a.totalReviews;
      case "dutch": return a.dutch.localeCompare(b.dutch);
      default: return 0;
    }
  });

  // Count badges for filter chips
  const counts: Record<StatusFilter, number> = {
    all: cards.length,
    due: cards.filter((c) => c.isDue).length,
    struggling: cards.filter((c) => c.forgetRate >= 0.3 && c.totalReviews >= 3).length,
    strong: cards.filter((c) => c.interval >= 14).length,
    custom: cards.filter((c) => c.isCustom).length,
  };

  return (
    <div className="px-5 pt-3 pb-6 space-y-3">
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              status === f.key
                ? "bg-orange-500 text-white"
                : "bg-stone-100 text-stone-500 active:bg-stone-200"
            }`}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span
                className={`text-[10px] font-semibold ${
                  status === f.key ? "opacity-80" : "text-stone-400"
                }`}
              >
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Count + sort row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">
          {sorted.length} card{sorted.length !== 1 ? "s" : ""}
        </p>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="text-xs text-stone-600 bg-stone-100 rounded-lg px-2.5 py-1.5 border-0 focus:outline-none focus:ring-2 focus:ring-orange-300 cursor-pointer"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-stone-400 text-center py-8">No cards match this filter.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((card) => {
            const { text, className: labelClass } = reviewLabel(card);
            const dot = strengthClass(card.forgetRate, card.totalReviews);
            return (
              <li
                key={card.itemId}
                className="bg-white rounded-xl border border-stone-100 px-4 py-3 space-y-1.5"
              >
                {/* Dutch + review label */}
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-stone-800 leading-snug">{card.dutch}</p>
                  <span className={`shrink-0 text-xs ${labelClass}`}>{text}</span>
                </div>

                {/* English translation */}
                {card.english && (
                  <p className="text-xs text-stone-400 italic">{card.english}</p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-2 pt-0.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} title={
                    card.totalReviews < 2 ? "New"
                    : card.forgetRate >= 0.4 ? "Struggling"
                    : card.forgetRate >= 0.2 ? "Learning"
                    : "Strong"
                  } />
                  <span className="text-xs text-stone-400">
                    {card.isCustom ? "My Vocabulary" : card.unitName}
                  </span>
                  <span className="text-xs text-stone-300">·</span>
                  <span className="text-xs text-stone-400">{card.totalReviews}× reviewed</span>
                  {card.interval > 1 && (
                    <>
                      <span className="text-xs text-stone-300">·</span>
                      <span className="text-xs text-stone-400">{card.interval}d interval</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
