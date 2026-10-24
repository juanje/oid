import type { AgentTurnDecision } from "@earendil-works/pi-agent-core";
import { type Api, type AssistantMessage, type Model, Type } from "@earendil-works/pi-ai";
import {
  type ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createExtensionRuntime,
  defineTool,
} from "@earendil-works/pi-coding-agent";
import { systemPromptFor, taskFor } from "./agent-prompt.ts";
import type { Attempt, AttemptKind, AttemptOutcome, Executor } from "./executor.ts";
import { formatRefusal } from "./refusal.ts";

/** Pi's read-only tools, its edit and write, and oid's try and report; no shell (D-05). The list also filters custom tools. */
export const AGENT_TOOLS = ["read", "ls", "find", "grep", "edit", "write", "try", "report"];

export interface PiExecutorOptions {
  /** Pi's models and their credentials: Pi reads those itself, oid never does. */
  runtime: ModelRuntime;
  model: Model<Api>;
  /** Pi's own retries of a provider error, on top of which oid adds none; Pi's defaults when left out. */
  retry?: { maxRetries: number; baseDelayMs: number };
}

/** Runs each attempt as a fresh Pi agent in the run's worktree (FR-AGENT-01). */
export function piExecutor(options: PiExecutorOptions): Executor {
  runPiOffline();
  return { run: (attempt) => runAgent(options, attempt) };
}

/** Pi must not download rg or fd when they are missing, nor send telemetry (DOMAIN.md, Pi SDK). Set before its runtime is made. */
export function runPiOffline(): void {
  process.env.PI_OFFLINE = "1";
  process.env.PI_TELEMETRY = "0";
}

async function runAgent({ runtime, model, retry }: PiExecutorOptions, attempt: Attempt): Promise<AttemptOutcome> {
  let reported = false;
  const { session } = await createAgentSession({
    cwd: attempt.worktree,
    modelRuntime: runtime,
    model,
    tools: AGENT_TOOLS,
    customTools: oidTools(attempt, () => {
      reported = true;
    }),
    resourceLoader: resourcesFor(attempt.kind),
    sessionManager: SessionManager.inMemory(attempt.worktree),
    // Neither the person's nor the project's Pi settings reach the agent; cache warming would send requests of its own.
    settingsManager: SettingsManager.inMemory({ cacheWarming: "off", ...(retry === undefined ? {} : { retry: { enabled: true, ...retry } }) }),
  });
  const outcome: AttemptOutcome = { turns: 0, stoppedAtLimit: false, model: `${model.provider}/${model.id}`, tokens: 0, cost: 0 };
  let last: AssistantMessage | undefined;
  // The executor counts the turns, never the model, and ends the agent between turns (DOMAIN.md, Pi SDK: chain to
  // the session's own finishTurn). A report ends the attempt: the turn it came in is its last.
  const sessionFinishTurn = session.agent.finishTurn;
  session.agent.finishTurn = async (turn, signal): Promise<AgentTurnDecision | undefined> => {
    outcome.turns += 1;
    if (reported) return { action: "end" };
    if (outcome.turns >= attempt.limits.turns && callsTools(turn.message)) {
      outcome.stoppedAtLimit = true;
      return { action: "end" };
    }
    return (await sessionFinishTurn?.(turn, signal)) ?? undefined;
  };
  session.subscribe((event) => {
    if (event.type !== "message_end" || event.message.role !== "assistant") return;
    last = event.message;
    outcome.tokens! += last.usage.totalTokens;
    outcome.cost! += last.usage.cost.total;
  });
  try {
    await session.prompt(taskFor(attempt));
  } finally {
    session.dispose();
  }
  // A provider error resolves the prompt; Pi has retried it by then.
  if (last?.stopReason === "error") outcome.error = last.errorMessage ?? "The provider answered with an error";
  return outcome;
}

function callsTools(message: AssistantMessage): boolean {
  return message.content.some((part) => part.type === "toolCall");
}

/** try and report, as the agent calls them, handed to oid's own (FR-AGENT-06, FR-AGENT-07). */
function oidTools(attempt: Attempt, onReport: () => void) {
  const text = (answer: string) => ({ content: [{ type: "text" as const, text: answer }], details: undefined });
  return [
    defineTool({
      name: "try",
      label: "try",
      description:
        "Runs one unit test file (test: its path) or this attempt's scenario (scenario: true), then the type check on the files you changed. It records nothing.",
      parameters: Type.Object({ test: Type.Optional(Type.String()), scenario: Type.Optional(Type.Boolean()) }),
      execute: async (_id, { test }) => {
        const result = await attempt.tools.try(test === undefined ? { scenario: true } : { test });
        return text(result.passed ? "Passed." : formatRefusal(result));
      },
    }),
    defineTool({
      name: "report",
      label: "report",
      description: "Ends the attempt with its result in a few words. Call it once, when you are done.",
      parameters: Type.Object({ result: Type.String() }),
      execute: async (_id, { result }) => {
        attempt.tools.report(result);
        onReport();
        return text("Reported: the attempt ends with this turn.");
      },
    }),
  ];
}

/**
 * What the agent loads besides its tools: oid's system prompt for its kind, and nothing of the project's or the
 * person's Pi setup (extensions, skills, prompt templates, context files such as AGENTS.md).
 */
function resourcesFor(kind: AttemptKind): ResourceLoader {
  const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  return {
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPromptFor(kind),
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}
