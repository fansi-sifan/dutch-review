"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewCard, Rating } from "@/types";
import { Eye, X, Loader2, Volume2, Headphones } from "lucide-react";

type Mode = "forward" | "reverse" | "audio";

interface Props {
  initialCards: ReviewCard[];
  mode: Mode;
  goal?: number;
  fetchMore: () => Promise<ReviewCard[]>;
  onRate: (result: { itemId: string; rating: Rating; responseTimeMs: number; mode: string }) => void;
  onComplete: (
    results: { itemId: string; rating: Rating; responseTimeMs: number; mode: string }[],
    allDone: boolean,
    goalMet?: boolean
  ) => void;
}

type Phase = "reveal" | "rate";

const LOW_WATER_MARK = 3;

async function fetchTranslation(
  text: string,
  cache: Map<string, string>
): Promise<{ translation: string; fresh: boolean } | null> {
  if (cache.has(text)) return { translation: cache.get(text)!, fresh: false };
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=nl|en`
    );
    const data = await res.json();
    const translated: string = data?.responseData?.translatedText;
    if (translated) {
      cache.set(text, translated);
      return { translation: translated, fresh: true };
    }
  } catch {
    // silent fail
  }
  return null;
}

function seedCache(cards: ReviewCard[], cache: Map<string, string>) {
  for (const c of cards) {
    if (c.translation) cache.set(c.sentences[0] ?? "", c.translation);
  }
}

function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const play = useCallback((text: string) => {
    if (!text.trim()) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(`/api/tts?text=${encodeURIComponent(text)}`);
    audioRef.current = audio;
    setPlaying(true);
    audio.play().catch(() => setPlaying(false));
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return { play, playing };
}

export default function ReviewSession({
  initialCards,
  mode,
  goal,
  fetchMore,
  onRate,
  onComplete,
}: Props) {
  const [queue, setQueue] = useState<ReviewCard[]>(() => {
    const seen = new Set<string>();
    const seenD = new Set<string>();
    return initialCards.filter((c) => {
      const dutch = (c.sentences[0] ?? "").trim();
      if (seen.has(c.itemId) || seenD.has(dutch)) return false;
      seen.add(c.itemId); seenD.add(dutch);
      return true;
    });
  });
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("reveal");
  const [translation, setTranslation] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(Date.now());
  const [loadingMore, setLoadingMore] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [goalReached, setGoalReached] = useState(false);

  const results = useRef<{ itemId: string; rating: Rating; responseTimeMs: number; mode: string }[]>([]);
  const translationCache = useRef(new Map<string, string>());
  const fetchingRef = useRef(false);
  const completedRef = useRef(false);
  const seenItemIds = useRef(new Set<string>());
  const seenDutch = useRef(new Set<string>());
  const requeuedOnce = useRef(new Set<string>());

  function dedup(cards: ReviewCard[]): ReviewCard[] {
    return cards.filter((c) => {
      const dutch = (c.sentences[0] ?? "").trim();
      if (seenItemIds.current.has(c.itemId) || seenDutch.current.has(dutch)) return false;
      seenItemIds.current.add(c.itemId);
      seenDutch.current.add(dutch);
      return true;
    });
  }

  useEffect(() => {
    seedCache(initialCards, translationCache.current);
    for (const c of initialCards) {
      seenItemIds.current.add(c.itemId);
      seenDutch.current.add((c.sentences[0] ?? "").trim());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const remaining = queue.length - index;
    if (remaining <= LOW_WATER_MARK && !fetchingRef.current && !allDone) {
      fetchingRef.current = true;
      setLoadingMore(true);
      fetchMore().then((newCards) => {
        if (newCards.length === 0) {
          setAllDone(true);
        } else {
          const fresh = dedup(newCards);
          if (fresh.length === 0) {
            setAllDone(true);
          } else {
            seedCache(fresh, translationCache.current);
            setQueue((prev) => [...prev, ...fresh]);
          }
        }
        setLoadingMore(false);
        fetchingRef.current = false;
      });
    }
  }, [index, queue.length, allDone, fetchMore]);

  useEffect(() => {
    if (!completedRef.current && index > 0 && index >= queue.length && allDone) {
      completedRef.current = true;
      onComplete(results.current, true);
    }
  }, [index, queue.length, allDone, onComplete]);

  const { play: playAudio, playing: audioPlaying } = useAudio();

  const card = queue[index];
  const cardMode = card ? (card.reviewMode ?? mode) : mode;

  const initCard = useCallback((c: ReviewCard) => {
    setPhase("reveal");
    setTranslation(null);
    setStartTime(Date.now());
    fetchTranslation(c.sentences[0] ?? "", translationCache.current).then((result) => {
      if (!result) return;
      setTranslation(result.translation);
      if (result.fresh) {
        fetch("/api/translations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: c.itemId, translation: result.translation }),
        });
      }
    });
  }, []);

  useEffect(() => {
    if (card) initCard(card);
  }, [card, initCard]);

  // Auto-play audio when entering an audio-mode card
  useEffect(() => {
    if (card && cardMode === "audio") {
      const t = setTimeout(() => playAudio(card.sentences[0] ?? ""), 300);
      return () => clearTimeout(t);
    }
  }, [card, cardMode, playAudio]);

  function handleReveal() {
    setPhase("rate");
  }

  function handleRate(rating: Rating) {
    if (!card) return;
    const result = {
      itemId: card.itemId,
      rating,
      responseTimeMs: Date.now() - startTime,
      mode: cardMode,
    };
    results.current = [...results.current, result];
    onRate(result);

    // Re-queue forgotten cards once per card per session (forward mode only)
    if (rating === "forgot" && mode !== "reverse" && !requeuedOnce.current.has(card.itemId)) {
      requeuedOnce.current.add(card.itemId);
      const capturedIndex = index;
      setQueue((prev) => {
        const insertAt = Math.min(capturedIndex + 1 + 5, prev.length);
        const next = [...prev];
        next.splice(insertAt, 0, prev[capturedIndex]);
        return next;
      });
    }

    setIndex((i) => i + 1);

    if (goal && results.current.length >= goal && !goalReached) {
      setGoalReached(true);
    }
  }

  function handleExit() {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(results.current, false);
  }

  if (!card && !goalReached) {
    return (
      <div className="flex flex-col min-h-screen bg-stone-50 items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
        <p className="text-stone-400 text-sm">Loading more cards…</p>
      </div>
    );
  }

  const dutch = card?.sentences[0] ?? "";
  const isReverse = cardMode === "reverse";
  const isAudio = cardMode === "audio";
  const promptReady = isReverse ? translation !== null : true;
  const reviewed = results.current.length;

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      <div className={`h-1 transition-colors duration-300 ${isAudio ? "bg-violet-500" : isReverse ? "bg-blue-500" : "bg-orange-400"}`} />

      <div className="flex items-center justify-between px-4 py-3 text-sm text-stone-500">
        <button
          onClick={handleExit}
          className="p-1 -ml-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 active:bg-stone-200 transition-colors"
          aria-label="Exit session"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="font-medium text-stone-700 truncate mx-2">
          {card?.unitName}
          <span className="ml-2 text-xs font-normal text-stone-400">
            {card?.lessonId} · {card?.lessonType}
          </span>
          {isAudio && (
            <span className="ml-2 text-xs font-semibold text-violet-400">Audio</span>
          )}
          {isReverse && (
            <span className="ml-2 text-xs font-semibold text-blue-400">EN→NL</span>
          )}
        </span>

        <div className="flex items-center gap-1.5 shrink-0 text-stone-500">
          {loadingMore && <Loader2 className="w-3 h-3 animate-spin text-stone-300" />}
          {goal ? (
            <span className="font-semibold">
              <span className={reviewed >= goal ? "text-green-600" : "text-stone-700"}>{Math.min(reviewed, goal)}</span>
              <span className="text-stone-400">/{goal}</span>
            </span>
          ) : (
            <span>{reviewed} reviewed</span>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 relative">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 mb-6 min-h-[220px] flex flex-col items-center justify-center gap-4 relative">

            {/* Goal reached overlay */}
            {goalReached && (
              <div className="absolute inset-0 bg-white/97 rounded-2xl flex flex-col items-center justify-center p-6 gap-5 z-10">
                <div className="text-center">
                  <p className="text-4xl mb-2">🎉</p>
                  <h2 className="text-lg font-bold text-stone-800">Daily goal reached!</h2>
                  <p className="text-stone-500 text-sm mt-1">{goal} cards done</p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center w-full">
                  <div>
                    <p className="text-xl font-bold text-green-600">{results.current.filter(r => r.rating === "easy").length}</p>
                    <p className="text-xs text-stone-500">Easy</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-amber-600">{results.current.filter(r => r.rating === "hard").length}</p>
                    <p className="text-xs text-stone-500">Hard</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-red-600">{results.current.filter(r => r.rating === "forgot").length}</p>
                    <p className="text-xs text-stone-500">Forgot</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2.5 w-full">
                  <button
                    onClick={() => {
                      if (completedRef.current) return;
                      completedRef.current = true;
                      onComplete(results.current, false, true);
                    }}
                    className="w-full py-3.5 rounded-2xl bg-orange-500 text-white font-semibold text-base active:scale-[0.98] transition-transform"
                  >
                    Done for today
                  </button>
                  <button
                    onClick={() => setGoalReached(false)}
                    className="w-full py-3.5 rounded-2xl border border-stone-200 text-stone-700 font-medium text-base active:scale-[0.98] transition-transform"
                  >
                    Keep going
                  </button>
                </div>
              </div>
            )}

            {/* Prompt */}
            {isAudio ? (
              <>
                <Headphones className="w-10 h-10 text-violet-300" />
                <p className="text-sm text-stone-400">Listen and recall the meaning</p>
              </>
            ) : isReverse ? (
              translation ? (
                <p className="text-2xl font-medium text-stone-800 leading-relaxed text-center italic">
                  {translation}
                </p>
              ) : (
                <p className="text-stone-300 text-sm italic">translating…</p>
              )
            ) : (
              <p className="text-2xl font-medium text-stone-800 leading-relaxed text-center">
                {dutch}
              </p>
            )}

            <button
              onClick={() => playAudio(dutch)}
              className={`p-3 rounded-full transition-colors ${
                isAudio ? "p-4" : ""
              } ${
                audioPlaying
                  ? "text-violet-500 bg-violet-50"
                  : isAudio
                  ? "text-violet-400 bg-violet-50 hover:bg-violet-100"
                  : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              }`}
              aria-label="Play pronunciation"
            >
              <Volume2 className={isAudio ? "w-8 h-8" : "w-5 h-5"} />
            </button>

            {phase === "rate" && (
              <div className="w-full border-t border-stone-100 pt-4 space-y-2">
                {isAudio ? (
                  <>
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-center text-xl font-medium text-stone-800">{dutch}</p>
                    </div>
                    {translation ? (
                      <p className="text-center text-sm text-stone-400 italic">{translation}</p>
                    ) : (
                      <p className="text-center text-xs text-stone-300 italic">translating…</p>
                    )}
                  </>
                ) : isReverse ? (
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-center text-lg font-medium text-stone-700">{dutch}</p>
                    <button
                      onClick={() => playAudio(dutch)}
                      className={`p-1.5 rounded-full transition-colors ${
                        audioPlaying
                          ? "text-orange-500 bg-orange-50"
                          : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                      }`}
                      aria-label="Play pronunciation"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : translation ? (
                  <p className="text-center text-sm text-stone-400 italic">{translation}</p>
                ) : (
                  <p className="text-center text-xs text-stone-300 italic">translating…</p>
                )}
              </div>
            )}
          </div>

          {phase === "reveal" && (
            <button
              onClick={handleReveal}
              disabled={!promptReady}
              className={`w-full py-4 rounded-2xl text-white font-medium text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
                promptReady
                  ? isAudio
                    ? "bg-violet-600"
                    : isReverse
                    ? "bg-blue-600"
                    : "bg-stone-800"
                  : "bg-stone-300 cursor-not-allowed"
              }`}
            >
              <Eye className="w-5 h-5" />
              Show
            </button>
          )}

          {phase === "rate" && (
            <div className="grid grid-cols-3 gap-3">
              <RateButton
                label="Forgot"
                sublabel="Again soon"
                color="bg-red-100 text-red-700 border-red-200 active:bg-red-200"
                onClick={() => handleRate("forgot")}
              />
              <RateButton
                label="Hard"
                sublabel="1 day"
                color="bg-amber-100 text-amber-700 border-amber-200 active:bg-amber-200"
                onClick={() => handleRate("hard")}
              />
              <RateButton
                label="Easy"
                sublabel="4+ days"
                color="bg-green-100 text-green-700 border-green-200 active:bg-green-200"
                onClick={() => handleRate("easy")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RateButton({
  label,
  sublabel,
  color,
  onClick,
}: {
  label: string;
  sublabel: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`py-4 rounded-2xl border font-medium flex flex-col items-center gap-1 active:scale-[0.97] transition-transform ${color}`}
    >
      <span className="text-base">{label}</span>
      <span className="text-xs opacity-70">{sublabel}</span>
    </button>
  );
}
