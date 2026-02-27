import { describe, expect, it } from "vitest";
import { resolveOpenClawMetadata, resolveSkillInvocationPolicy } from "./frontmatter.js";

describe("resolveSkillInvocationPolicy", () => {
  it("defaults to enabled behaviors", () => {
    const policy = resolveSkillInvocationPolicy({});
    expect(policy.userInvocable).toBe(true);
    expect(policy.disableModelInvocation).toBe(false);
  });

  it("parses frontmatter boolean strings", () => {
    const policy = resolveSkillInvocationPolicy({
      "user-invocable": "no",
      "disable-model-invocation": "yes",
    });
    expect(policy.userInvocable).toBe(false);
    expect(policy.disableModelInvocation).toBe(true);
  });
});

describe("resolveOpenClawMetadata", () => {
  it("parses canonical capabilities from string array", () => {
    const metadata = resolveOpenClawMetadata({
      metadata: '{"openclaw":{"capabilities":["shell","network"]}}',
    });
    expect(metadata?.capabilities).toEqual(["shell", "network"]);
  });

  it("normalizes capability aliases used by other harnesses", () => {
    const metadata = resolveOpenClawMetadata({
      metadata: JSON.stringify({
        openclaw: {
          capabilities: ["web_fetch", "terminal", "subagent", "cron", "message"],
        },
      }),
    });
    expect(metadata?.capabilities).toEqual([
      "network",
      "shell",
      "sessions",
      "scheduling",
      "messaging",
    ]);
  });

  it("supports object map capability shape with constraints payload", () => {
    const metadata = resolveOpenClawMetadata({
      metadata: JSON.stringify({
        openclaw: {
          capabilities: {
            shell: { mode: "restricted", allow: ["git", "gh"] },
            network: { web_search: true, web_fetch: true },
          },
        },
      }),
    });
    expect(metadata?.capabilities).toEqual(["shell", "network"]);
  });

  it("supports object array capability shape", () => {
    const metadata = resolveOpenClawMetadata({
      metadata: JSON.stringify({
        openclaw: {
          capabilities: [
            { type: "network.search", constraints: { provider: "brave" } },
            { name: "filesystem", constraints: { paths: ["workspace"] } },
            { id: "browser", constraints: { screen: "read" } },
          ],
        },
      }),
    });
    expect(metadata?.capabilities).toEqual(["network", "filesystem", "browser"]);
  });
});
