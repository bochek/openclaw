#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function readArgs(argv) {
  const [mode = "fresh", ...rest] = argv;
  const parsed = {
    mode,
    stateFile: "",
    sessionId: "",
    prompt: "",
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? "";
    if (token === "--state-file") {
      parsed.stateFile = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (token === "--session" || token === "--resume-session") {
      parsed.sessionId = rest[index + 1] ?? "";
      index += 1;
      continue;
    }
    parsed.prompt = token;
  }

  return parsed;
}

function loadState(stateFile) {
  if (!stateFile || !fs.existsSync(stateFile)) {
    return {
      freshCalls: 0,
      resumeCalls: 0,
      prompts: [],
      freshSessionIds: [],
      resumeSessionIds: [],
    };
  }
  return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
}

function saveState(stateFile, state) {
  if (!stateFile) {
    return;
  }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function extractExactReply(prompt) {
  const match = /exactly:\s*([\s\S]+)$/i.exec(prompt);
  return match?.[1]?.trim() || prompt.trim();
}

const { mode, stateFile, sessionId, prompt } = readArgs(process.argv.slice(2));
const state = loadState(stateFile);
state.prompts.push(prompt);

if (mode === "resume") {
  state.resumeCalls += 1;
  state.resumeSessionIds.push(sessionId);
  saveState(stateFile, state);
  process.stderr.write("session expired\n");
  process.exit(1);
}

state.freshCalls += 1;
state.freshSessionIds.push(sessionId);
saveState(stateFile, state);

const reply = extractExactReply(prompt);
const nextSessionId =
  state.freshCalls === 1
    ? "retry-probe-session-initial"
    : `retry-probe-session-${state.freshCalls}`;
process.stdout.write(
  `${JSON.stringify({
    type: "result",
    session_id: nextSessionId,
    result: reply,
  })}\n`,
);
