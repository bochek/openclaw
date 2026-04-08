---
title: "Active Memory"
summary: "A plugin-owned sidecar memory pass that injects relevant memory into interactive chat sessions"
read_when:
  - You want to understand what active memory is for
  - You want to turn active memory on for a conversational agent
  - You want to tune active memory behavior without enabling it everywhere
---

# Active Memory

Active memory is an optional plugin-owned memory pass that runs before the main
reply for eligible conversational sessions.

It exists because most memory systems are capable but reactive. They rely on
the main agent to decide when to search memory, or on the user to say things
like "remember this" or "search memory." By then, the moment where memory would
have made the reply feel natural has already passed.

Active memory gives the system one bounded chance to surface relevant memory
before the main reply is generated.

## Turn active memory on

The safest setup is:

1. enable the plugin
2. target one conversational agent
3. keep logging on only while tuning

Start with this in `openclaw.json`:

```json5
{
  plugins: {
    entries: {
      "active-memory": {
        enabled: true,
        config: {
          agents: ["main"],
          model: "github-copilot/gpt-5.4-mini",
          queryMode: "recent",
          timeoutMs: 8000,
          maxMemories: 2,
          persistTranscripts: false,
          logging: true,
        },
      },
    },
  },
}
```

Then restart the gateway:

```bash
pnpm gateway:dev
```

What this means:

- `plugins.entries.active-memory.enabled: true` turns the plugin on
- `config.agents: ["main"]` opts only the `main` agent into active memory
- active memory still runs only on eligible interactive persistent chat sessions

## How to see it

Active memory injects hidden system context for the model. It does not expose
raw `<active_memory>...</active_memory>` tags to the client.

If you want to see what active memory is doing in a live session, turn verbose
mode on for that session:

```text
/verbose on
```

With verbose enabled, OpenClaw can show:

- an active memory status line such as `Active Memory: ok 842ms recent 2 mem`
- a readable debug summary such as `Active Memory Debug: lemon pepper wings; blue cheese`

Those lines are derived from the same active memory pass that feeds the hidden
system context, but they are formatted for humans instead of exposing raw prompt
markup.

By default, the sidecar transcript for that pass is temporary and deleted after
the run completes.

Example flow:

```text
/verbose on
what wings should i order?
```

Expected visible reply shape:

```text
...normal assistant reply...

🧩 Active Memory: ok 842ms recent 2 mem
🔎 Active Memory Debug: lemon pepper wings; blue cheese
```

## When it runs

Active memory uses two gates:

1. **Config opt-in**
   The plugin must be enabled, and the current agent id must appear in
   `plugins.entries.active-memory.config.agents`.
2. **Strict runtime eligibility**
   Even when enabled and targeted, active memory only runs for eligible
   interactive persistent chat sessions.

The actual rule is:

```text
plugin enabled
+
agent id targeted
+
eligible interactive persistent chat session
=
active memory runs
```

If any of those fail, active memory does not run.

## Where it runs

Active memory is a conversational enrichment feature, not a platform-wide
inference feature.

| Surface                                                             | Runs active memory?                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| Control UI / web chat persistent sessions                           | Yes, if the plugin is enabled and the agent is targeted |
| Other interactive channel sessions on the same persistent chat path | Yes, if the plugin is enabled and the agent is targeted |
| Headless one-shot runs                                              | No                                                      |
| Heartbeat/background runs                                           | No                                                      |
| Generic internal `agent-command` paths                              | No                                                      |
| Subagent/internal helper execution                                  | No                                                      |

## Why use it

Use active memory when:

- the session is persistent and user-facing
- the agent has meaningful long-term memory to search
- continuity and personalization matter more than raw prompt determinism

It works especially well for:

- stable preferences
- recurring habits
- long-term user context that should surface naturally

It is a poor fit for:

- automation
- internal workers
- one-shot API tasks
- places where hidden personalization would be surprising

## How it works

The runtime shape is:

```mermaid
flowchart LR
  U["User Message"] --> Q["Build Memory Query"]
  Q --> R["Active Memory Sidecar"]
  R -->|NONE or empty| M["Main Reply"]
  R -->|relevant bullets| I["Append Hidden active_memory System Context"]
  I --> M["Main Reply"]
```

The sidecar can use only:

- `memory_search`
- `memory_get`

If the connection is weak, it should return `NONE`.

## Query modes

`config.queryMode` controls how much conversation the sidecar sees.

### `message`

Only the latest user message is sent.

```text
Latest user message only
```

Use this when:

- you want the fastest behavior
- you want the strongest bias toward stable preference recall
- follow-up turns do not need conversational context

Recommended timeout:

- start around `3000` to `5000` ms

### `recent`

The latest user message plus a small recent conversational tail is sent.

```text
Recent conversation tail:
user: ...
assistant: ...
user: ...

Latest user message:
...
```

Use this when:

- you want a better balance of speed and conversational grounding
- follow-up questions often depend on the last few turns

Recommended timeout:

