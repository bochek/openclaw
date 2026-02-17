import { MessageFlags } from "discord-api-types/v10";
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearDiscordComponentEntries,
  registerDiscordComponentEntries,
  resolveDiscordComponentEntry,
  resolveDiscordModalEntry,
} from "./components-registry.js";
import {
  buildDiscordComponentMessage,
  buildDiscordComponentMessageFlags,
  readDiscordComponentSpec,
} from "./components.js";

describe("discord components", () => {
  it("builds v2 containers with modal trigger", () => {
    const spec = readDiscordComponentSpec({
      text: "Choose a path",
      blocks: [
        {
          type: "actions",
          buttons: [{ label: "Approve", style: "success" }],
        },
      ],
      modal: {
        title: "Details",
        fields: [{ type: "text", label: "Requester" }],
      },
    });
    if (!spec) {
      throw new Error("Expected component spec to be parsed");
    }

    const result = buildDiscordComponentMessage({ spec });
    expect(result.components).toHaveLength(1);
    expect(result.components[0]?.isV2).toBe(true);
    expect(buildDiscordComponentMessageFlags(result.components)).toBe(MessageFlags.IsComponentsV2);
    expect(result.modals).toHaveLength(1);

    const trigger = result.entries.find((entry) => entry.kind === "modal-trigger");
    expect(trigger?.modalId).toBe(result.modals[0]?.id);
  });

  it("requires options for modal select fields", () => {
    expect(() =>
      readDiscordComponentSpec({
        modal: {
          title: "Details",
          fields: [{ type: "select", label: "Priority" }],
        },
      }),
    ).toThrow("options");
  });

  it("supports launch activity button actions", () => {
    const spec = readDiscordComponentSpec({
      blocks: [
        {
          type: "actions",
          buttons: [{ label: "Launch", action: "launch-activity" }],
        },
      ],
    });
    if (!spec) {
      throw new Error("Expected component spec to be parsed");
    }
    const result = buildDiscordComponentMessage({ spec });
    const entry = result.entries.find((component) => component.label === "Launch");
    expect(entry?.action).toBe("launch-activity");
  });

  it("rejects invalid or link activity actions", () => {
    expect(() =>
      readDiscordComponentSpec({
        blocks: [
          {
            type: "actions",
            buttons: [{ label: "Launch", action: "nope" }],
          },
        ],
      }),
    ).toThrow("launch-activity");

    expect(() =>
      readDiscordComponentSpec({
        blocks: [
          {
            type: "actions",
            buttons: [{ label: "Launch", action: "launch-activity", url: "https://example.com" }],
          },
        ],
      }),
    ).toThrow("link buttons");
  });

  it("requires attachment references for file blocks", () => {
    expect(() =>
      readDiscordComponentSpec({
        blocks: [{ type: "file", file: "https://example.com/report.pdf" }],
      }),
    ).toThrow("attachment://");
    expect(() =>
      readDiscordComponentSpec({
        blocks: [{ type: "file", file: "attachment://" }],
      }),
    ).toThrow("filename");
  });
});

describe("discord component registry", () => {
  beforeEach(() => {
    clearDiscordComponentEntries();
  });

  it("registers and consumes component entries", () => {
    registerDiscordComponentEntries({
      entries: [{ id: "btn_1", kind: "button", label: "Confirm" }],
      modals: [
        {
          id: "mdl_1",
          title: "Details",
          fields: [{ id: "fld_1", name: "name", label: "Name", type: "text" }],
        },
      ],
      messageId: "msg_1",
      ttlMs: 1000,
    });

    const entry = resolveDiscordComponentEntry({ id: "btn_1", consume: false });
    expect(entry?.messageId).toBe("msg_1");

    const modal = resolveDiscordModalEntry({ id: "mdl_1", consume: false });
    expect(modal?.messageId).toBe("msg_1");

    const consumed = resolveDiscordComponentEntry({ id: "btn_1" });
    expect(consumed?.id).toBe("btn_1");
    expect(resolveDiscordComponentEntry({ id: "btn_1" })).toBeNull();
  });
});
