import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AssistantMessage,
  type AssistantMessageEventStream,
  type CredentialStore,
  type Message,
  type Model,
  type SimpleStreamOptions,
  type StreamFunction,
  type TranscriptContext,
  calculateCost,
  createAssistantMessageEventStream,
  createFauxCore,
  createProvider,
  fauxAssistantMessage,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AttemptKind } from "../../src/executor.ts";
import { filesUnder } from "./fixture.ts";

/** How the scripted model answers one attempt: it writes a prepared attempt's files, keeps calling tools, or fails. */
export interface ModelAttempt {
  kind: AttemptKind;
  scenario: string;
  /** Writes the files under `dir`, then reports, in one turn. */
  dir?: string;
  /** Reads a file every turn and never ends. */
  loops?: true;
  /** Answers every request with this provider error. */
  error?: string;
}

/** What the model was shown in one request. */
export interface ModelRequest {
  roles: Message["role"][];
  systemPrompt: string;
  task: string;
  tools: string[];
}

const PROVIDER = "scripted";
const MODEL_ID = "scripted-model";
// Prices per million tokens, so that the cost a real provider would report is above zero.
const COST = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

/**
 * A model for the Pi executor's scenarios: Pi's faux provider answering from a script, with the cost a real provider
 * reports, which faux leaves at zero. It keeps what each attempt's agent was shown, request by request.
 */
export class ScriptedModel {
  script: ModelAttempt[] = [];
  /** Each attempt's requests, in order: one attempt per Pi session. */
  readonly attempts: ModelRequest[][] = [];
  /** Requests that did not name the kind and scenario the script prepared next. */
  readonly mismatches: string[] = [];
  readonly runtime: ModelRuntime;
  readonly model: Model<string>;
  readonly #sessions: string[] = [];

  private constructor(runtime: ModelRuntime, model: Model<string>) {
    this.runtime = runtime;
    this.model = model;
  }

  static async create(): Promise<ScriptedModel> {
    const core = createFauxCore({ provider: PROVIDER, models: [{ id: MODEL_ID, cost: COST }] });
    const provider = createProvider({
      id: core.provider,
      auth: { apiKey: { name: "Scripted", resolve: async () => ({ auth: {} }) } },
      models: core.models,
      api: { stream: withCost(core.stream), streamSimple: withCost(core.streamSimple) },
    });
    // No credential store on disk: the scripted provider needs none, and the person's must never be read.
    const runtime = await ModelRuntime.create({ credentials: NO_CREDENTIALS, modelsPath: null, allowModelNetwork: false, refreshOnCreate: false });
    runtime.registerNativeProvider(provider);
    const scripted = new ScriptedModel(runtime, core.getModel());
    const respond = async (context: TranscriptContext, options: SimpleStreamOptions | undefined): Promise<AssistantMessage> => {
      core.appendResponses([respond]);
      return scripted.#answer(context, options?.sessionId ?? "");
    };
    core.setResponses([respond]);
    return scripted;
  }

  /** The model's id as the run log gives it. */
  get id(): string {
    return `${this.model.provider}/${this.model.id}`;
  }

  async #answer(context: TranscriptContext, sessionId: string): Promise<AssistantMessage> {
    if (!this.#sessions.includes(sessionId)) {
      this.#sessions.push(sessionId);
      this.attempts.push([]);
    }
    const index = this.#sessions.indexOf(sessionId);
    const request = requestOf(context.messages);
    this.attempts[index]!.push(request);
    const prepared = this.script[index];
    if (prepared === undefined) return fauxAssistantMessage(`No prepared attempt for request ${index + 1}`);
    if (!request.task.includes(prepared.kind) || !request.task.includes(prepared.scenario)) {
      this.mismatches.push(`Attempt ${index + 1} was not the ${prepared.kind} attempt for "${prepared.scenario}": ${request.task}`);
    }
    if (prepared.error !== undefined) return fauxAssistantMessage("", { stopReason: "error", errorMessage: prepared.error });
    if (prepared.loops) return fauxAssistantMessage(fauxToolCall("read", { path: "package.json" }));
    if (prepared.dir === undefined || this.attempts[index]!.length > 1) return fauxAssistantMessage("Done.");
    const writes = await Promise.all(
      (await filesUnder(prepared.dir)).map(async (path) => fauxToolCall("write", { path, content: await readFile(join(prepared.dir!, path), "utf8") })),
    );
    return fauxAssistantMessage([...writes, fauxToolCall("report", { result: `scripted ${prepared.kind} attempt` })]);
  }
}

const NO_CREDENTIALS: CredentialStore = {
  read: async () => undefined,
  list: async () => [],
  modify: async (_provider, change) => change(undefined),
  delete: async () => {},
};

/** A stream whose final message carries the cost of its usage at the model's prices, as real providers report it. */
function withCost<TOptions extends SimpleStreamOptions>(stream: StreamFunction<string, TOptions>): StreamFunction<string, TOptions> {
  return (model, context, options) => {
    const source = stream(model, context, options);
    const costed: AssistantMessageEventStream = createAssistantMessageEventStream();
    void (async () => {
      for await (const event of source) {
        if (event.type === "done" || event.type === "error") calculateCost(model, "message" in event ? event.message.usage : event.error.usage);
        costed.push(event);
      }
      costed.end();
    })();
    return costed;
  };
}

/** The prompt, task and tools of one request, from its messages: system messages declare the prompt and tools in order. */
function requestOf(messages: Message[]): ModelRequest {
  const tools = new Set<string>();
  let systemPrompt = "";
  for (const message of messages) {
    if (message.role !== "system") continue;
    for (const tool of message.toolsAdded ?? []) tools.add(tool.name);
    for (const tool of message.toolsRemoved ?? []) tools.delete(tool.name);
    systemPrompt ||= [textOf(message.content), ...Object.values(message.sections ?? {})].join("\n");
  }
  const user = messages.find((message) => message.role === "user");
  return { roles: messages.map((message) => message.role), systemPrompt, task: user === undefined ? "" : textOf(user.content), tools: [...tools].sort() };
}

function textOf(content: string | { type: string; text?: string }[]): string {
  return typeof content === "string" ? content : content.map((part) => part.text ?? "").join("");
}