- start around `8000` ms

### `full`

The full conversation is sent to the sidecar.

```text
Full conversation context:
user: ...
assistant: ...
user: ...
...
```

Use this when:

- the strongest recall quality matters more than latency
- the conversation contains important setup far back in the thread

Recommended timeout:

- increase it substantially compared with `message` or `recent`
- start around `15000` ms or higher depending on thread size

In general, timeout should increase with context size:

```text
message < recent < full
```

## Transcript persistence

Active memory sidecar runs create a real `session.jsonl` transcript during the
sidecar call.

By default, that transcript is temporary:

- it is written to a temp directory
- it is used only for the sidecar run
- it is deleted immediately after the run finishes

If you want to keep those sidecar transcripts on disk for debugging or
inspection, turn persistence on explicitly:

```json5
{
  plugins: {
    entries: {
      "active-memory": {
        enabled: true,
        config: {
          agents: ["main"],
          persistTranscripts: true,
          transcriptDir: "active-memory",
        },
      },
    },
  },
}
```

When enabled, active memory stores transcripts in a separate directory under the
target agent's sessions folder, not in the main user conversation transcript
path.

The default layout is conceptually:

```text
agents/<agent>/sessions/active-memory/<sidecar-session-id>.jsonl
```

You can change the relative subdirectory with `config.transcriptDir`.

Use this carefully:

- sidecar transcripts can accumulate quickly on busy sessions
- `full` query mode can duplicate a lot of conversation context
- these transcripts contain hidden prompt context and recalled memories

## Configuration

All active memory configuration lives under:

```text
plugins.entries.active-memory
```

The most important fields are:

| Key                         | Type                              | Meaning                                                               |
| --------------------------- | --------------------------------- | --------------------------------------------------------------------- |
| `enabled`                   | `boolean`                         | Enables the plugin itself                                             |
| `config.agents`             | `string[]`                        | Agent ids that may use active memory                                  |
| `config.model`              | `string`                          | Sidecar model ref                                                     |
| `config.queryMode`          | `"message" \| "recent" \| "full"` | Controls how much conversation the sidecar sees                       |
| `config.timeoutMs`          | `number`                          | Hard timeout for the sidecar                                          |
| `config.maxMemories`        | `number`                          | Maximum recalled bullets to inject                                    |
| `config.logging`            | `boolean`                         | Emits active memory logs while tuning                                 |
| `config.persistTranscripts` | `boolean`                         | Keeps sidecar transcripts on disk instead of deleting temp files      |
| `config.transcriptDir`      | `string`                          | Relative sidecar transcript directory under the agent sessions folder |

Useful tuning fields:

| Key                                                 | Type      | Meaning                                                       |
| --------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `config.maxMemoryChars`                             | `number`  | Maximum characters per memory bullet                          |
| `config.recentUserTurns`                            | `number`  | Prior user turns to include when `queryMode` is `recent`      |
| `config.recentAssistantTurns`                       | `number`  | Prior assistant turns to include when `queryMode` is `recent` |
| `config.recentUserChars`                            | `number`  | Max chars per recent user turn                                |
| `config.recentAssistantChars`                       | `number`  | Max chars per recent assistant turn                           |
| `config.requireConcreteRelevance`                   | `boolean` | Biases toward `NONE` on weak matches                          |
| `config.dropGenericPreferencesOnNonPreferenceTurns` | `boolean` | Filters generic preference noise                              |
| `config.cacheTtlMs`                                 | `number`  | Cache reuse for repeated identical queries                    |

## Recommended setup

Start with `recent`.

```json5
{
  plugins: {
    entries: {
      "active-memory": {
        enabled: true,
        config: {
          agents: ["main"],
          model: "github-copilot/gpt-5.4-mini",
          queryMode: "recent",
          timeoutMs: 8000,
          maxMemories: 2,
          logging: true,
        },
      },
    },
  },
}
```

If you want to inspect live behavior while tuning, use `/verbose on` in the
session instead of looking for a separate active-memory debug command.

Then move to:

- `message` if you want lower latency
- `full` if you decide extra context is worth the slower sidecar

## Debugging

If active memory is not showing up where you expect:

1. Confirm the plugin is enabled under `plugins.entries.active-memory.enabled`.
2. Confirm the current agent id is listed in `config.agents`.
3. Confirm you are testing through an interactive persistent chat session.
4. Turn on `config.logging: true` and watch the gateway logs.
5. Verify memory search itself works with `openclaw memory status --deep`.

If memory hits are noisy, tighten:

- `maxMemories`
- `requireConcreteRelevance`
- `dropGenericPreferencesOnNonPreferenceTurns`

If active memory is too slow:

- lower `queryMode`
- lower `timeoutMs`
- reduce recent turn counts
- reduce per-turn char caps

## Related pages

- [Memory Search](/concepts/memory-search)
- [Memory configuration reference](/reference/memory-config)
- [Plugin SDK setup](/plugins/sdk-setup)
