import { describe, expect, it } from "vitest";
import { transformBunHoistSource } from "./bun-hoist-transform.ts";

describe("transformBunHoistSource", () => {
  it("moves vi hoists ahead of value imports and rewrites those imports as dynamic", () => {
    const transformed = transformBunHoistSource({
      filePath: "src/example.test.ts",
      sourceText: `
import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runThing } from "./thing.js";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("./thing.js", () => ({ runThing: mocks.run }));

afterEach(() => {
  vi.restoreAllMocks();
});

it("works", () => {
  expect(typeof fs.readFile).toBe("function");
  expect(runThing).toBeTypeOf("function");
});
`,
    });

    expect(transformed).not.toBeNull();
    expect(transformed).toContain('import { afterEach, describe, expect, it, vi } from "vitest";');
    expect(transformed).toContain(
      "const __openclawMockScope = globalThis.__openclawBeginMockScope?.(import.meta.url) ?? import.meta.url;",
    );
    expect(transformed).toContain(
      'const __bunHoistedImport0 = await globalThis.__openclawWithMockScope(__openclawMockScope, async () => import("node:fs"));',
    );
    expect(transformed).toContain(
      'const __bunHoistedImport1 = await globalThis.__openclawWithMockScope(__openclawMockScope, async () => globalThis.__openclawImportWithMocks("./thing.js", import.meta.url, __openclawMockScope));',
    );
    expect(transformed).toContain("const mocks = vi.hoisted");
    expect(transformed).toContain("await globalThis.__openclawFlushPendingMocks?.();");

    const hoistedIndex = transformed!.indexOf("const mocks = vi.hoisted");
    const mockIndex = transformed!.indexOf('globalThis.__openclawViMock("./thing.js"');
    const lateFsImportIndex = transformed!.indexOf(
      'const __bunHoistedImport0 = await globalThis.__openclawWithMockScope(__openclawMockScope, async () => import("node:fs"));',
    );
    const afterEachIndex = transformed!.indexOf("afterEach(() =>");

    expect(hoistedIndex).toBeGreaterThan(-1);
    expect(mockIndex).toBeGreaterThan(hoistedIndex);
    expect(lateFsImportIndex).toBeGreaterThan(mockIndex);
    expect(afterEachIndex).toBeGreaterThan(lateFsImportIndex);
  });

  it("preserves value imports referenced inside a hoisted mock factory", () => {
    const transformed = transformBunHoistSource({
      filePath: "src/example-helper.test.ts",
      sourceText: `
import { helper } from "./helper.js";
import { vi } from "vitest";
import { subject } from "./subject.js";

vi.mock("./subject.js", () => ({ subject: helper }));

expect(subject).toBe(helper);
`,
    });

    expect(transformed).not.toBeNull();
    expect(transformed).toContain('import { helper } from "./helper.js";');
    expect(transformed).toContain(
      'const __bunHoistedImport0 = await globalThis.__openclawWithMockScope(__openclawMockScope, async () => globalThis.__openclawImportWithMocks("./subject.js", import.meta.url, __openclawMockScope));',
    );
    const helperImportIndex = transformed!.indexOf('import { helper } from "./helper.js";');
    const mockIndex = transformed!.indexOf('globalThis.__openclawViMock("./subject.js"');
    const subjectImportIndex = transformed!.indexOf(
      'const __bunHoistedImport0 = await globalThis.__openclawWithMockScope(__openclawMockScope, async () => globalThis.__openclawImportWithMocks("./subject.js", import.meta.url, __openclawMockScope));',
    );
    expect(helperImportIndex).toBeGreaterThan(-1);
    expect(mockIndex).toBeGreaterThan(helperImportIndex);
    expect(subjectImportIndex).toBeGreaterThan(mockIndex);
  });

  it("leaves side-effect import files alone when no vi mocks are present", () => {
    const transformed = transformBunHoistSource({
      filePath: "src/example-side-effect.test.ts",
      sourceText: `
import { describe, expect, it } from "vitest";
import "./test-mocks.js";
import { subject } from "./subject.js";
import { helper } from "./helper.js";

it("works", () => {
  expect(subject).toBe(helper);
});
`,
    });

    expect(transformed).toBeNull();
  });

  it("rewrites hook-time dynamic imports when vi.doMock is present without late static imports", () => {
    const transformed = transformBunHoistSource({
      filePath: "src/example-hook.test.ts",
      sourceText: `
import { beforeAll, expect, it, vi } from "vitest";

beforeAll(async () => {
  vi.doMock("./dep.js", () => ({ value: 42 }));
  const mod = await import("./subject.js");
  expect(mod).toBeDefined();
});

it("works", () => {
  expect(true).toBe(true);
});
`,
    });

    expect(transformed).not.toBeNull();
    expect(transformed).toContain("globalThis.__openclawResetRegisteredMocks?.();");
    expect(transformed).toContain(
      "const __openclawMockScope = globalThis.__openclawBeginMockScope?.(import.meta.url) ?? import.meta.url;",
    );
    expect(transformed).toContain(
      'const mod = await (await (async () => { await globalThis.__openclawFlushPendingMocks?.(); return globalThis.__openclawWithMockScope(__openclawMockScope, async () => globalThis.__openclawImportWithMocks("./subject.js", import.meta.url, __openclawMockScope)); })());',
    );
  });
});
