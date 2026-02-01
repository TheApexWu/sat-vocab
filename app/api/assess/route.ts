import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// --- Rate limiter (in-memory, per-IP, resets on cold start) ---
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return true;
  }
  return false;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 5 * 60 * 1000);

interface AssessRequest {
  type: "definition" | "sentence";
  word: string;
  actualDefinition?: string;
  definition?: string;
  connotation?: string;
  userInput: string;
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("No API key configured");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

export async function POST(request: Request) {
  // Rate limit by IP
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { score: 0, feedback: "Slow down! Too many requests. Try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body: AssessRequest = await request.json();

    if (!body.userInput || body.userInput.length > 1000) {
      return NextResponse.json(
        { score: 0, feedback: "Invalid input." },
        { status: 400 }
      );
    }

    if (body.type === "definition") {
      return await assessDefinition(body);
    } else if (body.type === "sentence") {
      return await assessSentence(body);
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err) {
    console.error("Assessment error:", err);
    return NextResponse.json(
      { score: 0, feedback: "Assessment unavailable. Try again." },
      { status: 500 }
    );
  }
}

async function assessDefinition(body: AssessRequest) {
  const systemPrompt = `You are a friendly SAT vocabulary tutor. Assess whether a student's definition captures the meaning and CONNOTATION of a word. Be encouraging but honest. Keep it casual and helpful, like a good tutor would.

Respond in EXACTLY this JSON format (no markdown, no code fences):
{"score": <1-5>, "feedback": "<1-2 sentences>"}

Scoring:
5 = Nails definition AND connotation
4 = Good definition, minor connotation gap
3 = Roughly correct but vague or missing nuance
2 = Partially correct but significant gaps
1 = Wrong or extremely vague`;

  const userPrompt = `Word: ${body.word}
Actual definition: ${body.actualDefinition}
Connotation note: ${body.connotation}
Student's definition: "${body.userInput}"`;

  const response = await callClaude(systemPrompt, userPrompt);
  const parsed = JSON.parse(response);
  return NextResponse.json(parsed);
}

async function assessSentence(body: AssessRequest) {
  const systemPrompt = `You are a friendly SAT vocabulary tutor. Assess whether a student's sentence correctly uses a vocabulary word with proper connotation. Then provide an improved or alternative sample sentence. Be encouraging and helpful.

Respond in EXACTLY this JSON format (no markdown, no code fences):
{"score": <1-5>, "feedback": "<1-2 sentences about their usage>", "improved": "<a polished sample sentence using the word>"}

Scoring:
5 = Perfect usage with correct connotation in a vivid context
4 = Correct usage, could be more precise or vivid
3 = Technically correct but generic or flat
2 = Awkward usage or wrong connotation
1 = Incorrect usage`;

  const userPrompt = `Word: ${body.word}
Definition: ${body.definition}
Connotation: ${body.connotation}
Student's sentence: "${body.userInput}"`;

  const response = await callClaude(systemPrompt, userPrompt);
  const parsed = JSON.parse(response);
  return NextResponse.json(parsed);
}
