import { describe, expect, it, vi } from "vitest";

const listZaloGroupMembersMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock("./zalo-js.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listZaloGroupMembers: listZaloGroupMembersMock,
  };
});

vi.mock("./accounts.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    resolveZalouserAccountSync: () => ({
      accountId: "default",
      profile: "default",
      name: "test",
      enabled: true,
      authenticated: true,
      config: {},
    }),
  };
});

import { zalouserPlugin } from "./channel.js";

describe("zalouser directory group members", () => {
  it("accepts prefixed group ids from directory groups list output", async () => {
    await zalouserPlugin.directory!.listGroupMembers!({
      cfg: {},
      accountId: "default",
      groupId: "group:1471383327500481391",
      runtime: undefined,
    });

    expect(listZaloGroupMembersMock).toHaveBeenCalledWith("default", "1471383327500481391");
  });

  it("keeps backward compatibility for raw group ids", async () => {
    await zalouserPlugin.directory!.listGroupMembers!({
      cfg: {},
      accountId: "default",
      groupId: "1471383327500481391",
      runtime: undefined,
    });

    expect(listZaloGroupMembersMock).toHaveBeenCalledWith("default", "1471383327500481391");
  });
});
