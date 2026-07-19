"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import UnitGrid from "@/components/UnitGrid";
import StatsPanel from "@/components/StatsPanel";
import CardsList from "@/components/CardsList";
import { getAllUnits } from "@/lib/content";
import { BookOpen, BarChart2, Map, Languages, Plus, X, ChevronDown, ChevronUp, Flame, Headphones } from "lucide-react";
import type { Unit } from "@/types";

type Tab = "review" | "units" | "stats";

interface CustomCard { id: string; dutch: string; english: string | null }

const DAILY_GOAL = 15;

function GoalRing({ todayCount, goal }: { todayCount: number; goal: number }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const progress = Math.min(todayCount / goal, 1);
  const dash = progress * circ;
  const done = todayCount >= goal;

  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0" aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#e7e5e4" strokeWidth="4" />
      <circle
        cx="28" cy="28" r={r}
        fill="none"
        stroke={done ? "#22c55e" : "#f97316"}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 28 28)"
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
      <text x="28" y="33" textAnchor="middle" fontSize="11" fontWeight="500" fill="#292524">
        {Math.min(todayCount, goal)}/{goal}
      </text>
    </svg>
  );
}

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("review");
  const [unlockedUpTo, setUnlockedUpTo] = useState(6);
  const [audioReadyCount, setAudioReadyCount] = useState(0);
  const [reverseReadyCount, setReverseReadyCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [dueCount, setDueCount] = useState<number | null>(null);
  const [stats, setStats] = useState<{
    streak: number; dueCount: number; totalSeen: number;
    calendar: Record<string, number>;
    weakItems: { itemId: string; forgetRate: number; sentences: string[]; unitName: string; lessonId: string }[];
  } | null>(null);

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
    fetch("/api/custom-cards")
      .then((r) => r.json())
      .then((d) => setCustomCards(d.cards ?? []));
    fetch(`/api/counts?units=${unitList}`)
      .then((r) => r.json())
      .then((d) => {
        setAudioReadyCount(d.audioReady ?? 0);
        setReverseReadyCount(d.reverseReady ?? 0);
        setStreak(d.streak ?? 0);
        setTodayCount(d.todayCount ?? 0);
        setDueCount(d.dueCount ?? 0);
      });
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

  const todayGoalMet = todayCount >= DAILY_GOAL;
  const remaining = Math.max(0, DAILY_GOAL - todayCount);
  const hour = new Date().getHours();
  const streakAtRisk = streak > 0 && todayCount === 0 && hour >= 18;

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col max-w-2xl mx-auto">
      <header className="px-5 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-stone-800">🇳🇱 Dutch Review</h1>
            <p className="text-stone-500 text-sm mt-0.5">Rosetta Stone companion</p>
          </div>
          {streak > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-full px-3 py-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-orange-700">{streak}</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {tab === "review" && (
          <div className="px-5 space-y-3 pt-2">

            {/* Daily goal card */}
            <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-4">
              <GoalRing todayCount={todayCount} goal={DAILY_GOAL} />
              <div className="flex-1 min-w-0">
                {todayGoalMet ? (
                  <>
                    <p className="text-sm font-semibold text-green-700">Goal met today!</p>
                    <p className="text-xs text-stone-500 mt-0.5">Anything more is a bonus</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-stone-800">
                      {remaining} more card{remaining !== 1 ? "s" : ""} today
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      ~{Math.max(1, Math.ceil(remaining / 8))} min · goal is {DAILY_GOAL} cards
                    </p>
                  </>
                )}
                {streakAtRisk && (
                  <p className="text-xs text-orange-600 font-medium mt-1">
                    Complete today to keep your {streak}-day streak
                  </p>
                )}
              </div>
            </div>

            {/* Start Review */}
            <Link
              href="/review"
              className="block w-full py-5 rounded-2xl bg-orange-500 text-white font-bold text-xl text-center shadow-sm active:scale-[0.98] transition-transform"
            >
              {dueCount !== null && dueCount > 0 ? `Review · ${dueCount} due` : "Start Review"}
            </Link>

            {/* Reverse Practice */}
            <Link
              href="/review?mode=audio"
              className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-semibold text-base text-center shadow-sm active:scale-[0.98] transition-transform ${
                audioReadyCount > 0
                  ? "bg-violet-500 text-white"
                  : "bg-stone-200 text-stone-400 pointer-events-none"
              }`}
            >
              <Headphones className="w-5 h-5" />
              Listening Practice
              {audioReadyCount > 0 && (
                <span className="text-xs font-normal opacity-80">({audioReadyCount})</span>
              )}
            </Link>

            <Link
              href="/review?mode=reverse"
              className={`flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-semibold text-base text-center shadow-sm active:scale-[0.98] transition-transform ${
                reverseReadyCount > 0
                  ? "bg-blue-500 text-white"
                  : "bg-stone-200 text-stone-400 pointer-events-none"
              }`}
            >
              <Languages className="w-5 h-5" />
              Reverse Practice
              {reverseReadyCount > 0 && (
                <span className="text-xs font-normal opacity-80">({reverseReadyCount})</span>
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
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
                      />
                      <input
                        value={english}
                        onChange={(e) => setEnglish(e.target.value)}
                        placeholder="English translation (optional)"
                        className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
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

          </div>
        )}

        {tab === "units" && (
          <UnitGrid units={units} unlockedUpTo={unlockedUpTo} onUnlockChange={handleUnlockChange} />
        )}

        {tab === "stats" && (
          <div className="space-y-6">
            {stats
              ? <StatsPanel {...stats} />
              : <div className="flex items-center justify-center h-48 text-stone-400 text-sm">Loading stats…</div>
            }
            <div>
              <p className="px-5 text-xs text-stone-500 uppercase tracking-wide font-medium mb-3">All studied cards</p>
              <CardsList />
            </div>
          </div>
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
