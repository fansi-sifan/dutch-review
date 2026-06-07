"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import UnitGrid from "@/components/UnitGrid";
import StatsPanel from "@/components/StatsPanel";
import { getAllUnits, getItemsForUnits } from "@/lib/content";
import { BookOpen, BarChart2, Map, Languages, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import type { Unit } from "@/types";

type Tab = "review" | "units" | "stats";

interface CustomCard { id: string; dutch: string; english: string | null }

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("review");
  const [unlockedUpTo, setUnlockedUpTo] = useState(6);
  const [learnedCount, setLearnedCount] = useState(0);
  const [stats, setStats] = useState<{
    streak: number; dueCount: number; totalSeen: number;
    calendar: Record<string, number>;
    weakItems: { itemId: string; forgetRate: number; sentences: string[]; unitName: string; lessonId: string }[];
  } | null>(null);

  // Custom cards state
  const [customCards, setCustomCards] = useState<CustomCard[]>([]);
  const [showMyCards, setShowMyCards] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [dutch, setDutch] = useState("");
  const [english, setEnglish] = useState("");
  const [saving, setSaving] = useState(false);

  const units: Unit[] = getAllUnits();

  useEffect(() => {
    const saved = parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
    setUnlockedUpTo(saved);
  }, []);

  useEffect(() => {
    const unlocked = parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
    const unitList = Array.from({ length: unlocked }, (_, i) => i + 1).join(",");
    fetch(`/api/reviews?units=${unitList}&mode=reverse`)
      .then((r) => r.json())
      .then((d) => setLearnedCount(d.total ?? 0));
    fetch("/api/custom-cards")
      .then((r) => r.json())
      .then((d) => setCustomCards(d.cards ?? []));
  }, []);

  useEffect(() => {
    if (tab === "stats" && !stats) {
      fetch("/api/stats").then((r) => r.json()).then(setStats);
    }
  }, [tab, stats]);

  function handleUnlockChange(upTo: number) {
    setUnlockedUpTo(upTo);
    localStorage.setItem("unlockedUpTo", String(upTo));
  }

  async function handleAddCard(e: React.FormEvent) {
    e.preventDefault();
    if (!dutch.trim()) return;
    setSaving(true);
    const res = await fetch("/api/custom-cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dutch: dutch.trim(), english: english.trim() || undefined }),
    });
    const data = await res.json();
    setCustomCards([{ id: data.id, dutch: dutch.trim(), english: english.trim() || null }, ...customCards]);
    setDutch("");
    setEnglish("");
    setShowForm(false);
    setSaving(false);
  }

  async function handleDeleteCard(id: string) {
    await fetch(`/api/custom-cards/${id}`, { method: "DELETE" });
    setCustomCards(customCards.filter((c) => c.id !== id));
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col max-w-2xl mx-auto">
      <header className="px-5 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-stone-800">🇳🇱 Dutch Review</h1>
        <p className="text-stone-500 text-sm mt-1">Rosetta Stone companion</p>
      </header>

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
                <span className="text-xs font-normal opacity-80">({learnedCount} learned)</span>
              )}
            </Link>

            {/* My Vocabulary */}
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              <button
                onClick={() => setShowMyCards(!showMyCards)}
                className="w-full flex items-center justify-between px-5 py-4 active:bg-stone-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <p className="text-xs text-stone-500 uppercase tracking-wide font-medium">My Vocabulary</p>
                  {customCards.length > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-2 py-0.5 rounded-full">
                      {customCards.length}
                    </span>
                  )}
                </div>
                {showMyCards ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
              </button>

              {showMyCards && (
                <div className="border-t border-stone-100 px-5 pb-4 space-y-3">
                  {/* Add button / form */}
                  {!showForm ? (
                    <button
                      onClick={() => setShowForm(true)}
                      className="flex items-center gap-1.5 text-sm text-orange-500 font-medium pt-3"
                    >
                      <Plus className="w-4 h-4" /> Add card
                    </button>
                  ) : (
                    <form onSubmit={handleAddCard} className="pt-3 space-y-2">
                      <input
                        autoFocus
                        value={dutch}
                        onChange={(e) => setDutch(e.target.value)}
                        placeholder="Dutch sentence *"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <input
                        value={english}
                        onChange={(e) => setEnglish(e.target.value)}
                        placeholder="English translation (optional)"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={!dutch.trim() || saving}
                          className="flex-1 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-40"
                        >
                          {saving ? "Saving…" : "Add"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowForm(false); setDutch(""); setEnglish(""); }}
                          className="px-4 py-2 rounded-xl border border-stone-200 text-stone-500 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Card list */}
                  {customCards.length === 0 ? (
                    <p className="text-xs text-stone-400 pb-1">No cards yet — add your first one above.</p>
                  ) : (
                    <ul className="divide-y divide-stone-100">
                      {customCards.map((c) => (
                        <li key={c.id} className="flex items-start justify-between py-2.5 gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-stone-800 truncate">{c.dutch}</p>
                            {c.english && (
                              <p className="text-xs text-stone-400 italic truncate">{c.english}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteCard(c.id)}
                            className="shrink-0 p-1 text-stone-300 hover:text-red-400 transition-colors"
                            aria-label="Delete card"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-1">
              <p className="text-xs text-stone-500 uppercase tracking-wide font-medium">Current progress</p>
              <p className="text-stone-800 font-semibold">Units 1–{unlockedUpTo} unlocked</p>
              <p className="text-stone-500 text-sm">
                {getItemsForUnits(Array.from({ length: unlockedUpTo }, (_, i) => i + 1)).length} items available
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
          <UnitGrid units={units} unlockedUpTo={unlockedUpTo} onUnlockChange={handleUnlockChange} />
        )}

        {tab === "stats" && (
          stats
            ? <StatsPanel {...stats} />
            : <div className="flex items-center justify-center h-48 text-stone-400 text-sm">Loading stats…</div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-2xl mx-auto bg-white border-t border-stone-200 flex">
        <NavTab icon={<BookOpen className="w-5 h-5" />} label="Review" active={tab === "review"} onClick={() => setTab("review")} />
        <NavTab icon={<Map className="w-5 h-5" />} label="Units" active={tab === "units"} onClick={() => setTab("units")} />
        <NavTab icon={<BarChart2 className="w-5 h-5" />} label="Stats" active={tab === "stats"} onClick={() => { setStats(null); setTab("stats"); }} />
      </nav>
    </div>
  );
}

function NavTab({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
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
