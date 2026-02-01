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
        const savedCount = localStorage.getItem("sat-vocab-count");
        const count = savedCount ? parseInt(savedCount) : 5;
        setWordCount(count);
        const daily = getDailyWords(words, count);
        setDailyWords(daily);
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
        definitionFeedback: { score: 0, feedback: "Couldn't check — try again!" },
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
          feedback: "Couldn't check — try again!",
          improved: "",
        },
      });
    }
    setAssessingWord(null);
  }

  function dismissWord(word: Word, userDef: string) {
    assessDefinition(word, userDef).then(() => {
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
        <div className="font-hand text-2xl" style={{ color: "var(--text-muted)" }}>
          Loading today&apos;s words...
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="font-hand text-4xl mb-1" style={{ color: "var(--text)" }}>
          Daily Vocab 📝
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {getDayKey()} &middot; {allWords.length} words in the bank
        </p>

        {/* Progress tiles (Wordle-style) */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {dailyWords.map((w, i) => {
            const state = wordStates[w.word];
            const done = state?.phase === "feedback" || state?.phase === "dismissed";
            const inProgress = state?.phase === "revealed" || state?.phase === "sentence";
            return (
              <div
                key={i}
                className={`score-tile ${done ? "correct" : inProgress ? "close" : "empty"}`}
                title={w.word}
              >
                {done ? "✓" : inProgress ? "~" : (i + 1)}
              </div>
            );
          })}
        </div>

        <p className="text-xs mt-2" style={{ color: "var(--text-light)" }}>
          {completedCount}/{dailyWords.length} complete
        </p>

        {/* Word count selector */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Words per day:</span>
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => {
                if (n !== wordCount) {
                  setWordCount(n);
                  localStorage.setItem("sat-vocab-count", String(n));
                  window.location.reload();
                }
              }}
              className="w-8 h-8 rounded-md text-sm font-bold transition-all"
              style={{
                background: n === wordCount ? "var(--accent)" : "transparent",
                color: n === wordCount ? "white" : "var(--text-muted)",
                border: n === wordCount ? "none" : "2px solid var(--border-dark)",
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </header>

      {/* Word Cards */}
      <div className="space-y-6">
        {activeWords.map((word, idx) => (
          <WordCard
            key={word.word}
            word={word}
            index={idx}
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
        <div className="mt-8 pt-4" style={{ borderTop: "2px dashed var(--border)" }}>
          <p className="font-hand text-lg mb-2" style={{ color: "var(--text-muted)" }}>
            Already knew these ✨
          </p>
          <div className="flex flex-wrap gap-2">
            {dismissedWords.map((w) => (
              <span
                key={w.word}
                className="font-hand px-3 py-1 rounded-full text-sm"
                style={{
                  background: "var(--correct)",
                  color: "white",
                }}
              >
                {w.word} ✓
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-6 text-center" style={{ borderTop: "2px dashed var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-light)" }}>
          New words every day at midnight EST
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-light)" }}>
          Focus on <strong>connotation</strong>, <strong>etymology</strong>, and <strong>usage</strong>
        </p>
        <a
          href="https://amadeuswoo.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={{
            background: "var(--text)",
            color: "var(--bg)",
          }}
          onMouseOver={(e) => (e.currentTarget.style.opacity = "0.8")}
          onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Built by Amadeus Woo &rarr;
        </a>
      </footer>
    </main>
  );
}

/* ─── Word Card Component ─── */

function WordCard({
  word,
  index,
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
  index: number;
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

  const tierLabel = word.tier === 1 ? "common" : word.tier === 2 ? "advanced" : "rare";
  const tierColor = word.tier === 1 ? "var(--correct)" : word.tier === 2 ? "var(--yellow)" : "var(--wrong)";

  return (
    <div
      className="notebook-card animate-in pl-10 pr-6 py-5"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      {/* Word header */}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-hand text-3xl font-bold" style={{ color: "var(--text)" }}>
          {word.word}
        </h2>
        <span
          className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
          style={{ background: tierColor, color: "white" }}
        >
          {tierLabel}
        </span>
      </div>

      {/* Phase: Define */}
      {state.phase === "define" && (
        <div>
          <p className="font-hand text-lg mb-3" style={{ color: "var(--text-muted)" }}>
            What does this word mean? Think about connotation!
          </p>
          <textarea
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder="Type your definition..."
            className="w-full rounded-md px-3 py-2 resize-none h-20 transition-colors"
            style={{
              background: "var(--bg-input)",
              border: "2px solid var(--border)",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
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
              className="btn-primary"
            >
              {assessing ? "Checking..." : "Check ✎"}
            </button>
            <button
              onClick={() => inputValue.trim() && onDismiss(inputValue.trim())}
              disabled={!inputValue.trim() || assessing}
              className="btn-secondary"
            >
              I know this one 💪
            </button>
          </div>
        </div>
      )}

      {/* Phase: Revealed */}
      {state.phase === "revealed" && (
        <div className="space-y-3 animate-in">
          {state.definitionFeedback && (
            <div className="flex items-start gap-3">
              <ScoreTiles score={state.definitionFeedback.score} />
              <p className="font-hand text-base pt-1" style={{ color: "var(--text-muted)" }}>
                {state.definitionFeedback.feedback}
              </p>
            </div>
          )}

          <InfoBlock emoji="📖" label="Definition" text={word.definition} />
          <InfoBlock emoji="💡" label="Connotation" text={word.connotation} />
          <InfoBlock emoji="🌱" label="Etymology" text={word.roots} />

          <button onClick={onMoveSentence} className="btn-primary w-full mt-2">
            Now use it in a sentence →
          </button>
        </div>
      )}

      {/* Phase: Sentence */}
      {state.phase === "sentence" && (
        <div className="animate-in">
          <p className="text-sm mb-1" style={{ color: "var(--text)" }}>
            <strong>{word.definition}</strong>
          </p>
          <p className="font-hand text-sm italic mb-3" style={{ color: "var(--text-muted)" }}>
            {word.connotation}
          </p>
          <p className="font-hand text-lg mb-3" style={{ color: "var(--text-muted)" }}>
            Write a sentence using <strong style={{ color: "var(--text)" }}>{word.word}</strong>:
          </p>
          <textarea
            value={sentenceInput}
            onChange={(e) => setSentenceInput(e.target.value)}
            placeholder={`Use "${word.word}" in a sentence...`}
            className="w-full rounded-md px-3 py-2 resize-none h-20 transition-colors"
            style={{
              background: "var(--bg-input)",
              border: "2px solid var(--border)",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
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
            className="btn-primary mt-3"
          >
            {assessing ? "Checking..." : "Submit ✎"}
          </button>
        </div>
      )}

      {/* Phase: Feedback */}
      {state.phase === "feedback" && (
        <div className="space-y-3 animate-in">
          <div
            className="rounded-md px-3 py-2 font-hand text-base italic"
            style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}
          >
            &ldquo;{state.userSentence}&rdquo;
          </div>

          {state.sentenceFeedback && (
            <>
              <div className="flex items-start gap-3">
                <ScoreTiles score={state.sentenceFeedback.score} />
                <p className="font-hand text-base pt-1" style={{ color: "var(--text-muted)" }}>
                  {state.sentenceFeedback.feedback}
                </p>
              </div>

              {state.sentenceFeedback.improved && (
                <div
                  className="rounded-md px-4 py-3"
                  style={{
                    background: "var(--bg-input)",
                    borderLeft: "3px solid var(--accent)",
                  }}
                >
                  <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>
                    Sample sentence
                  </p>
                  <p className="font-hand text-base italic" style={{ color: "var(--text)" }}>
                    &ldquo;{state.sentenceFeedback.improved}&rdquo;
                  </p>
                </div>
              )}
            </>
          )}

          <div className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--bg-input)", color: "var(--text-light)" }}>
            🌱 {word.roots}
          </div>

          <div className="text-center font-hand text-lg animate-pop" style={{ color: "var(--correct)" }}>
            ✓ Done!
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Score Tiles (Wordle-style) ─── */

function ScoreTiles({ score }: { score: number }) {
  return (
    <div className="flex gap-1 shrink-0">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`score-tile ${
            n <= score
              ? score >= 4 ? "correct" : score >= 2 ? "close" : "wrong"
              : "empty"
          }`}
          style={{ width: 28, height: 28, fontSize: "0.75rem", animationDelay: `${n * 0.08}s` }}
        >
          {n <= score ? "★" : ""}
        </div>
      ))}
    </div>
  );
}

/* ─── Info Block ─── */

function InfoBlock({ emoji, label, text }: { emoji: string; label: string; text: string }) {
  return (
    <div
      className="rounded-md px-4 py-3"
      style={{ background: "var(--bg-input)" }}
    >
      <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
        {emoji} {label}
      </p>
      <p className="font-hand text-base" style={{ color: "var(--text)" }}>
        {text}
      </p>
    </div>
  );
}
