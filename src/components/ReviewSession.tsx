"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewCard, Rating } from "@/types";
import { Eye, X, Loader2, Volume2, VolumeX, Headphones } from "lucide-react";

type Mode = "forward" | "reverse" | "audio";

interface Props {
  initialCards: ReviewCard[];
  mode: Mode;
  fetchMore: () => Promise<ReviewCard[]>;
  onRate: (result: { itemId: string; rating: Rating; responseTimeMs: number; mode: string }) => void;
  onComplete: (
    results: { itemId: string; rating: Rating; responseTimeMs: number; mode: string }[],
    allDone: boolean
  ) => void;
}

type Phase = "reveal" | "rate";

// How many cards left before we silently fetch the next batch
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
  fetchMore,
  onRate,
  onComplete,
}: Props) {
  const [queue, setQueue] = useState<ReviewCard[]>(() => {
    // Dedup on init — can't call dedup() here (closure), so inline it
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
  const [audioEnabled, setAudioEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("audioEnabled") !== "false";
  });

  function toggleAudio() {
    setAudioEnabled((prev) => {
      const next = !prev;
      localStorage.setItem("audioEnabled", String(next));
      return next;
    });
  }

  const results = useRef<{ itemId: string; rating: Rating; responseTimeMs: number; mode: string }[]>([]);
  const translationCache = useRef(new Map<string, string>());
  const fetchingRef = useRef(false);
  const completedRef = useRef(false);
  // Track seen itemIds AND Dutch sentences to avoid showing duplicates within a session
  const seenItemIds = useRef(new Set<string>());
  const seenDutch = useRef(new Set<string>());

  function dedup(cards: ReviewCard[]): ReviewCard[] {
    return cards.filter((c) => {
      const dutch = (c.sentences[0] ?? "").trim();
      if (seenItemIds.current.has(c.itemId) || seenDutch.current.has(dutch)) return false;
      seenItemIds.current.add(c.itemId);
      seenDutch.current.add(dutch);
      return true;
    });
  }

  // Seed translation cache + seen sets from initial cards
  useEffect(() => {
    seedCache(initialCards, translationCache.current);
    for (const c of initialCards) {
      seenItemIds.current.add(c.itemId);
      seenDutch.current.add((c.sentences[0] ?? "").trim());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch next batch when running low
  useEffect(() => {
    const remaining = queue.length - index;
    if (remaining <= LOW_WATER_MARK && !fetchingRef.current && !allDone) {
      fetchingRef.current = true;
      setLoadingMore(true);
      fetchMore().then((newCards) => {
        if (newCards.length === 0) {
          setAllDone(true);
        } else {
          const fresh = dedup(newCards); // removes anything already shown this session
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

  // Detect "genuinely finished" — queue exhausted AND no more cards coming
  useEffect(() => {
    if (!completedRef.current && index > 0 && index >= queue.length && allDone) {
      completedRef.current = true;
      onComplete(results.current, true);
    }
  }, [index, queue.length, allDone, onComplete]);

  const { play: playAudio, playing: audioPlaying } = useAudio();

  const card = queue[index];
  // Per-card mode: use card's reviewMode if set, fall back to session mode
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

  // Skip audio-drill cards entirely when audio is disabled
  useEffect(() => {
    if (card && !audioEnabled && cardMode === "audio") {
      setIndex((i) => i + 1);
    }
  }, [card, audioEnabled, cardMode]);

  // Auto-play audio on forward and audio-mode cards (not reverse — hearing Dutch first lets you cheat)
  useEffect(() => {
    if (card && audioEnabled && cardMode !== "reverse") {
      const t = setTimeout(() => playAudio(card.sentences[0] ?? ""), 300);
      return () => clearTimeout(t);
    }
  }, [card, audioEnabled, cardMode, playAudio]);

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
    setIndex((i) => i + 1);
  }

  function handleExit() {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete(results.current, false);
  }

  // Waiting for next batch to arrive
  if (!card) {
    return (
      <div className="flex flex-col min-h-screen bg-stone-50 items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-orange-400" />
        <p className="text-stone-400 text-sm">Loading more cards…</p>
      </div>
    );
  }

  const dutch = card.sentences[0] ?? "";
  const isReverse = cardMode === "reverse";
  const isAudio = cardMode === "audio";
  const promptReady = isReverse ? translation !== null : true;
  const reviewed = results.current.length;

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      {/* Thin accent — changes per card */}
      <div className={`h-1 transition-colors duration-300 ${isAudio ? "bg-violet-500" : isReverse ? "bg-blue-500" : "bg-orange-400"}`} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-sm text-stone-500">
        <button
          onClick={handleExit}
          className="p-1 -ml-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 active:bg-stone-200 transition-colors"
          aria-label="Exit session"
        >
          <X className="w-5 h-5" />
        </button>

        <span className="font-medium text-stone-700 truncate mx-2">
          {card.unitName}
          <span className="ml-2 text-xs font-normal text-stone-400">
            {card.lessonId} · {card.lessonType}
          </span>
          {isAudio && (
            <span className="ml-2 text-xs font-semibold text-violet-400">Audio</span>
          )}
          {isReverse && (
            <span className="ml-2 text-xs font-semibold text-blue-400">EN→NL</span>
          )}
        </span>

        <div className="flex items-center gap-2 shrink-0 text-stone-500">
          {loadingMore && <Loader2 className="w-3 h-3 animate-spin text-stone-300" />}
          <span>{reviewed} reviewed</span>
          <button
            onClick={toggleAudio}
            className={`p-1.5 rounded-lg transition-colors ${
              audioEnabled
                ? "text-violet-500 bg-violet-50 hover:bg-violet-100"
                : "text-stone-400 bg-stone-100 hover:bg-stone-200"
            }`}
            aria-label={audioEnabled ? "Disable audio" : "Enable audio"}
            title={audioEnabled ? "Audio on — tap to mute" : "Audio off — tap to unmute"}
          >
            {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <div className="w-full max-w-lg">
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 mb-6 min-h-[220px] flex flex-col items-center justify-center gap-4">

            {/* Prompt */}
            {isAudio && audioEnabled ? (
              <>
                <Headphones className="w-10 h-10 text-violet-300" />
                <p className="text-sm text-stone-400">Listen and recall the meaning</p>
              </>
            ) : isAudio && !audioEnabled ? (
              <p className="text-2xl font-medium text-stone-800 leading-relaxed text-center">
                {dutch}
              </p>
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

            {/* Audio button — hidden when audio is disabled */}
            {audioEnabled && (
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
            )}

            {/* Answer reveal */}
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
                    {audioEnabled && (
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
                    )}
                  </div>
                ) : translation ? (
                  <p className="text-center text-sm text-stone-400 italic">{translation}</p>
                ) : (
                  <p className="text-center text-xs text-stone-300 italic">translating…</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
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
                sublabel="Again tomorrow"
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
