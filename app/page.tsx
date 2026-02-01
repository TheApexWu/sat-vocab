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
  phase: "define" | "revealed" | "sentence" | "feedback" | "done";
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

  const completedCount = dailyWords.filter(
    (w) => wordStates[w.word]?.phase === "feedback" || wordStates[w.word]?.phase === "done"
  ).length;
  const allDone = completedCount === dailyWords.length && dailyWords.length > 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="font-hand text-xl" style={{ color: "var(--text-muted)" }}>
          Loading today&apos;s words...
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="font-hand text-3xl mb-1" style={{ color: "var(--text)" }}>
          Daily Vocab
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {getDayKey()}
        </p>

        {/* Progress tiles */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {dailyWords.map((w, i) => {
            const state = wordStates[w.word];
            const done = state?.phase === "feedback" || state?.phase === "done";
            const inProgress = state?.phase === "revealed" || state?.phase === "sentence";
            return (
              <div
                key={i}
                className={`score-tile ${done ? "correct" : inProgress ? "close" : "empty"}`}
                title={w.word}
              >
                {done ? "\u2713" : (i + 1)}
              </div>
            );
          })}
        </div>

        <p className="text-xs mt-2" style={{ color: "var(--text-light)" }}>
          {completedCount} of {dailyWords.length}
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

      {/* Summary (when all done) */}
      {allDone && (
        <div className="notebook-card pl-10 pr-6 py-5 mb-6 animate-in text-center">
          <h2 className="font-hand text-xl mb-3" style={{ color: "var(--accent-dark)" }}>
            All done for today
          </h2>
          <div className="space-y-2 text-left">
            {dailyWords.map((w) => {
              const s = wordStates[w.word];
              const defScore = s?.definitionFeedback?.score || 0;
              const senScore = s?.sentenceFeedback?.score || 0;
              return (
                <div key={w.word} className="flex items-center justify-between text-sm py-1"
                  style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="font-semibold">{w.word}</span>
                  <div className="flex gap-2">
                    {defScore > 0 && <ScoreTiles score={defScore} small />}
                    {senScore > 0 && <ScoreTiles score={senScore} small />}
                    {s?.phase === "done" && !senScore && (
                      <span className="text-xs" style={{ color: "var(--text-light)" }}>reviewed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-4" style={{ color: "var(--text-light)" }}>
            Come back tomorrow for new words.
          </p>
        </div>
      )}

      {/* Word Cards */}
      <div className="space-y-6">
        {dailyWords.map((word, idx) => (
          <WordCard
            key={word.word}
            word={word}
            index={idx}
            state={wordStates[word.word]}
            assessing={assessingWord === word.word}
            inputValue={inputValues[word.word] || ""}
            onInputChange={(val) => setInputValues((p) => ({ ...p, [word.word]: val }))}
            onSubmitDefinition={(def) => assessDefinition(word, def)}
            onMoveSentence={() => updateWordState(word.word, { phase: "sentence" })}
            onMarkDone={() => updateWordState(word.word, { phase: "done" })}
            onSubmitSentence={(s) => assessSentence(word, s)}
          />
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 text-center" style={{ borderTop: "2px dashed var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-light)" }}>
          {allWords.length} words in the bank. New set every day at midnight EST.
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-light)" }}>
          Focus on connotation, etymology, and usage.
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
          Built by Amadeus Woo
        </a>
      </footer>
    </main>
  );
}

/* Word Card */

function WordCard({
  word,
  index,
  state,
  assessing,
  inputValue,
  onInputChange,
  onSubmitDefinition,
  onMoveSentence,
  onMarkDone,
  onSubmitSentence,
}: {
  word: Word;
  index: number;
  state: WordState;
  assessing: boolean;
  inputValue: string;
  onInputChange: (val: string) => void;
  onSubmitDefinition: (def: string) => void;
  onMoveSentence: () => void;
  onMarkDone: () => void;
  onSubmitSentence: (sentence: string) => void;
}) {
  const [sentenceInput, setSentenceInput] = useState("");
  const [showConnotation, setShowConnotation] = useState(false);
  const [showRoots, setShowRoots] = useState(false);

  const tierLabel = word.tier === 1 ? "common" : word.tier === 2 ? "advanced" : "rare";
  const tierColor = word.tier === 1 ? "var(--correct)" : word.tier === 2 ? "var(--yellow)" : "var(--wrong)";
  const isDone = state.phase === "feedback" || state.phase === "done";

  return (
    <div
      className={`notebook-card animate-in pl-10 pr-6 py-5 ${isDone ? "opacity-60" : ""}`}
      style={{ animationDelay: `${index * 0.08}s` }}
    >
      {/* Word header */}
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-hand text-2xl font-bold" style={{ color: "var(--text)" }}>
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
          <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
            What does this word mean? Think about connotation.
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
          <div className="mt-3">
            <button
              onClick={() => inputValue.trim() && onSubmitDefinition(inputValue.trim())}
              disabled={!inputValue.trim() || assessing}
              className="btn-primary"
            >
              {assessing ? "Checking..." : "Check"}
            </button>
          </div>
        </div>
      )}

      {/* Phase: Revealed — progressive disclosure */}
      {state.phase === "revealed" && (
        <div className="space-y-3 animate-in">
          {/* Score feedback */}
          {state.definitionFeedback && (
            <div className="flex items-start gap-3">
              <ScoreTiles score={state.definitionFeedback.score} />
              <p className="text-sm pt-0.5" style={{ color: "var(--text-muted)" }}>
                {state.definitionFeedback.feedback}
              </p>
            </div>
          )}

          {/* Definition (always shown) */}
          <div className="rounded-md px-4 py-3" style={{ background: "var(--bg-input)" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              Definition
            </p>
            <p className="text-sm" style={{ color: "var(--text)" }}>
              {word.definition}
            </p>
          </div>

          {/* Connotation (expandable) */}
          <button
            onClick={() => setShowConnotation(!showConnotation)}
            className="w-full text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-md transition-colors"
            style={{
              background: showConnotation ? "var(--bg-input)" : "transparent",
              color: "var(--text-muted)",
              border: showConnotation ? "none" : "1px dashed var(--border-dark)",
            }}
          >
            {showConnotation ? "Connotation" : "Show connotation"}
          </button>
          {showConnotation && (
            <div className="rounded-md px-4 py-3 animate-in" style={{ background: "var(--bg-input)" }}>
              <p className="text-sm" style={{ color: "var(--text)" }}>
                {word.connotation}
              </p>
            </div>
          )}

          {/* Etymology (expandable) */}
          <button
            onClick={() => setShowRoots(!showRoots)}
            className="w-full text-left text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-md transition-colors"
            style={{
              background: showRoots ? "var(--bg-input)" : "transparent",
              color: "var(--text-muted)",
              border: showRoots ? "none" : "1px dashed var(--border-dark)",
            }}
          >
            {showRoots ? "Etymology" : "Show etymology"}
          </button>
          {showRoots && (
            <div className="rounded-md px-4 py-3 animate-in" style={{ background: "var(--bg-input)" }}>
              <p className="text-sm" style={{ color: "var(--text)" }}>
                {word.roots}
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button onClick={onMoveSentence} className="btn-primary">
              Try using it in a sentence
            </button>
            <button onClick={onMarkDone} className="btn-secondary">
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Phase: Sentence */}
      {state.phase === "sentence" && (
        <div className="animate-in">
          <p className="text-sm mb-1" style={{ color: "var(--text)" }}>
            <strong>{word.definition}</strong>
          </p>
          <p className="text-xs italic mb-3" style={{ color: "var(--text-muted)" }}>
            {word.connotation}
          </p>
          <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
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
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => sentenceInput.trim() && onSubmitSentence(sentenceInput.trim())}
              disabled={!sentenceInput.trim() || assessing}
              className="btn-primary"
            >
              {assessing ? "Checking..." : "Submit"}
            </button>
            <button onClick={onMarkDone} className="btn-secondary">
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Phase: Feedback */}
      {state.phase === "feedback" && (
        <div className="space-y-3 animate-in">
          <div
            className="rounded-md px-3 py-2 text-sm italic"
            style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}
          >
            &ldquo;{state.userSentence}&rdquo;
          </div>

          {state.sentenceFeedback && (
            <>
              <div className="flex items-start gap-3">
                <ScoreTiles score={state.sentenceFeedback.score} />
                <p className="text-sm pt-0.5" style={{ color: "var(--text-muted)" }}>
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
                  <p className="text-sm italic" style={{ color: "var(--text)" }}>
                    &ldquo;{state.sentenceFeedback.improved}&rdquo;
                  </p>
                </div>
              )}
            </>
          )}

          <div className="rounded-md px-3 py-2 text-xs" style={{ background: "var(--bg-input)", color: "var(--text-light)" }}>
            {word.roots}
          </div>
        </div>
      )}

      {/* Phase: Done (skipped sentence) */}
      {state.phase === "done" && (
        <div className="text-sm" style={{ color: "var(--text-muted)" }}>
          {word.definition}
        </div>
      )}
    </div>
  );
}

/* Score Tiles */

function ScoreTiles({ score, small }: { score: number; small?: boolean }) {
  const size = small ? 20 : 28;
  const fontSize = small ? "0.6rem" : "0.75rem";
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
          style={{ width: size, height: size, fontSize, animationDelay: `${n * 0.06}s` }}
        >
          {n <= score ? "\u2605" : ""}
        </div>
      ))}
    </div>
  );
}
