"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReviewSession from "@/components/ReviewSession";
import type { ReviewCard, Rating } from "@/types";
import { Loader2 } from "lucide-react";
import Link from "next/link";

type SessionState = "loading" | "active" | "done";
type Mode = "forward" | "reverse" | "audio";

const DAILY_GOAL = 15;

interface SessionStats {
  total: number;
  forgot: number;
  hard: number;
  easy: number;
  allDone: boolean;
  goalMet: boolean;
}

function getModeFromUrl(): Mode {
  if (typeof window === "undefined") return "forward";
  const params = new URLSearchParams(window.location.search);
  return (params.get("mode") ?? "forward") as Mode;
}

function getUnitsParam(): string {
  if (typeof window === "undefined") return "1,2,3,4,5,6";
  const unlocked = parseInt(localStorage.getItem("unlockedUpTo") ?? "6", 10);
  return Array.from({ length: unlocked }, (_, i) => i + 1).join(",");
}

export default function ReviewPage() {
  const [state, setState] = useState<SessionState>("loading");
  const [mode, setMode] = useState<Mode>("forward");
  const [initialCards, setInitialCards] = useState<ReviewCard[]>([]);
  const [sessionStats, setSessionStats] = useState<SessionStats | null>(null);
  const modeRef = useRef<Mode>("forward");

  useEffect(() => {
    const m = getModeFromUrl();
    setMode(m);
    modeRef.current = m;
    startSession(m);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startSession(modeParam?: Mode) {
    const m = modeParam ?? modeRef.current;
    setState("loading");
    setSessionStats(null);
    const res = await fetch(`/api/reviews?units=${getUnitsParam()}&mode=${m}`);
    const data = await res.json();
    setInitialCards(data.cards ?? []);
    if ((data.cards ?? []).length > 0) {
      setState("active");
    } else {
      setSessionStats({ total: 0, forgot: 0, hard: 0, easy: 0, allDone: true, goalMet: false });
      setState("done");
    }
  }

  const fetchMore = useCallback(async (): Promise<ReviewCard[]> => {
    if (modeRef.current === "reverse" || modeRef.current === "audio") return [];
    const res = await fetch(`/api/reviews?units=${getUnitsParam()}&mode=${modeRef.current}`);
    const data = await res.json();
    return data.cards ?? [];
  }, []);

  function handleRate(result: { itemId: string; rating: Rating; responseTimeMs: number; mode: string }) {
    fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([result]),
    });
  }

  function handleComplete(
    results: { itemId: string; rating: Rating; responseTimeMs: number; mode: string }[],
    allDone: boolean,
    goalMet = false
  ) {
    setSessionStats({
      total: results.length,
      forgot: results.filter((r) => r.rating === "forgot").length,
      hard: results.filter((r) => r.rating === "hard").length,
      easy: results.filter((r) => r.rating === "easy").length,
      allDone,
      goalMet,
    });
    setState("done");
  }

  if (state === "active") {
    return (
      <ReviewSession
        initialCards={initialCards}
        mode={mode}
        goal={mode === "forward" ? DAILY_GOAL : undefined}
        fetchMore={fetchMore}
        onRate={handleRate}
        onComplete={handleComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center px-6 gap-6">
      {state === "loading" && (
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
      )}

      {state === "done" && sessionStats && (
        <div className="w-full max-w-sm bg-white rounded-2xl border border-stone-200 p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-stone-800 text-center">
            {sessionStats.goalMet
              ? "Daily goal done! 🎉"
              : sessionStats.total === 0 || sessionStats.allDone
              ? "All caught up! 🎉"
              : "Session done!"}
          </h2>
          {(sessionStats.total > 0 || sessionStats.allDone) && (
            <p className="text-xs text-center text-stone-400">
              {sessionStats.allDone && !sessionStats.goalMet
                ? "Nothing left due — check back tomorrow."
                : sessionStats.goalMet
                ? "Come back tomorrow to keep the streak going."
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
            {!sessionStats.allDone && !sessionStats.goalMet && (
              <button
                onClick={() => startSession()}
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
    </div>
  );
}
