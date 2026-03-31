import { vi } from "vitest";

// Extension-only Vitest runs should not preload the repo's full bundled
// channel inventory. Doing so pulls sibling plugins into single-file runs and
// creates self-import cycles for bundled extension entrypoints.
const emptyBundledChannelEntriesModule = {
  GENERATED_BUNDLED_CHANNEL_ENTRIES: [],
};

vi.doMock("../src/generated/bundled-channel-entries.generated.js", () => emptyBundledChannelEntriesModule);
vi.doMock("../src/generated/bundled-channel-entries.generated.ts", () => emptyBundledChannelEntriesModule);
