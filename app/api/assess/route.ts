import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
  try {
    const body: AssessRequest = await request.json();

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
  const systemPrompt = `You are an SAT vocabulary tutor. Assess whether a student's definition captures the meaning and CONNOTATION of a word. Be encouraging but honest.

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
  const systemPrompt = `You are an SAT vocabulary tutor. Assess whether a student's sentence correctly uses a vocabulary word with proper connotation. Then provide an improved or alternative sample sentence.

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
