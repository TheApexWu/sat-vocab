"use client";

import { useState, useEffect, useCallback } from "react";

interface Word {
  word: string;
  definition: string;
  connotation: string;
  roots: string;
  tier: number;
}

interface WordState {
  phase: "define" | "revealed" | "sentence" | "feedback" | "dismissed";
  userDefinition?: string;
  definitionFeedback?: { score: number; feedback: string };
  userSentence?: string;
  sentenceFeedback?: { score: number; feedback: string; improved: string };
}

function getDayKey(): string {
  // EST midnight boundary
  const now = new Date();
  const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${est.getFullYear()}-${String(est.getMonth() + 1).padStart(2, "0")}-${String(est.getDate()).padStart(2, "0")}`;
}

function seedRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

function getDailyWords(allWords: Word[], count: number): Word[] {
  const day = getDayKey();
  const rng = seedRandom(day);
  const shuffled = [...allWords].sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}

function getLocalState(): Record<string, Record<string, WordState>> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem("sat-vocab-state") || "{}");
  } catch {
    return {};
  }
}

function saveLocalState(state: Record<string, Record<string, WordState>>) {
  localStorage.setItem("sat-vocab-state", JSON.stringify(state));
}

export default function Home() {
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [dailyWords, setDailyWords] = useState<Word[]>([]);
  const [wordStates, setWordStates] = useState<Record<string, WordState>>({});
  const [loading, setLoading] = useState(true);
  const [assessingWord, setAssessingWord] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [wordCount, setWordCount] = useState(5);

  useEffect(() => {
    fetch("/data/words.json")
      .then((r) => r.json())
      .then((words: Word[]) => {
        setAllWords(words);
        const stored = getLocalState();
        const day = getDayKey();
        const dayState = stored[day] || {};

        // Restore word count preference
        const savedCount = localStorage.getItem("sat-vocab-count");
        const count = savedCount ? parseInt(savedCount) : 5;
        setWordCount(count);

        const daily = getDailyWords(words, count);
        setDailyWords(daily);

        // Init states for new words
        const states: Record<string, WordState> = {};
        for (const w of daily) {
          states[w.word] = dayState[w.word] || { phase: "define" };
        }
        setWordStates(states);
        setLoading(false);
      });
  }, []);

  const persistState = useCallback(
    (newStates: Record<string, WordState>) => {
      const day = getDayKey();
      const stored = getLocalState();
      stored[day] = newStates;
      saveLocalState(stored);
    },
    []
  );

  const updateWordState = useCallback(
    (word: string, update: Partial<WordState>) => {
      setWordStates((prev) => {
        const next = { ...prev, [word]: { ...prev[word], ...update } };
        persistState(next);
        return next;
      });
    },
    [persistState]
  );

  async function assessDefinition(word: Word, userDef: string) {
    setAssessingWord(word.word);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "definition",
          word: word.word,
          actualDefinition: word.definition,
          connotation: word.connotation,
          userInput: userDef,
        }),
      });
      const data = await res.json();
      updateWordState(word.word, {
        phase: "revealed",
        userDefinition: userDef,
        definitionFeedback: data,
      });
    } catch {
      updateWordState(word.word, {
        phase: "revealed",
        userDefinition: userDef,
        definitionFeedback: { score: 0, feedback: "Could not assess — check your connection." },
      });
    }
    setAssessingWord(null);
  }

  async function assessSentence(word: Word, userSentence: string) {
    setAssessingWord(word.word);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "sentence",
          word: word.word,
          definition: word.definition,
          connotation: word.connotation,
          userInput: userSentence,
        }),
      });
      const data = await res.json();
      updateWordState(word.word, {
        phase: "feedback",
        userSentence: userSentence,
        sentenceFeedback: data,
      });
    } catch {
      updateWordState(word.word, {
        phase: "feedback",
        userSentence: userSentence,
        sentenceFeedback: {
          score: 0,
          feedback: "Could not assess — check your connection.",
          improved: "",
        },
      });
    }
    setAssessingWord(null);
  }

  function dismissWord(word: Word, userDef: string) {
    // Must provide definition to dismiss
    assessDefinition(word, userDef).then(() => {
      // After assessment, if score >= 4, mark dismissed
      setWordStates((prev) => {
        const state = prev[word.word];
        if (state?.definitionFeedback && state.definitionFeedback.score >= 4) {
          const next = { ...prev, [word.word]: { ...state, phase: "dismissed" as const } };
          persistState(next);
          return next;
        }
        return prev;
      });
    });
  }

  const activeWords = dailyWords.filter((w) => wordStates[w.word]?.phase !== "dismissed");
  const dismissedWords = dailyWords.filter((w) => wordStates[w.word]?.phase === "dismissed");
  const completedCount = dailyWords.filter(
    (w) => wordStates[w.word]?.phase === "feedback" || wordStates[w.word]?.phase === "dismissed"
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-muted)]">Loading today&apos;s words...</div>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      {/* Header */}
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight mb-1">Daily Vocab</h1>
        <div className="flex items-center justify-between">
          <p className="text-[var(--text-muted)] text-sm">
            {getDayKey()} — {completedCount}/{dailyWords.length} complete
          </p>
          <select
            value={wordCount}
            onChange={(e) => {
              const count = parseInt(e.target.value);
              setWordCount(count);
              localStorage.setItem("sat-vocab-count", String(count));
              window.location.reload();
            }}
            className="bg-[var(--bg-card)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-muted)] cursor-pointer"
          >
            <option value={3}>3 words</option>
            <option value={4}>4 words</option>
            <option value={5}>5 words</option>
          </select>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1 bg-[var(--bg-card)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${(completedCount / dailyWords.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Word Cards */}
      <div className="space-y-6">
        {activeWords.map((word) => (
          <WordCard
            key={word.word}
            word={word}
            state={wordStates[word.word]}
            assessing={assessingWord === word.word}
            inputValue={inputValues[word.word] || ""}
            onInputChange={(val) => setInputValues((p) => ({ ...p, [word.word]: val }))}
            onSubmitDefinition={(def) => assessDefinition(word, def)}
            onDismiss={(def) => dismissWord(word, def)}
            onMoveSentence={() => updateWordState(word.word, { phase: "sentence" })}
            onSubmitSentence={(s) => assessSentence(word, s)}
          />
        ))}
      </div>

      {/* Dismissed section */}
      {dismissedWords.length > 0 && (
        <div className="mt-10 pt-6 border-t border-[var(--border)]">
          <h2 className="text-sm font-medium text-[var(--text-muted)] mb-3">
            Already knew ({dismissedWords.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {dismissedWords.map((w) => (
              <span
                key={w.word}
                className="px-3 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-full text-sm text-[var(--text-muted)]"
              >
                {w.word}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <footer className="mt-12 pt-6 border-t border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
        <p>160 SAT words — refreshes daily at midnight EST</p>
        <p className="mt-1">Focus on connotation, etymology, and usage.</p>
      </footer>
    </main>
  );
}

function WordCard({
  word,
  state,
  assessing,
  inputValue,
  onInputChange,
  onSubmitDefinition,
  onDismiss,
  onMoveSentence,
  onSubmitSentence,
}: {
  word: Word;
  state: WordState;
  assessing: boolean;
  inputValue: string;
  onInputChange: (val: string) => void;
  onSubmitDefinition: (def: string) => void;
  onDismiss: (def: string) => void;
  onMoveSentence: () => void;
  onSubmitSentence: (sentence: string) => void;
}) {
  const [sentenceInput, setSentenceInput] = useState("");

  return (
    <div className="animate-in bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-6">
      {/* Word + Tier */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xl font-semibold" style={{ fontFamily: "Crimson Pro, serif" }}>
          {word.word}
        </h2>
        <span className="text-xs text-[var(--text-muted)]">
          {word.tier === 1 ? "common" : word.tier === 2 ? "advanced" : "rare"}
        </span>
      </div>

      {/* Phase: Define */}
      {state.phase === "define" && (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            What does this word mean? Focus on connotation.
          </p>
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type your definition..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm resize-none h-20 focus:border-[var(--accent)] transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
                e.preventDefault();
                onSubmitDefinition(inputValue.trim());
              }
            }}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => inputValue.trim() && onSubmitDefinition(inputValue.trim())}
              disabled={!inputValue.trim() || assessing}
              className="px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-md disabled:opacity-40 transition-colors"
            >
              {assessing ? "Assessing..." : "Check"}
            </button>
            <button
              onClick={() => inputValue.trim() && onDismiss(inputValue.trim())}
              disabled={!inputValue.trim() || assessing}
              className="px-4 py-1.5 border border-[var(--border)] hover:border-[var(--text-muted)] text-[var(--text-muted)] text-sm rounded-md disabled:opacity-40 transition-colors"
            >
              I know this one
            </button>
          </div>
        </div>
      )}

      {/* Phase: Revealed */}
      {state.phase === "revealed" && (
        <div className="space-y-4">
          {/* Definition feedback */}
          {state.definitionFeedback && (
            <div className="animate-in">
              <ScoreBadge score={state.definitionFeedback.score} />
              <p className="text-sm mt-2 text-[var(--text-muted)]">
                {state.definitionFeedback.feedback}
              </p>
            </div>
          )}
          {/* Actual definition */}
          <div className="bg-[var(--bg)] rounded-md p-4">
            <p className="text-sm font-medium mb-2">Definition</p>
            <p className="text-sm text-[var(--text-muted)]">{word.definition}</p>
          </div>
          {/* Connotation */}
          <div className="bg-[var(--bg)] rounded-md p-4">
            <p className="text-sm font-medium mb-2">Connotation</p>
            <p className="text-sm text-[var(--text-muted)]">{word.connotation}</p>
          </div>
          {/* Etymology */}
          <div className="bg-[var(--bg)] rounded-md p-4">
            <p className="text-sm font-medium mb-2">Etymology</p>
            <p className="text-sm text-[var(--text-muted)]">{word.roots}</p>
          </div>

          <button
            onClick={onMoveSentence}
            className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-md transition-colors"
          >
            Use it in a sentence →
          </button>
        </div>
      )}

      {/* Phase: Sentence */}
      {state.phase === "sentence" && (
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-1">
            <span className="text-[var(--text)]">{word.definition}</span>
          </p>
          <p className="text-xs text-[var(--text-muted)] mb-3 italic">{word.connotation}</p>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Write a sentence using <strong className="text-[var(--text)]">{word.word}</strong>.
          </p>
          <textarea
            value={sentenceInput}
            onChange={(e) => setSentenceInput(e.target.value)}
            placeholder={`Use "${word.word}" in a sentence...`}
            className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm resize-none h-20 focus:border-[var(--accent)] transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && sentenceInput.trim()) {
                e.preventDefault();
                onSubmitSentence(sentenceInput.trim());
              }
            }}
          />
          <button
            onClick={() => sentenceInput.trim() && onSubmitSentence(sentenceInput.trim())}
            disabled={!sentenceInput.trim() || assessing}
            className="mt-3 px-4 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm rounded-md disabled:opacity-40 transition-colors"
          >
            {assessing ? "Assessing..." : "Submit"}
          </button>
        </div>
      )}

      {/* Phase: Feedback */}
      {state.phase === "feedback" && (
        <div className="space-y-4 animate-in">
          <div className="bg-[var(--bg)] rounded-md p-4">
            <p className="text-sm font-medium mb-1">Your sentence</p>
            <p className="text-sm text-[var(--text-muted)] italic">&ldquo;{state.userSentence}&rdquo;</p>
          </div>
          {state.sentenceFeedback && (
            <>
              <ScoreBadge score={state.sentenceFeedback.score} />
              <p className="text-sm text-[var(--text-muted)]">
                {state.sentenceFeedback.feedback}
              </p>
              {state.sentenceFeedback.improved && (
                <div className="bg-[var(--bg)] rounded-md p-4 border-l-2 border-[var(--accent)]">
                  <p className="text-sm font-medium mb-1">Sample sentence</p>
                  <p className="text-sm text-[var(--text-muted)] italic">
                    &ldquo;{state.sentenceFeedback.improved}&rdquo;
                  </p>
                </div>
              )}
            </>
          )}
          <div className="flex gap-4 text-xs text-[var(--text-muted)] pt-2">
            <span>{word.roots}</span>
          </div>
          <div className="text-center text-xs text-[var(--success)] pt-1">✓ Complete</div>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 4
      ? "var(--success)"
      : score >= 2
      ? "var(--warning)"
      : "var(--error)";
  const label =
    score >= 4
      ? "Strong"
      : score >= 2
      ? "Partial"
      : "Needs work";
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-medium" style={{ color }}>
        {label} ({score}/5)
      </span>
    </div>
  );
}
