"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewCard, Rating } from "@/types";
import { Eye } from "lucide-react";

interface Props {
  cards: ReviewCard[];
  onComplete: (results: { itemId: string; rating: Rating; responseTimeMs: number }[]) => void;
}

type Phase = "reveal" | "rate";

async function fetchTranslation(text: string, cache: Map<string, string>): Promise<string | null> {
  if (cache.has(text)) return cache.get(text)!;
  try {
    const res = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=nl|en`
    );
    const data = await res.json();
    const translated: string = data?.responseData?.translatedText;
    if (translated) {
      cache.set(text, translated);
      return translated;
    }
  } catch {
    // silent fail — translation is a nice-to-have
  }
  return null;
}

export default function ReviewSession({ cards, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("reveal");
  const [results, setResults] = useState<{ itemId: string; rating: Rating; responseTimeMs: number }[]>([]);
  const [startTime, setStartTime] = useState(Date.now());
  const [translation, setTranslation] = useState<string | null>(null);
  const translationCache = useRef<Map<string, string>>(new Map());

  const card = cards[index];

  const initCard = useCallback((card: ReviewCard) => {
    setPhase("reveal");
    setTranslation(null);
    setStartTime(Date.now());

    // Pre-fetch translation in background while user reads the card
    const primary = card.sentences[0] ?? "";
    fetchTranslation(primary, translationCache.current).then(setTranslation);
  }, []);

  useEffect(() => {
    if (card) initCard(card);
  }, [card, initCard]);

  function handleReveal() {
    setPhase("rate");
  }

  function handleRate(rating: Rating) {
    const responseTimeMs = Date.now() - startTime;
    const newResults = [...results, { itemId: card.itemId, rating, responseTimeMs }];
    setResults(newResults);

    if (index + 1 >= cards.length) {
      onComplete(newResults);
    } else {
      setIndex(index + 1);
    }
  }

  if (!card) return null;

  const progress = (index / cards.length) * 100;
  const primary = card.sentences[0] ?? "";

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      {/* Progress bar */}
      <div className="h-1 bg-stone-200">
        <div
          className="h-1 bg-orange-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-sm text-stone-500">
        <span className="font-medium text-stone-700">
          {card.unitName}
          <span className="ml-2 text-xs font-normal text-stone-400">
            {card.lessonId} · {card.lessonType}
          </span>
        </span>
        <span>{index + 1} / {cards.length}</span>
      </div>

      {/* Card */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        <div className="w-full max-w-lg">

          {/* Card face */}
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 mb-6 min-h-[220px] flex flex-col items-center justify-center gap-4">

            {/* Front: Dutch prompt */}
            <p className="text-2xl font-medium text-stone-800 leading-relaxed text-center">
              {primary}
            </p>

            {/* Back: English translation revealed after Show */}
            {phase === "rate" && (
              <div className="w-full border-t border-stone-100 pt-4">
                {translation ? (
                  <p className="text-center text-sm text-stone-400 italic">
                    {translation}
                  </p>
                ) : (
                  <p className="text-center text-xs text-stone-300 italic">
                    translating…
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {phase === "reveal" && (
            <button
              onClick={handleReveal}
              className="w-full py-4 rounded-2xl bg-stone-800 text-white font-medium text-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              <Eye className="w-5 h-5" />
              Show
            </button>
          )}

          {phase === "rate" && (
            <div className="grid grid-cols-3 gap-3">
              <RateButton label="Forgot" sublabel="Again" color="bg-red-100 text-red-700 border-red-200 active:bg-red-200" onClick={() => handleRate("forgot")} />
              <RateButton label="Hard" sublabel="1 day" color="bg-amber-100 text-amber-700 border-amber-200 active:bg-amber-200" onClick={() => handleRate("hard")} />
              <RateButton label="Easy" sublabel="4+ days" color="bg-green-100 text-green-700 border-green-200 active:bg-green-200" onClick={() => handleRate("easy")} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RateButton({ label, sublabel, color, onClick }: {
  label: string; sublabel: string; color: string; onClick: () => void;
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
