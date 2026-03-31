import { vi } from "vitest";

type PiAiMockModule = Record<string, unknown>;

class MockEventStream {
  push = vi.fn((_event?: unknown) => {});
  end = vi.fn(() => {});
  constructor(
    _isDone?: (event: unknown) => boolean,
    _toResult?: (event: unknown) => unknown,
  ) {}
  async result(): Promise<unknown> {
    return undefined;
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<never, void, unknown> {
    // Minimal async stream surface for wrappers that decorate iteration/result.
  }
}

export function createPiAiStreamSimpleMock(): PiAiMockModule {
  return {
    EventStream: MockEventStream,
    getModel: vi.fn(),
    parseStreamingJson: vi.fn(),
    streamSimple: vi.fn(() => ({
      push: vi.fn(),
      result: vi.fn(async () => undefined),
      [Symbol.asyncIterator]: vi.fn(async function* () {
        // Minimal async stream shape for wrappers that patch iteration/result.
      }),
    })),
    validateToolArguments: vi.fn(),
  };
}
