"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewCard, Rating } from "@/types";
import { Eye } from "lucide-react";
import { pickBlankWord } from "@/lib/content";

interface Props {
  cards: ReviewCard[];
  onComplete: (results: { itemId: string; rating: Rating; responseTimeMs: number }[]) => void;
}

type Phase = "reveal" | "rate";
type Mode = "flashcard" | "fill-blank";

export default function ReviewSession({ cards, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("reveal");
  const [results, setResults] = useState<{ itemId: string; rating: Rating; responseTimeMs: number }[]>([]);
  const [startTime, setStartTime] = useState(Date.now());
  const [blank, setBlank] = useState<{ blanked: string; answer: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const mode = useRef<Mode>("flashcard");

  const card = cards[index];

  const initCard = useCallback((card: ReviewCard) => {
    setPhase("reveal");
    setShowAnswer(false);
    setStartTime(Date.now());

    // 60% flashcard, 40% fill-blank
    const isFillBlank = Math.random() < 0.4;
    mode.current = isFillBlank ? "fill-blank" : "flashcard";

    const primary = card.sentences[0] ?? "";
    const blankResult = isFillBlank ? pickBlankWord(primary) : null;
    // Fall back to flashcard if no blankable word found
    if (!blankResult) mode.current = "flashcard";
    setBlank(blankResult);
  }, []);

  useEffect(() => {
    if (card) initCard(card);
  }, [card, initCard]);

  function handleReveal() {
    setPhase("rate");
    setShowAnswer(true);
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

          {/* Mode badge */}
          <div className="flex justify-center mb-6">
            <span className="text-xs px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-medium tracking-wide uppercase">
              {mode.current === "fill-blank" ? "Fill in the blank" : "Flashcard"}
            </span>
          </div>

          {/* Card face */}
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 mb-6 min-h-[200px] flex flex-col items-center justify-center gap-4">
            <div className="text-center">
              {mode.current === "fill-blank" && blank && !showAnswer ? (
                <p className="text-2xl font-medium text-stone-800 leading-relaxed">
                  {blank.blanked}
                </p>
              ) : (
                <div className="space-y-1">
                  {card.sentences.map((s, i) => (
                    <p
                      key={i}
                      className={`text-xl leading-relaxed ${
                        i === 0
                          ? "font-medium text-stone-800"
                          : "text-stone-500 text-base"
                      }`}
                    >
                      {s}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Fill-blank answer */}
            {mode.current === "fill-blank" && blank && showAnswer && (
              <div className="px-4 py-2 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-orange-700 font-medium text-center">{blank.answer}</p>
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
