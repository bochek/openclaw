// Centralized structural mock type for harness modules under `src/`.
//
// Why structural?
// - Exporting inferred `vi.fn()` types can trigger TS2742 during d.ts emit under pnpm.
// - Referring to vitest's internal spy types can still hit pnpm-path portability issues.
//
// Keep this type minimal: only methods used in harnesses.
// Keep it permissive: avoid referencing vitest types while keeping mock ergonomics in harnesses.
// oxlint-disable-next-line typescript/no-explicit-any
type Any = any;

type AnyFn = (...args: Any[]) => Any;

// Callable mock function with `mock.*` helpers.
// Note: use `vi.fn<T>()` in harnesses to avoid Vitest's default `Constructable | Procedure` widening.
export type MockFn<T extends AnyFn = AnyFn> = T & {
  mock: {
    // Keep this wide; harness code typically inspects `[0]`, `[1]`, etc.
    calls: Any[][];
  };
  mockClear: () => Any;
  mockReset: () => Any;
  mockImplementation: (fn: AnyFn) => Any;
  mockImplementationOnce: (fn: AnyFn) => Any;
  mockReturnValue: (value: Any) => Any;
  mockReturnValueOnce: (value: Any) => Any;
  mockResolvedValue: (value: Any) => Any;
  mockResolvedValueOnce: (value: Any) => Any;
  mockRejectedValue: (value: Any) => Any;
  mockRejectedValueOnce: (value: Any) => Any;
  mockName: (name: string) => Any;
};
