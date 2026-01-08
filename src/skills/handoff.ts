/**
 * Handoff Skill - Generate a focused research handoff summary
 *
 * Queries the current session's messages (not global peer representation)
 * filtered by instance_id and time, then analyzes locally to detect
 * "stuck" patterns and generate a concise, actionable summary.
 */

import Honcho from "@honcho-ai/core";
import { loadConfig, getSessionForPath } from "../config.js";
import { basename } from "path";
import {
  getCachedWorkspaceId,
  setCachedWorkspaceId,
  getCachedPeerId,
  setCachedPeerId,
  getCachedSessionId,
  setCachedSessionId,
  getClaudeInstanceId,
} from "../cache.js";
import * as s from "../styles.js";
import { execSync } from "child_process";

const WORKSPACE_APP_TAG = "honcho-clawd";

// How many messages to look at by default
const DEFAULT_MESSAGE_COUNT = 50;
// Skip messages over this length (likely code dumps)
const MAX_MESSAGE_LENGTH = 5000;

interface GitContext {
  branch: string;
  recentCommits: string[];
  uncommittedChanges: string[];
  isGitRepo: boolean;
}

/**
 * Get git context for the current directory
 */
function getGitContext(cwd: string): GitContext {
  const result: GitContext = {
    branch: "",
    recentCommits: [],
    uncommittedChanges: [],
    isGitRepo: false,
  };

  try {
    // Check if git repo
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
    result.isGitRepo = true;

    // Get current branch
    try {
      result.branch = execSync("git branch --show-current", { cwd, stdio: "pipe" })
        .toString().trim();
    } catch {
      result.branch = "detached";
    }

    // Get recent commits (last 5, from time window)
    try {
      const commits = execSync(
        `git log --oneline -5 --since="1 hour ago" --format="%h %s"`,
        { cwd, stdio: "pipe" }
      ).toString().trim();
      if (commits) {
        result.recentCommits = commits.split("\n").filter(c => c.trim());
      }
    } catch {
      // No recent commits
    }

    // Get uncommitted changes (staged + unstaged)
    try {
      const status = execSync("git status --porcelain", { cwd, stdio: "pipe" })
        .toString().trim();
      if (status) {
        result.uncommittedChanges = status.split("\n")
          .slice(0, 10)  // Limit to 10 files
          .map(line => {
            const status = line.slice(0, 2);
            const file = line.slice(3);
            const statusMap: Record<string, string> = {
              "M ": "modified",
              " M": "modified",
              "A ": "added",
              "D ": "deleted",
              " D": "deleted",
              "??": "untracked",
              "MM": "modified",
            };
            return `${statusMap[status] || status.trim()} ${file}`;
          });
      }
    } catch {
      // No changes
    }
  } catch {
    // Not a git repo
  }

  return result;
}

