"use client";

import { useState, useEffect, useCallback } from "react";
import ReviewSession from "@/components/ReviewSession";
import type { ReviewCard, Rating } from "@/types";
import { BookOpen, Languages, Loader2 } from "lucide-react";
import Link from "next/link";

type SessionState = "idle" | "loading" | "active" | "done";
type Mode = "forward" | "reverse";

export default function ReviewPage() {
  const [state, setState] = useState<SessionState>("idle");
  const [mode, setMode] = useState<Mode>("forward");
  const [initialCards, setInitialCards] = useState<ReviewCard[]>([]);
  const [sessionStats, setSessionStats] = useState<{
    total: number;
    forgot: number;
    hard: number;
    easy: number;
    allDone: boolean;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMode((params.get("mode") ?? "forward") as Mode);
  }, []);

  function getUnitsParam(): string {
    if (typeof window === "undefined") return "1,2,3,4,5,6";
    const unlocked = parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
    return Array.from({ length: unlocked }, (_, i) => i + 1).join(",");
  }

  async function startSession() {
    setState("loading");
    setSessionStats(null);
    const res = await fetch(`/api/reviews?units=${getUnitsParam()}&mode=${mode}`);
    const data = await res.json();
    setInitialCards(data.cards ?? []);
    setState((data.cards ?? []).length > 0 ? "active" : "done");
    if ((data.cards ?? []).length === 0) {
      setSessionStats({ total: 0, forgot: 0, hard: 0, easy: 0, allDone: true });
    }
  }

  // Called by ReviewSession each time it needs more cards.
  // Reverse practice is a finite set — return [] so it ends naturally.
  const fetchMore = useCallback(async (): Promise<ReviewCard[]> => {
    if (mode === "reverse") return [];
    const res = await fetch(`/api/reviews?units=${getUnitsParam()}&mode=${mode}`);
    const data = await res.json();
    return data.cards ?? [];
  }, [mode]);

  // Fires immediately per card — saves for all modes now that reverse is integrated
  function handleRate(result: { itemId: string; rating: Rating; responseTimeMs: number }) {
    fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([result]),
    });
  }

  // Called when user exits or queue genuinely runs dry
  function handleComplete(
    results: { itemId: string; rating: Rating; responseTimeMs: number }[],
    allDone: boolean
  ) {
    setSessionStats({
      total: results.length,
      forgot: results.filter((r) => r.rating === "forgot").length,
      hard: results.filter((r) => r.rating === "hard").length,
      easy: results.filter((r) => r.rating === "easy").length,
      allDone,
    });
    setState("done");
  }

  if (state === "active") {
    return (
      <ReviewSession
        initialCards={initialCards}
        mode={mode}
        fetchMore={fetchMore}
        onRate={handleRate}
        onComplete={handleComplete}
      />
    );
  }

  const isReverse = mode === "reverse";

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-6 gap-6">
      {state === "loading" && (
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      )}

      {state === "done" && sessionStats && (
        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-stone-800 text-center">
            {sessionStats.total === 0
              ? "All caught up! 🎉"
              : sessionStats.allDone
              ? "All caught up! 🎉"
              : "Session done!"}
          </h2>
          {sessionStats.total > 0 && (
            <p className="text-xs text-center text-stone-400">
              {sessionStats.allDone
                ? "Nothing left due — check back tomorrow."
                : `${sessionStats.total} cards reviewed.`}
            </p>
          )}
          {sessionStats.total > 0 && (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{sessionStats.easy}</p>
                <p className="text-xs text-stone-500">Easy</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{sessionStats.hard}</p>
                <p className="text-xs text-stone-500">Hard</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{sessionStats.forgot}</p>
                <p className="text-xs text-stone-500">Forgot</p>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            {!sessionStats.allDone && (
              <button
                onClick={startSession}
                className="flex-1 py-3 rounded-xl bg-stone-800 text-white font-medium text-sm active:scale-[0.98] transition-transform"
              >
                Keep going
              </button>
            )}
            <Link
              href="/"
              className="flex-1 py-3 rounded-xl border border-stone-200 text-stone-700 font-medium text-sm text-center active:scale-[0.98] transition-transform"
            >
              Home
            </Link>
          </div>
        </div>
      )}

      {state === "idle" && (
        <div className="w-full max-w-sm space-y-4 text-center">
          {isReverse
            ? <Languages className="w-12 h-12 text-blue-400 mx-auto" />
            : <BookOpen className="w-12 h-12 text-orange-400 mx-auto" />
          }
          <h1 className="text-2xl font-bold text-stone-800">
            {isReverse ? "Reverse Practice" : "Ready to review?"}
          </h1>
          <p className="text-stone-500 text-sm">
            {isReverse
              ? "All learned cards, English → Dutch. Ratings count toward your schedule."
              : "New words + due reviews. Some cards flip to EN→NL once you've seen them enough."
            }
          </p>
          <button
            onClick={startSession}
            className={`w-full py-4 rounded-2xl text-white font-semibold text-lg active:scale-[0.98] transition-transform shadow-sm ${
              isReverse ? "bg-blue-500" : "bg-orange-500"
            }`}
          >
            Start
          </button>
          <Link href="/" className="block text-sm text-stone-400 hover:text-stone-600">
            ← Back to home
          </Link>
        </div>
      )}
    </div>
  );
}
