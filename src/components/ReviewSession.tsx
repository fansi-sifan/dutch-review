"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ReviewCard, Rating, ReviewMode } from "@/types";
import { Volume2, Eye, RefreshCw, ChevronRight } from "lucide-react";
import { pickBlankWord } from "@/lib/content";

interface Props {
  cards: ReviewCard[];
  onComplete: (results: { itemId: string; rating: Rating; responseTimeMs: number }[]) => void;
}

type Phase = "listening" | "reveal" | "rate";

export default function ReviewSession({ cards, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("listening");
  const [results, setResults] = useState<{ itemId: string; rating: Rating; responseTimeMs: number }[]>([]);
  const [startTime, setStartTime] = useState(Date.now());
  const [blank, setBlank] = useState<{ blanked: string; answer: string } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const card = cards[index];

  // Pick a random review mode for each card (weighted)
  const mode = useRef<ReviewMode>("flashcard");

  const initCard = useCallback((card: ReviewCard) => {
    window.speechSynthesis?.cancel();
    setPhase("listening");
    setShowAnswer(false);
    setStartTime(Date.now());

    // Pick mode: 50% flashcard, 30% fill-blank, 20% listening
    const r = Math.random();
    if (r < 0.2) mode.current = "listening";
    else if (r < 0.5) mode.current = "fill-blank";
    else mode.current = "flashcard";

    // Compute blank word for fill-blank mode
    const primary = card.sentences[0] ?? "";
    if (mode.current === "fill-blank") {
      setBlank(pickBlankWord(primary));
    } else {
      setBlank(null);
    }
  }, []);

  useEffect(() => {
    if (card) initCard(card);
  }, [card, initCard]);

  // Auto-speak on card load
  useEffect(() => {
    if (!card || phase !== "listening") return;
    speakSentences(card.sentences);
    // After TTS, move to reveal phase
    const totalChars = card.sentences.join(" ").length;
    const ms = Math.max(1500, totalChars * 60);
    const timer = setTimeout(() => setPhase("reveal"), ms);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, phase]);

  function speakSentences(sentences: string[]) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    sentences.forEach((text, i) => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = "nl-NL";
      utt.rate = 0.9;
      if (i === 0) synthRef.current = utt;
      window.speechSynthesis.speak(utt);
    });
  }

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

  const progress = ((index) / cards.length) * 100;
  const primarySentence = card.sentences[0] ?? "";

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
              {mode.current === "fill-blank" ? "Fill in the blank" : mode.current === "listening" ? "Listening" : "Flashcard"}
            </span>
          </div>

          {/* Card face */}
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 mb-6 min-h-[200px] flex flex-col items-center justify-center gap-4">

            {phase === "listening" && (
              <div className="flex flex-col items-center gap-3 text-stone-400">
                <Volume2 className="w-10 h-10 animate-pulse text-orange-400" />
                <p className="text-sm">Listen…</p>
              </div>
            )}

            {phase !== "listening" && (
              <>
                {/* Main sentence */}
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

                {/* Fill-blank answer reveal */}
                {mode.current === "fill-blank" && blank && showAnswer && (
                  <div className="mt-2 px-4 py-2 bg-orange-50 rounded-lg border border-orange-200">
                    <p className="text-orange-700 font-medium text-center">{blank.answer}</p>
                  </div>
                )}

                {/* TTS replay button */}
                <button
                  onClick={() => speakSentences(card.sentences)}
                  className="mt-2 p-2 rounded-full text-stone-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"
                  aria-label="Replay audio"
                >
                  <Volume2 className="w-5 h-5" />
                </button>
              </>
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
              <RateButton
                label="Forgot"
                sublabel="Again"
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
