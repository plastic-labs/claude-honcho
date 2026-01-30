/**
 * Cerebras Skill - Ultra-fast inference with Llama models
 *
 * Uses Cerebras API for lightning-fast search, research, and tool calling.
 * Perfect for quick preliminary work before deeper Claude analysis.
 */

import { loadConfig } from "../config.js";
import * as s from "../styles.js";

const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";

interface CerebrasConfig {
  apiKey: string;
  model?: string;  // Default: llama-3.3-70b
}

interface CerebrasMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CerebrasResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Get Cerebras API key from environment or config
 */
function getCerebrasKey(): string | null {
  // Check environment first
  if (process.env.CEREBRAS_API_KEY) {
    return process.env.CEREBRAS_API_KEY;
  }

  // Check honcho plugin config
  const config = loadConfig();
  if (config?.cerebrasKey) {
    return config.cerebrasKey;
  }

  return null;
}

/**
 * Call Cerebras API for fast inference
 */
export async function callCerebras(
  prompt: string,
  options: {
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const apiKey = getCerebrasKey();
  if (!apiKey) {
    throw new Error("Cerebras API key not found. Set CEREBRAS_API_KEY env var or add cerebrasKey to config.");
  }

  const model = options.model || "llama-3.3-70b";
  const messages: CerebrasMessage[] = [];

  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const response = await fetch(CEREBRAS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as CerebrasResponse;
  return data.choices[0]?.message?.content || "";
}

/**
 * Fast research query - uses Cerebras for quick answers
 */
export async function fastResearch(query: string): Promise<string> {
  const systemPrompt = `You are a fast research assistant. Provide concise, accurate answers.
Focus on:
- Direct answers to the question
- Key technical details
- Relevant code examples if applicable
- Links or references if you know them

Be brief but thorough. No fluff.`;

  return callCerebras(query, { systemPrompt });
}

/**
 * Fast code analysis - quick review of code snippets
 */
export async function fastCodeAnalysis(code: string, question: string): Promise<string> {
  const systemPrompt = `You are an expert code analyst. Analyze code quickly and accurately.
Provide:
- Direct answer to the question
- Key issues or patterns found
- Suggestions if relevant

Be concise.`;

  const prompt = `Code:\n\`\`\`\n${code}\n\`\`\`\n\nQuestion: ${question}`;
  return callCerebras(prompt, { systemPrompt, maxTokens: 1500 });
}

/**
 * Fast summarization - condense long text quickly
 */
export async function fastSummarize(text: string, focus?: string): Promise<string> {
  const systemPrompt = `Summarize the following text concisely. ${focus ? `Focus on: ${focus}` : ""}
Output a brief, actionable summary.`;

  return callCerebras(text, { systemPrompt, maxTokens: 500 });
}

/**
 * Interactive prompt for Cerebras queries
 */
async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return value ? new TextDecoder().decode(value).trim() : "";
}

/**
 * CLI handler for cerebras command
 */
export async function handleCerebras(args: string[]): Promise<void> {
  console.log("");
  console.log(s.header("Cerebras Fast Query"));
  console.log("");

  const apiKey = getCerebrasKey();
  if (!apiKey) {
    console.log(s.error("Cerebras API key not found."));
    console.log(s.dim("Set CEREBRAS_API_KEY environment variable or add cerebrasKey to your config."));
    console.log("");
    console.log(s.label("Example:"));
    console.log(s.dim("  export CEREBRAS_API_KEY=your-key-here"));
    process.exit(1);
  }

  // Check for direct query in args
  const queryArg = args.filter(a => !a.startsWith("-")).join(" ");

  let query = queryArg;
  if (!query) {
    query = await prompt(s.dim("Query: "));
  }

  if (!query.trim()) {
    console.log(s.warn("No query provided."));
    process.exit(1);
  }

  console.log("");
  console.log(s.dim("Querying Cerebras (llama-3.3-70b)..."));
  console.log("");

  try {
    const startTime = Date.now();
    const result = await fastResearch(query);
    const elapsed = Date.now() - startTime;

    console.log(s.section("Response"));
    console.log("");
    console.log(result);
    console.log("");
    console.log(s.dim(`Completed in ${elapsed}ms`));
  } catch (error) {
    console.log(s.error(`Failed: ${error}`));
    process.exit(1);
  }
}