function getSessionName(cwd: string): string {
  const configuredSession = getSessionForPath(cwd);
  if (configuredSession) {
    return configuredSession;
  }
  return basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

interface HandoffOptions {
  verbose?: boolean;
  instanceOnly?: boolean;  // Filter to current instance only (default: true)
  messageCount?: number;   // How many messages to look at (default: 50)
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  peer_id: string;
  metadata?: { instance_id?: string; [key: string]: unknown };
}

interface StuckPattern {
  isStuck: boolean;
  stuckDuration?: number;  // minutes
  repeatedTopics: string[];
  errorPatterns: string[];
  attemptCount: number;
}

/**
 * Analyze messages to detect "stuck" patterns
 */
function analyzeStuckPatterns(messages: Message[]): StuckPattern {
  const topics: Map<string, number> = new Map();
  const errors: string[] = [];
  let earliestTimestamp: Date | null = null;

  for (const msg of messages) {
    const content = msg.content.toLowerCase();

    // Track timestamps
    const msgTime = new Date(msg.created_at);
    if (!earliestTimestamp || msgTime < earliestTimestamp) {
      earliestTimestamp = msgTime;
    }

    // Detect error patterns
    if (content.includes("error") || content.includes("failed") ||
        content.includes("not working") || content.includes("broken") ||
        content.includes("still") || content.includes("again")) {
      const errorMatch = content.match(/error[:\s]+([^.]+)/i) ||
                         content.match(/failed[:\s]+([^.]+)/i);
      if (errorMatch) {
        errors.push(errorMatch[1].trim().slice(0, 50));
      }
    }

    // Extract topics (file paths, function names, concepts)
    const pathMatches = content.match(/\/[\w\-/.]+\.(ts|js|tsx|jsx|py|go|rs)/g) || [];
    const funcMatches = content.match(/\b(function|class|def|fn)\s+(\w+)/gi) || [];

    for (const path of pathMatches) {
      topics.set(path, (topics.get(path) || 0) + 1);
    }
    for (const func of funcMatches) {
      topics.set(func, (topics.get(func) || 0) + 1);
    }
  }

  // Find repeated topics (mentioned 3+ times)
  const repeatedTopics = Array.from(topics.entries())
    .filter(([_, count]) => count >= 3)
    .map(([topic, _]) => topic);

  // Calculate stuck duration
  const stuckDuration = earliestTimestamp
    ? Math.round((Date.now() - earliestTimestamp.getTime()) / 60000)
    : 0;

  // Unique errors
  const uniqueErrors = [...new Set(errors)].slice(0, 3);

  return {
    isStuck: repeatedTopics.length > 0 || uniqueErrors.length >= 2,
    stuckDuration,
    repeatedTopics,
    errorPatterns: uniqueErrors,
    attemptCount: messages.length,
  };
}

/**
 * Summarize messages into key activities
 */
function summarizeActivities(messages: Message[], userPeerId: string): { userActions: string[]; aiActions: string[] } {
  const userActions: string[] = [];
  const aiActions: string[] = [];

  for (const msg of messages.slice(-20)) {  // Last 20 messages only
    const content = msg.content;
    const isUser = msg.peer_id === userPeerId;

    // Extract action summary
    let summary = "";
    if (content.startsWith("[Tool]")) {
      // AI tool use
      summary = content.replace("[Tool] ", "").slice(0, 80);
      aiActions.push(summary);
    } else if (isUser && content.length < 200) {
      // Short user message = likely a request
      summary = content.slice(0, 80);
      userActions.push(summary);
    } else if (isUser) {
      // Long user message = summarize first line
      summary = content.split("\n")[0].slice(0, 60) + "...";
      userActions.push(summary);
    }
  }

  return {
    userActions: userActions.slice(-5),  // Last 5 user actions
    aiActions: aiActions.slice(-8),      // Last 8 AI actions
  };
}

export async function generateHandoff(options: HandoffOptions = {}): Promise<string> {
  const config = loadConfig();
  if (!config) {
    throw new Error("Not configured. Run: honcho-clawd init");
  }

  const cwd = process.cwd();
  const instanceId = getClaudeInstanceId();
  const messageCount = options.messageCount ?? DEFAULT_MESSAGE_COUNT;

  const client = new Honcho({
    apiKey: config.apiKey,
    environment: "production",
  });

  // Get or create workspace
  let workspaceId = getCachedWorkspaceId(config.workspace);
  if (!workspaceId) {
    const workspace = await client.workspaces.getOrCreate({
      id: config.workspace,
      metadata: { app: WORKSPACE_APP_TAG },
    });
    workspaceId = workspace.id;
    setCachedWorkspaceId(config.workspace, workspaceId);
  }

  // Get or create session
  const sessionName = getSessionName(cwd);
  let sessionId = getCachedSessionId(cwd);
  if (!sessionId) {
    const session = await client.workspaces.sessions.getOrCreate(workspaceId, {
      id: sessionName,
      metadata: { cwd },
    });
    sessionId = session.id;
    setCachedSessionId(cwd, sessionName, sessionId);
  }

  // Get peer IDs
  let userPeerId = getCachedPeerId(config.peerName);
  if (!userPeerId) {
    const peer = await client.workspaces.peers.getOrCreate(workspaceId, { id: config.peerName });
    userPeerId = peer.id;
    setCachedPeerId(config.peerName, peer.id);
  }

  // Fetch session messages (this is the key change - session-scoped, not global)
  const [messagesResult, contextResult] = await Promise.allSettled([
    // Get raw messages from this session
    client.workspaces.sessions.messages.list(workspaceId, sessionId, {
      reverse: true,  // Most recent first
      // Filter by instance_id if available
      filters: instanceId && options.instanceOnly !== false
        ? { "metadata.instance_id": instanceId }
        : undefined,
    }),
    // Get session context with limit_to_session for session-only representation
    client.workspaces.sessions.getContext(workspaceId, sessionId, {
      limit_to_session: true,
      include_most_derived: true,
      summary: true,
      tokens: 2000,  // Keep it concise
    }),
  ]);

  // Process messages - filter by count and length
  let messages: Message[] = [];
  if (messagesResult.status === "fulfilled") {
    const page = messagesResult.value as any;
    const allMessages = page.data || [];

    // Filter: skip very long messages (code dumps), take up to messageCount
    messages = allMessages
      .filter((msg: Message) => msg.content.length <= MAX_MESSAGE_LENGTH)
      .slice(0, messageCount);  // Already sorted by most recent first
  }

  // Analyze patterns
  const stuckPattern = analyzeStuckPatterns(messages);
  const activities = summarizeActivities(messages, userPeerId);
  const gitContext = getGitContext(cwd);

  // Build the handoff document - CONCISE format
  const parts: string[] = [];

  parts.push("# Handoff Summary");
  parts.push("");
  parts.push(`Session: ${sessionName} | ${cwd}`);
  if (gitContext.isGitRepo && gitContext.branch) {
    parts.push(`Branch: ${gitContext.branch}`);
  }

  // Calculate time span from messages
  let timeSpan = "";
  if (messages.length > 0) {
    const oldest = new Date(messages[messages.length - 1].created_at);
    const newest = new Date(messages[0].created_at);
    const spanMinutes = Math.round((newest.getTime() - oldest.getTime()) / 60000);
    if (spanMinutes > 60) {
      timeSpan = ` spanning ${Math.round(spanMinutes / 60)}h`;
    } else if (spanMinutes > 0) {
      timeSpan = ` spanning ${spanMinutes}m`;
    }
  }
  parts.push(`Messages: ${messages.length}${timeSpan}`);
  if (instanceId) {
    parts.push(`Instance: ${instanceId.slice(0, 8)}...`);
  }
  parts.push("");

  // Stuck indicator
  if (stuckPattern.isStuck) {
    parts.push("## Status: STUCK");
    if (stuckPattern.stuckDuration) {
      parts.push(`Duration: ~${stuckPattern.stuckDuration} min on this issue`);
    }
    parts.push("");
  }

  // Current problem from session context
  if (contextResult.status === "fulfilled") {
    const ctx = contextResult.value as any;
    if (ctx.summary?.content) {
      parts.push("## Context");
      // Take just first 2-3 sentences of summary
      const summary = ctx.summary.content.split(".").slice(0, 3).join(".") + ".";
      parts.push(summary);
      parts.push("");
    }
  }

  // Error patterns
  if (stuckPattern.errorPatterns.length > 0) {
    parts.push("## Errors Encountered");
    for (const err of stuckPattern.errorPatterns) {
      parts.push(`- ${err}`);
    }
    parts.push("");
  }

  // What's been tried (recent AI actions)
  if (activities.aiActions.length > 0) {
    parts.push("## What's Been Tried");
    for (const action of activities.aiActions) {
      parts.push(`- ${action}`);
    }
    parts.push("");
  }

  // Repeated topics (indicates stuck points)
  if (stuckPattern.repeatedTopics.length > 0) {
    parts.push("## Focus Areas (Repeated)");
    for (const topic of stuckPattern.repeatedTopics.slice(0, 5)) {
      parts.push(`- ${topic}`);
    }
    parts.push("");
  }

  // Recent user requests
  if (activities.userActions.length > 0) {
    parts.push("## Recent Requests");
    for (const action of activities.userActions) {
      parts.push(`- ${action}`);
    }
    parts.push("");
  }

  // Git context
  if (gitContext.isGitRepo) {
    // Recent commits in time window
    if (gitContext.recentCommits.length > 0) {
      parts.push("## Recent Commits");
      for (const commit of gitContext.recentCommits) {
        parts.push(`- ${commit}`);
      }
      parts.push("");
    }

    // Uncommitted changes
    if (gitContext.uncommittedChanges.length > 0) {
      parts.push("## Uncommitted Changes");
      for (const change of gitContext.uncommittedChanges) {
        parts.push(`- ${change}`);
      }
      parts.push("");
    }
  }

  parts.push("---");
  parts.push("*handoff by honcho-clawd*");

  return parts.join("\n");
}

/**
 * Simple prompt helper for interactive input
 */
async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return value ? new TextDecoder().decode(value).trim() : "";
}

