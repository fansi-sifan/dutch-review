"use client";

import { useState, useEffect } from "react";
import ReviewSession from "@/components/ReviewSession";
import type { ReviewCard, Rating } from "@/types";
import { BookOpen, Loader2 } from "lucide-react";
import Link from "next/link";

type SessionState = "idle" | "loading" | "active" | "done";

export default function ReviewPage() {
  const [state, setState] = useState<SessionState>("idle");
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [sessionStats, setSessionStats] = useState<{
    total: number;
    forgot: number;
    hard: number;
    easy: number;
  } | null>(null);

  function getUnlockedUnits(): number {
    if (typeof window === "undefined") return 6;
    return parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
  }

  async function startSession() {
    setState("loading");
    const unlocked = getUnlockedUnits();
    const units = Array.from({ length: unlocked }, (_, i) => i + 1).join(",");
    const res = await fetch(`/api/reviews?units=${units}`);
    const data = await res.json();
    setCards(data.cards);
    setState(data.cards.length > 0 ? "active" : "done");
  }

  async function handleComplete(
    results: { itemId: string; rating: Rating; responseTimeMs: number }[]
  ) {
    await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results),
    });

    const stats = {
      total: results.length,
      forgot: results.filter((r) => r.rating === "forgot").length,
      hard: results.filter((r) => r.rating === "hard").length,
      easy: results.filter((r) => r.rating === "easy").length,
    };
    setSessionStats(stats);
    setState("done");
  }

  if (state === "active") {
    return <ReviewSession cards={cards} onComplete={handleComplete} />;
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-6 gap-6">
      {state === "loading" && (
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      )}

      {state === "done" && sessionStats && (
        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-stone-800 text-center">Session complete!</h2>
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
          <div className="flex gap-3 pt-2">
            <button
              onClick={startSession}
              className="flex-1 py-3 rounded-xl bg-stone-800 text-white font-medium text-sm active:scale-[0.98] transition-transform"
            >
              Review again
            </button>
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
          <BookOpen className="w-12 h-12 text-orange-400 mx-auto" />
          <h1 className="text-2xl font-bold text-stone-800">Ready to review?</h1>
          <p className="text-stone-500 text-sm">
            Up to 20 cards — due items first, then new vocabulary.
          </p>
          <button
            onClick={startSession}
            className="w-full py-4 rounded-2xl bg-orange-500 text-white font-semibold text-lg active:scale-[0.98] transition-transform shadow-sm"
          >
            Start session
          </button>
          <Link href="/" className="block text-sm text-stone-400 hover:text-stone-600">
            ← Back to home
          </Link>
        </div>
      )}
    </div>
  );
}
