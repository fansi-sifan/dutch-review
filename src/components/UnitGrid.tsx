"use client";

import type { Unit } from "@/types";
import { Lock, CheckCircle2, BookOpen } from "lucide-react";

interface Props {
  units: Unit[];
  unlockedUpTo: number;
  onUnlockChange: (upTo: number) => void;
}

export default function UnitGrid({ units, unlockedUpTo, onUnlockChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
      {units.map((unit) => {
        const unlocked = unit.unit <= unlockedUpTo;
        const isCurrent = unit.unit === unlockedUpTo;
        const totalItems = unit.lessons.reduce((s, l) => s + l.items.length, 0);

        return (
          <button
            key={unit.unit}
            onClick={() => unlocked || onUnlockChange(unit.unit)}
            className={`
              relative rounded-2xl p-4 text-left border transition-all
              ${unlocked
                ? "bg-white border-stone-200 shadow-sm hover:shadow-md active:scale-[0.98]"
                : "bg-stone-100 border-stone-200 opacity-60 cursor-default"}
              ${isCurrent ? "ring-2 ring-orange-400" : ""}
            `}
          >
            {/* Level badge */}
            <span className="text-xs text-stone-400 font-medium mb-1 block">
              Level {unit.level} · Unit {unit.unit}
            </span>

            <p className="text-sm font-semibold text-stone-800 leading-tight mb-2">
              {unit.name}
            </p>

            <div className="flex items-center gap-1 text-xs text-stone-500">
              <BookOpen className="w-3 h-3" />
              <span>{totalItems} items</span>
            </div>

            {/* Status icon */}
            <div className="absolute top-3 right-3">
              {!unlocked ? (
                <Lock className="w-4 h-4 text-stone-400" />
              ) : unit.unit < unlockedUpTo ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