/**
 * Ask a multiple choice question
 */
async function askChoice(question: string, options: { key: string; label: string }[]): Promise<string> {
  console.log(s.label(question));
  for (const opt of options) {
    console.log(`  ${s.highlight(opt.key)}) ${opt.label}`);
  }
  const answer = await prompt(s.dim("Choice: "));
  const found = options.find(o => o.key.toLowerCase() === answer.toLowerCase());
  return found?.key || options[0].key;
}

export async function handleHandoff(args: string[]): Promise<void> {
  const verbose = args.includes("--verbose") || args.includes("-v");
  const quick = args.includes("--quick") || args.includes("-q");  // Skip questions

  console.log("");
  console.log(s.header("Handoff Summary"));
  console.log("");

  let instanceOnly = true;
  let messageCount: number = DEFAULT_MESSAGE_COUNT;

  // Interactive mode (unless --quick flag)
  if (!quick) {
    // Question 1: Instance scope
    const scopeChoice = await askChoice("What scope?", [
      { key: "1", label: "Current instance only (default)" },
      { key: "2", label: "All parallel instances" },
    ]);
    instanceOnly = scopeChoice === "1";

    // Question 2: Message count
    const countChoice = await askChoice("How many messages?", [
      { key: "1", label: "Last 50 messages (default)" },
      { key: "2", label: "Last 100 messages" },
      { key: "3", label: "Last 200 messages" },
      { key: "4", label: "All messages" },
    ]);
    if (countChoice === "2") messageCount = 100;
    else if (countChoice === "3") messageCount = 200;
    else if (countChoice === "4") messageCount = 10000;  // Effectively all

    console.log("");
  }

  const countDesc = messageCount >= 10000 ? "all" : `last ${messageCount}`;
  console.log(s.dim(`Analyzing ${countDesc} messages...`));
  console.log("");

  try {
    const handoff = await generateHandoff({
      verbose,
      instanceOnly,
      messageCount,
    });

    // Output the handoff
    console.log(handoff);

    // Also copy to clipboard if possible
    try {
      execSync(`echo ${JSON.stringify(handoff)} | pbcopy`, { stdio: "pipe" });
      console.log("");
      console.log(s.success("Copied to clipboard"));
    } catch {
      // Clipboard not available, that's fine
    }
  } catch (error) {
    console.log(s.error(`Failed to generate handoff: ${error}`));
    process.exit(1);
  }
}
