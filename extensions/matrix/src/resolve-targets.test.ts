import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelDirectoryEntry } from "../runtime-api.js";
import { resolveMatrixTargets, setMatrixDirectoryLookupsForTest } from "./resolve-targets.js";

const listMatrixDirectoryGroupsLiveMock = vi.fn();
const listMatrixDirectoryPeersLiveMock = vi.fn();

async function resolveUserTarget(input = "Alice") {
  const [result] = await resolveMatrixTargets({
    cfg: {},
    inputs: [input],
    kind: "user",
  });
  return result;
}

describe("resolveMatrixTargets (users)", () => {
  beforeEach(() => {
    listMatrixDirectoryPeersLiveMock.mockReset();
    listMatrixDirectoryGroupsLiveMock.mockReset();
    setMatrixDirectoryLookupsForTest({
      peers:
        listMatrixDirectoryPeersLiveMock as typeof import("./directory-live.js").listMatrixDirectoryPeersLive,
      groups:
        listMatrixDirectoryGroupsLiveMock as typeof import("./directory-live.js").listMatrixDirectoryGroupsLive,
    });
  });

  afterEach(() => {
    setMatrixDirectoryLookupsForTest(undefined);
  });

  it("resolves exact unique display name matches", async () => {
    const matches: ChannelDirectoryEntry[] = [
      { kind: "user", id: "@alice:example.org", name: "Alice" },
    ];
    listMatrixDirectoryPeersLiveMock.mockResolvedValue(matches);

    const result = await resolveUserTarget();

    expect(result?.resolved).toBe(true);
    expect(result?.id).toBe("@alice:example.org");
    expect(listMatrixDirectoryPeersLiveMock).toHaveBeenCalledWith({
      cfg: {},
      accountId: undefined,
      query: "Alice",
      limit: 5,
    });
  });

  it("does not resolve ambiguous or non-exact matches", async () => {
    const matches: ChannelDirectoryEntry[] = [
      { kind: "user", id: "@alice:example.org", name: "Alice" },
      { kind: "user", id: "@alice:evil.example", name: "Alice" },
    ];
    listMatrixDirectoryPeersLiveMock.mockResolvedValue(matches);

    const result = await resolveUserTarget();

    expect(result?.resolved).toBe(false);
    expect(result?.note).toMatch(/use full Matrix ID/i);
  });

  it("prefers exact group matches over first partial result", async () => {
    const matches: ChannelDirectoryEntry[] = [
      { kind: "group", id: "!one:example.org", name: "General", handle: "#general" },
      { kind: "group", id: "!two:example.org", name: "Team", handle: "#team" },
    ];
    listMatrixDirectoryGroupsLiveMock.mockResolvedValue(matches);

    const [result] = await resolveMatrixTargets({
      cfg: {},
      inputs: ["#team"],
      kind: "group",
    });

    expect(result?.resolved).toBe(true);
    expect(result?.id).toBe("!two:example.org");
    expect(result?.note).toBeUndefined();
    expect(listMatrixDirectoryGroupsLiveMock).toHaveBeenCalledWith({
      cfg: {},
      accountId: undefined,
      query: "#team",
      limit: 5,
    });
  });

  it("threads accountId into live Matrix target lookups", async () => {
    listMatrixDirectoryPeersLiveMock.mockResolvedValue([
      { kind: "user", id: "@alice:example.org", name: "Alice" },
    ]);
    listMatrixDirectoryGroupsLiveMock.mockResolvedValue([
      { kind: "group", id: "!team:example.org", name: "Team", handle: "#team" },
    ]);

    await resolveMatrixTargets({
      cfg: {},
      accountId: "ops",
      inputs: ["Alice"],
      kind: "user",
    });
    await resolveMatrixTargets({
      cfg: {},
      accountId: "ops",
      inputs: ["#team"],
      kind: "group",
    });

    expect(listMatrixDirectoryPeersLiveMock).toHaveBeenCalledWith({
      cfg: {},
      accountId: "ops",
      query: "Alice",
      limit: 5,
    });
    expect(listMatrixDirectoryGroupsLiveMock).toHaveBeenCalledWith({
      cfg: {},
      accountId: "ops",
      query: "#team",
      limit: 5,
    });
  });

  it("reuses directory lookups for normalized duplicate inputs", async () => {
    listMatrixDirectoryPeersLiveMock.mockResolvedValue([
      { kind: "user", id: "@alice:example.org", name: "Alice" },
    ]);
    listMatrixDirectoryGroupsLiveMock.mockResolvedValue([
      { kind: "group", id: "!team:example.org", name: "Team", handle: "#team" },
    ]);

    const userResults = await resolveMatrixTargets({
      cfg: {},
      inputs: ["Alice", " alice "],
      kind: "user",
    });
    const groupResults = await resolveMatrixTargets({
      cfg: {},
      inputs: ["#team", "#team"],
      kind: "group",
    });

    expect(userResults.every((entry) => entry.resolved)).toBe(true);
    expect(groupResults.every((entry) => entry.resolved)).toBe(true);
    expect(listMatrixDirectoryPeersLiveMock).toHaveBeenCalledTimes(1);
    expect(listMatrixDirectoryGroupsLiveMock).toHaveBeenCalledTimes(1);
  });

  it("accepts prefixed fully qualified ids without directory lookups", async () => {
    const userResults = await resolveMatrixTargets({
      cfg: {},
      inputs: ["matrix:user:@alice:example.org"],
      kind: "user",
    });
    const groupResults = await resolveMatrixTargets({
      cfg: {},
      inputs: ["matrix:room:!team:example.org"],
      kind: "group",
    });

    expect(userResults).toEqual([
      {
        input: "matrix:user:@alice:example.org",
        resolved: true,
        id: "@alice:example.org",
      },
    ]);
    expect(groupResults).toEqual([
      {
        input: "matrix:room:!team:example.org",
        resolved: true,
        id: "!team:example.org",
      },
    ]);
    expect(listMatrixDirectoryPeersLiveMock).not.toHaveBeenCalled();
    expect(listMatrixDirectoryGroupsLiveMock).not.toHaveBeenCalled();
  });
});
