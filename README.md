# SAT Vocab — Daily Words

A daily vocabulary learning module for SAT prep. Presents 3-5 words each day, cycling through 160 curated SAT-level words.

**Live at:** vocab.amadeuswoo.com

## How It Works

1. Each day at midnight EST, you get a fresh set of words
2. For each word, type what you think it means (definition + connotation)
3. AI assesses your definition accuracy (1-5 score)
4. See the full definition, connotation notes, and Latin/Greek etymology
5. Write a sentence using the word
6. Get feedback on your usage + an improved sample sentence
7. If you already know a word, prove it — give a definition to dismiss it

## What Makes It Different

- **Connotation focus** — SAT tests subtle meaning, not dictionary definitions
- **Etymology as memory aid** — Latin roots, Greek prefixes, word history
- **Active recall** — you write BEFORE seeing the answer
- **Sentence practice** — using a word cements it better than reading it
- **AI assessment** — instant feedback on both definitions and usage

## Stack

- Next.js 15 + TypeScript + Tailwind CSS 4
- Claude API (Sonnet) for definition/sentence assessment
- Static word bank (160 words, JSON)
- Client-side daily rotation (date-seeded PRNG, no backend state)
- localStorage for progress tracking

## Setup

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

## Deploy to Vercel

```bash
npx vercel --prod
# Set ANTHROPIC_API_KEY in Vercel environment variables
# Point vocab.amadeuswoo.com CNAME to cname.vercel-dns.com
```

## Word Bank

160 words in `data/words.json`, each with:
- `word` — the vocabulary word
- `definition` — precise SAT-level definition
- `connotation` — what the SAT actually tests (subtle tone/usage)
- `roots` — Latin/Greek etymology as a memory hook
- `tier` — 1 (common), 2 (advanced), 3 (rare)
