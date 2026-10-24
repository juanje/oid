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
import { AGENT_TOOLS, toolDescription } from "./agent-tools.ts";
import type { Attempt, AttemptKind, AttemptOutcome, Executor } from "./executor.ts";
import { toolCallRefusal, withoutHidden } from "./containment.ts";
import { formatRefusal } from "./refusal.ts";


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
    // The allowlist also filters custom tools, so try and report are in it.
    tools: AGENT_TOOLS.map((tool) => tool.name),
    customTools: oidTools(attempt, () => {
      reported = true;
    }),
    resourceLoader: resourcesFor(attempt.kind),
    sessionManager: SessionManager.inMemory(attempt.worktree),
    // Neither the person's nor the project's Pi settings reach the agent; cache warming would send requests of its own.
    settingsManager: SettingsManager.inMemory({ cacheWarming: "off", ...(retry === undefined ? {} : { retry: { enabled: true, ...retry } }) }),
  });
  let turns = 0;
  let stoppedAtLimit = false;
  // The executor counts the turns, never the model, and ends the agent between turns (DOMAIN.md, Pi SDK: chain to
  // the session's own finishTurn). A report ends the attempt: the turn it came in is its last.
  const sessionFinishTurn = session.agent.finishTurn;
  session.agent.finishTurn = async (turn, signal): Promise<AgentTurnDecision | undefined> => {
    turns += 1;
    if (reported) return { action: "end" };
    if (turns >= attempt.limits.turns && callsTools(turn.message)) {
      stoppedAtLimit = true;
      return { action: "end" };
    }
    return (await sessionFinishTurn?.(turn, signal)) ?? undefined;
  };
  // Every file tool's paths are checked before it runs, and listings and searches leave out what no agent sees
  // (FR-AGENT-05); chain to the session's own hooks, which its extensions use.
  let deniedToolCalls = 0;
  const sessionBeforeToolCall = session.agent.beforeToolCall;
  session.agent.beforeToolCall = async (context, signal) => {
    const refusal = toolCallRefusal(attempt.worktree, context.toolCall.name, (context.args ?? {}) as Record<string, unknown>);
    if (refusal === undefined) return sessionBeforeToolCall?.(context, signal);
    deniedToolCalls += 1;
    return { block: true, reason: formatRefusal(refusal) };
  };
  const sessionAfterToolCall = session.agent.afterToolCall;
  session.agent.afterToolCall = async (context, signal) => {
    const after = await sessionAfterToolCall?.(context, signal);
    const content = (after?.content ?? context.result.content).map((part) => (part.type === "text" ? { ...part, text: withoutHidden(context.toolCall.name, part.text) } : part));
    return { ...after, content };
  };
  const responses: AssistantMessage[] = [];
  session.subscribe((event) => {
    if (event.type === "message_end" && event.message.role === "assistant") responses.push(event.message);
  });
  try {
    await session.prompt(taskFor(attempt));
  } finally {
    session.dispose();
  }
  const sum = (of: (usage: AssistantMessage["usage"]) => number) => responses.reduce((total, response) => total + of(response.usage), 0);
  const outcome: AttemptOutcome = {
    turns,
    stoppedAtLimit,
    model: `${model.provider}/${model.id}`,
    tokens: sum((usage) => usage.totalTokens),
    cost: sum((usage) => usage.cost.total),
    deniedToolCalls,
  };
  // A provider error resolves the prompt; Pi has retried it by then.
  const last = responses.at(-1);
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
      description: toolDescription("try"),
      parameters: Type.Object({ test: Type.Optional(Type.String()), scenario: Type.Optional(Type.Boolean()) }),
      execute: async (_id, { test }) => {
        const result = await attempt.tools.try(test === undefined ? { scenario: true } : { test });
        return text(result.passed ? "Passed." : formatRefusal(result));
      },
    }),
    defineTool({
      name: "report",
      label: "report",
      description: toolDescription("report"),
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
