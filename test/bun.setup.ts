import { mock as bunMock } from "bun:test";
import fsSync from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { plugin } from "bun";
import ts from "typescript";
import { describe, it, test, vi } from "vitest";
import { transformBunHoistSource } from "./bun-hoist-transform.ts";

type ViCompat = typeof vi & {
  advanceTimersByTimeAsync?: (ms: number) => Promise<void>;
  advanceTimersToNextTimerAsync?: () => Promise<void>;
  doMock?: typeof vi.mock;
  doUnmock?: (specifier: string) => void;
  getMockedSystemTime?: () => Date | null;
  getRealSystemTime?: () => number;
  hoisted?: <T>(factory: () => T) => T;
  importActual?: <T>(specifier: string) => Promise<T>;
  importMock?: <T>(specifier: string) => Promise<T>;
  isFakeTimers?: () => boolean;
  mocked?: <T>(item: T) => T;
  resetModules?: () => void;
  runAllTimersAsync?: () => Promise<void>;
  runOnlyPendingTimersAsync?: () => Promise<void>;
  setSystemTime?: (time: string | number | Date) => void;
  stubEnv?: (key: string, value: string | undefined) => void;
  stubGlobal?: (key: PropertyKey, value: unknown) => void;
  unmock?: (specifier: string) => void;
  unstubAllEnvs?: () => void;
  unstubAllGlobals?: () => void;
  waitFor?: <T>(
    callback: () => T | Promise<T>,
    options?: { interval?: number; timeout?: number },
  ) => Promise<T>;
};

const compat = vi as ViCompat;
const preloadBasename = path.basename(import.meta.filename);
const require = createRequire(import.meta.url);
const bunMockDebugEnabled = process.env.OPENCLAW_BUN_MOCK_DEBUG === "1";
const RealDate = Date;
const envSnapshot = new Map<string, string | undefined>();
const globalSnapshot = new Map<PropertyKey, PropertyDescriptor | undefined>();
const bundledActualModuleCache = new Map<string, Promise<string>>();
const transpiledActualModuleCache = new Map<string, Promise<string>>();
const actualModuleMetadataCache = new Map<
  string,
  {
    hasReExportDeclarations: boolean;
  }
>();
const bunMockExports = new Map<string, Record<PropertyKey, unknown>>();
const bunMockPending = new Map<string, Promise<void>>();
const bunMockResolved = new Set<string>();
const bunMockActualExports = new Map<string, Record<PropertyKey, unknown>>();
const bunMockRegisteredTargets = new Set<string>();
const bunMockScopeByTarget = new Map<string, string>();
const pendingAsyncMocks = new Set<Promise<void>>();
let activeImportScopeId: string | null = null;
let currentRegistrationScopeId: string | null = null;
let mockScopeCounter = 0;
let mockedSystemTime: Date | null = null;
let moduleResetGeneration = 0;
const BUN_TEST_HOIST_PLUGIN = Symbol.for("openclaw.bunTestHoistPluginRegistered");
const FORWARDING_MOCK = Symbol.for("openclaw.bunForwardingMock");

type ConditionalSuiteLike = {
  skip: typeof describe;
  only?: typeof describe;
  skipIf?: (condition: boolean) => typeof describe;
  runIf?: (condition: boolean) => typeof describe;
};

type ConditionalTestLike = {
  skip: typeof it;
  only: typeof it;
  skipIf?: (condition: boolean) => typeof it;
  runIf?: (condition: boolean) => typeof it;
};

function installConditionalRunnerCompat(
  runner: ConditionalSuiteLike | ConditionalTestLike,
): void {
  if (typeof runner.runIf !== "function") {
    runner.runIf = (condition: boolean) => (condition ? (runner as never) : runner.skip);
  }
  if (typeof runner.skipIf !== "function") {
    runner.skipIf = (condition: boolean) => (condition ? runner.skip : (runner as never));
  }
}

function resolveCallerPath(): string | undefined {
  const stack = new Error("trace").stack?.split("\n") ?? [];
  for (const line of stack.slice(1)) {
    const match = line.match(/\((.*?):\d+:\d+\)$/) ?? line.match(/at (.*?):\d+:\d+$/);
    const file = match?.[1];
    if (!file) {
      continue;
    }
    if (path.basename(file) === preloadBasename) {
      continue;
    }
    return file;
  }
  return undefined;
}

function restoreMockedDate(): void {
  if (globalThis.Date !== RealDate) {
    globalThis.Date = RealDate;
  }
}

function installMockedDate(now: Date): void {
  const mockedNow = now.getTime();
  class MockDate extends RealDate {
    constructor(value?: string | number | Date) {
      super(arguments.length === 0 ? mockedNow : value);
    }

    static now(): number {
      return mockedNow;
    }

    static parse = RealDate.parse;
    static UTC = RealDate.UTC;
  }
  Object.defineProperty(MockDate, Symbol.hasInstance, {
    value(instance: unknown) {
      return instance instanceof RealDate;
    },
  });
  globalThis.Date = MockDate as DateConstructor;
}

async function drainAsyncTimerQueue(iterations = 8): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    await Promise.resolve();
  }
}

function toModuleExportsObject(source: unknown): Record<PropertyKey, unknown> {
  if (source && typeof source === "object") {
    const normalized = { ...(source as Record<PropertyKey, unknown>) };
    if (!Object.prototype.hasOwnProperty.call(normalized, "default")) {
      normalized.default = normalized;
    }
    return normalized;
  }
  return { default: source };
}

function cacheActualExports(target: string, source: unknown): Record<PropertyKey, unknown> {
  const exportsObject = toModuleExportsObject(source);
  bunMockActualExports.set(target, exportsObject);
  const normalizedTarget = normalizeImporterPath(target);
  if (normalizedTarget) {
    bunMockActualExports.set(normalizedTarget, exportsObject);
    if (path.isAbsolute(normalizedTarget)) {
      bunMockActualExports.set(pathToFileURL(normalizedTarget).href, exportsObject);
    }
  }
  return exportsObject;
}

type ForwardingMock = ReturnType<typeof vi.fn> & {
  [FORWARDING_MOCK]?: ((...args: unknown[]) => unknown) | undefined;
};

function createForwardingMock(): ForwardingMock {
  const forwardingMock = vi.fn((...args: unknown[]) => {
    return forwardingMock[FORWARDING_MOCK]?.(...args);
  }) as ForwardingMock;
  forwardingMock[FORWARDING_MOCK] = undefined;
  return forwardingMock;
}

function isForwardingMock(value: unknown): value is ForwardingMock {
  return typeof value === "function" && FORWARDING_MOCK in (value as Record<PropertyKey, unknown>);
}

function normalizeImporterPath(importer?: string): string | undefined {
  if (!importer) {
    return undefined;
  }
  if (importer === "native" || importer.startsWith("node:")) {
    return undefined;
  }
  return importer.startsWith("file:") ? fileURLToPath(importer) : importer;
}

function toBypassMockImportSpecifier(specifier: string): string {
  if (specifier.startsWith("file:")) {
    const url = new URL(specifier);
    url.searchParams.set("openclaw-import-actual", "1");
    return url.href;
  }
  if (path.isAbsolute(specifier)) {
    const url = pathToFileURL(specifier);
    url.searchParams.set("openclaw-import-actual", "1");
    return url.href;
  }
  return specifier;
}

function isFileBackedModuleSpecifier(specifier: string): boolean {
  const normalized = normalizeImporterPath(specifier) ?? specifier;
  return path.isAbsolute(normalized) || normalized.startsWith("file:");
}

function isRelativeLikeSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  );
}

function resolveScopedImportSpecifier(specifier: string, importer: string, scopeId: string): string {
  if (specifier.startsWith("node:")) {
    return specifier;
  }
  if (!isRelativeLikeSpecifier(specifier)) {
    return specifier;
  }
  const importerUrl = importer.startsWith("file:") ? importer : pathToFileURL(importer).href;
  const scopedUrl = specifier.startsWith("file:")
    ? new URL(specifier)
    : path.isAbsolute(specifier)
      ? pathToFileURL(specifier)
      : new URL(specifier, importerUrl);
  scopedUrl.searchParams.set("openclaw-bun-scope", scopeId);
  return scopedUrl.href;
}

function resolveImportSpecifier(specifier: string, importer?: string): string {
  if (!importer || !isRelativeLikeSpecifier(specifier) || specifier.startsWith("node:")) {
    return specifier;
  }
  const importerUrl = importer.startsWith("file:") ? importer : pathToFileURL(importer).href;
  if (specifier.startsWith("file:")) {
    return specifier;
  }
  if (path.isAbsolute(specifier)) {
    return pathToFileURL(specifier).href;
  }
  return new URL(specifier, importerUrl).href;
}

function shouldServeScopedMock(scopeId: string): boolean {
  return activeImportScopeId === scopeId;
}

function appendImportGenerationSpecifier(specifier: string, generation: number): string {
  if (generation <= 0 || specifier.startsWith("node:")) {
    return specifier;
  }
  if (specifier.startsWith("file:")) {
    const url = new URL(specifier);
    url.searchParams.set("openclaw-bun-reset", String(generation));
    return url.href;
  }
  if (path.isAbsolute(specifier)) {
    const url = pathToFileURL(specifier);
    url.searchParams.set("openclaw-bun-reset", String(generation));
    return url.href;
  }
  return specifier;
}

function resolveScriptKind(filename: string): ts.ScriptKind {
  if (filename.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filename.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (filename.endsWith(".mts")) {
    return ts.ScriptKind.MTS;
  }
  if (filename.endsWith(".cts")) {
    return ts.ScriptKind.CTS;
  }
  if (filename.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  if (filename.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  if (filename.endsWith(".js")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function rewriteActualModuleSource(sourceText: string, sourcePath: string): string {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    resolveScriptKind(sourcePath),
  );
  const printer = ts.createPrinter();
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visit: ts.Visitor = (node) => {
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const nextSpecifier = resolveImportSpecifier(node.moduleSpecifier.text, sourcePath);
        return context.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          context.factory.createStringLiteral(nextSpecifier),
          node.attributes,
        );
      }
      if (
        ts.isExportDeclaration(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const nextSpecifier = resolveImportSpecifier(node.moduleSpecifier.text, sourcePath);
        return context.factory.updateExportDeclaration(
          node,
          node.modifiers,
          node.isTypeOnly,
          node.exportClause,
          context.factory.createStringLiteral(nextSpecifier),
          node.attributes,
        );
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const nextSpecifier = resolveImportSpecifier(node.arguments[0].text, sourcePath);
        return context.factory.updateCallExpression(node, node.expression, node.typeArguments, [
          context.factory.createStringLiteral(nextSpecifier),
        ]);
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit) as ts.SourceFile;
  };
  const transformed = ts.transform(sourceFile, [transformer]);
  try {
    return printer.printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
}

function getActualModuleMetadata(sourcePath: string): {
  hasReExportDeclarations: boolean;
} {
  let cached = actualModuleMetadataCache.get(sourcePath);
  if (cached) {
    return cached;
  }
  const sourceText = fsSync.readFileSync(sourcePath, "utf8");
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    resolveScriptKind(sourcePath),
  );
  cached = {
    hasReExportDeclarations: sourceFile.statements.some(
      (statement) =>
        ts.isExportDeclaration(statement) && Boolean(statement.moduleSpecifier) && !statement.isTypeOnly,
    ),
  };
  actualModuleMetadataCache.set(sourcePath, cached);
  return cached;
}

async function buildActualModuleEntry(specifier: string): Promise<string | undefined> {
  const sourcePath = resolvePlaceholderSourcePath(normalizeImporterPath(specifier) ?? specifier);
  if (!sourcePath || !path.isAbsolute(sourcePath) || !/\.[cm]?[jt]sx?$/.test(sourcePath)) {
    return undefined;
  }
  let pendingEntry = bundledActualModuleCache.get(sourcePath);
  if (!pendingEntry) {
    pendingEntry = (async () => {
      const outdir = await fsSync.promises.mkdtemp(
        path.join(os.tmpdir(), "openclaw-bun-import-actual-"),
      );
      const result = await Bun.build({
        entrypoints: [sourcePath],
        outdir,
        bundle: true,
        format: "esm",
        target: "bun",
        naming: "[name].mjs",
      });
      const outputPath = result.outputs[0]?.path;
      if (!result.success || !outputPath) {
        const errors = result.logs
          .map((log) => log.message || String(log))
          .filter(Boolean)
          .join("\n");
        throw new Error(`Failed to bundle actual module for ${sourcePath}${errors ? `\n${errors}` : ""}`);
      }
      return outputPath;
    })();
    bundledActualModuleCache.set(sourcePath, pendingEntry);
  }
  return await pendingEntry;
}

async function buildTranspiledActualModuleEntry(specifier: string): Promise<string | undefined> {
  const sourcePath = resolvePlaceholderSourcePath(normalizeImporterPath(specifier) ?? specifier);
  if (!sourcePath || !path.isAbsolute(sourcePath) || !/\.[cm]?[jt]sx?$/.test(sourcePath)) {
    return undefined;
  }
  let pendingEntry = transpiledActualModuleCache.get(sourcePath);
  if (!pendingEntry) {
    pendingEntry = (async () => {
      const sourceText = await fsSync.promises.readFile(sourcePath, "utf8");
      const rewrittenSource = rewriteActualModuleSource(sourceText, sourcePath);
      const transpiled = ts.transpileModule(rewrittenSource, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          verbatimModuleSyntax: true,
        },
        fileName: sourcePath,
      });
      const outdir = await fsSync.promises.mkdtemp(
        path.join(os.tmpdir(), "openclaw-bun-import-actual-transpiled-"),
      );
      const outputPath = path.join(outdir, `${path.basename(sourcePath).replace(/\.[^.]+$/, "")}.mjs`);
      await fsSync.promises.writeFile(outputPath, transpiled.outputText, "utf8");
      return outputPath;
    })();
    transpiledActualModuleCache.set(sourcePath, pendingEntry);
  }
  return await pendingEntry;
}

function shouldPreferTranspiledActualModule(specifier: string): boolean {
  const sourcePath = resolvePlaceholderSourcePath(normalizeImporterPath(specifier) ?? specifier);
  if (!sourcePath || !path.isAbsolute(sourcePath)) {
    return false;
  }
  return /\.[cm]?tsx?$/.test(sourcePath);
}

function shouldPreferTranspiledActualModuleBeforeDirectImport(specifier: string): boolean {
  const sourcePath = resolvePlaceholderSourcePath(normalizeImporterPath(specifier) ?? specifier);
  if (!sourcePath || !path.isAbsolute(sourcePath) || !/\.[cm]?tsx?$/.test(sourcePath)) {
    return false;
  }
  return true;
}

function resolveCallerSpecifiers(specifier: string, callerPathOrUrl?: string): string[] {
  const callerPath = normalizeImporterPath(callerPathOrUrl);
  if (!callerPath) {
    return [specifier];
  }
  if (specifier.startsWith("node:")) {
    return [specifier];
  }
  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  ) {
    const resolved = new Set<string>();
    const hasExplicitExtension =
      specifier.startsWith("file:") || /\.[cm]?[jt]sx?(?:[?#].*)?$/.test(specifier);
    if (!hasExplicitExtension) {
      try {
        resolved.add(createRequire(callerPath).resolve(specifier));
      } catch {
        // fall through to the import-style aliases below
      }
    }
    if (specifier.startsWith("file:")) {
      resolved.add(specifier);
    } else {
      const absolutePath = path.resolve(path.dirname(callerPath), specifier);
      resolved.add(pathToFileURL(absolutePath).href);
    }
    return [...resolved];
  }
  return [specifier];
}

function resolveActualImportSpecifiers(specifier: string, callerPathOrUrl?: string): string[] {
  const resolved = new Set<string>();
  const callerPath = normalizeImporterPath(callerPathOrUrl);
  if (!isRelativeLikeSpecifier(specifier) && !specifier.startsWith("node:")) {
    try {
      resolved.add(import.meta.resolve(specifier));
    } catch {
      // Fall back to the original specifier when package resolution is unavailable.
    }
  }
  const requireFromCaller = createRequire(callerPath ?? import.meta.url);
  try {
    const resolvedPath = requireFromCaller.resolve(specifier);
    resolved.add(resolvedPath);
    resolved.add(pathToFileURL(resolvedPath).href);
  } catch {
    // Bun can resolve some ESM-only packages via import.meta.resolve even when require.resolve fails.
  }
  for (const candidate of resolveCallerSpecifiers(specifier, callerPath)) {
    resolved.add(candidate);
  }
  return [...resolved];
}

function shouldRegisterResolvedActualMockTargets(specifier: string): boolean {
  if (isRelativeLikeSpecifier(specifier) || specifier.startsWith("node:")) {
    return false;
  }
  return true;
}

function isPiAiRootSpecifier(specifier: string): boolean {
  const normalized = normalizeImporterPath(specifier) ?? specifier;
  return (
    specifier === "@mariozechner/pi-ai" ||
    normalized === path.join(process.cwd(), "node_modules/@mariozechner/pi-ai/dist/index.js")
  );
}

function isPiAiOAuthSpecifier(specifier: string): boolean {
  const normalized = normalizeImporterPath(specifier) ?? specifier;
  return (
    specifier === "@mariozechner/pi-ai/oauth" ||
    normalized ===
      path.join(process.cwd(), "node_modules/@mariozechner/pi-ai/dist/utils/oauth/index.js")
  );
}

async function importActual<T>(specifier: string, callerOverride?: string): Promise<T> {
  if (isPiAiRootSpecifier(specifier)) {
    return (await import(pathToFileURL(path.join(process.cwd(), "test/bun.pi-ai-shim.ts")).href)) as T;
  }
  if (isPiAiOAuthSpecifier(specifier)) {
    return (await import(pathToFileURL(path.join(process.cwd(), "test/bun.pi-ai-oauth-shim.ts")).href)) as T;
  }
  const caller = callerOverride ?? resolveCallerPath();
  for (const resolvedSpecifier of resolveActualImportSpecifiers(specifier, caller)) {
    if (isFileBackedModuleSpecifier(resolvedSpecifier)) {
      const sourcePath = resolvePlaceholderSourcePath(
        normalizeImporterPath(resolvedSpecifier) ?? resolvedSpecifier,
      );
      const targetIsMocked =
        bunMockExports.has(resolvedSpecifier) ||
        bunMockPending.has(resolvedSpecifier) ||
        bunMockResolved.has(resolvedSpecifier);
      const preferTranspiledBeforeDirectImport =
        shouldPreferTranspiledActualModuleBeforeDirectImport(resolvedSpecifier) || targetIsMocked;
      if (sourcePath && /\.(?:[cm]?js|jsx)$/.test(sourcePath)) {
        if (bunMockDebugEnabled) {
          console.error("[bun-mock:import-actual:file]", resolvedSpecifier);
        }
        return (await import(toBypassMockImportSpecifier(resolvedSpecifier))) as T;
      }
      if (sourcePath && /\.(?:[cm]?tsx?)$/.test(sourcePath)) {
        if (preferTranspiledBeforeDirectImport) {
          try {
            const transpiledEntry = await buildTranspiledActualModuleEntry(resolvedSpecifier);
            if (transpiledEntry) {
              if (bunMockDebugEnabled) {
                console.error(
                  "[bun-mock:import-actual:transpile-first]",
                  resolvedSpecifier,
                  "=>",
                  transpiledEntry,
                );
              }
              const importedModule = (await import(
                toBypassMockImportSpecifier(transpiledEntry)
              )) as T;
              cacheActualExports(resolvedSpecifier, importedModule);
              return importedModule;
            }
          } catch (error) {
            if (bunMockDebugEnabled) {
              console.error(
                "[bun-mock:import-actual:transpile-first:error]",
                resolvedSpecifier,
                error,
              );
            }
          }
        }
        try {
          if (bunMockDebugEnabled) {
            console.error("[bun-mock:import-actual:file]", resolvedSpecifier);
          }
          const importedModule = (await import(toBypassMockImportSpecifier(resolvedSpecifier))) as T;
          cacheActualExports(resolvedSpecifier, importedModule);
          return importedModule;
        } catch (error) {
          if (bunMockDebugEnabled) {
            console.error("[bun-mock:import-actual:file:error]", resolvedSpecifier, error);
          }
        }
      }
      if (shouldPreferTranspiledActualModule(resolvedSpecifier)) {
        try {
          const transpiledEntry = await buildTranspiledActualModuleEntry(resolvedSpecifier);
          if (transpiledEntry) {
            if (bunMockDebugEnabled) {
              console.error(
                "[bun-mock:import-actual:transpile]",
                resolvedSpecifier,
                "=>",
                transpiledEntry,
              );
            }
            return (await import(toBypassMockImportSpecifier(transpiledEntry))) as T;
          }
        } catch (transpileError) {
          if (bunMockDebugEnabled) {
            console.error(
              "[bun-mock:import-actual:transpile:error]",
              resolvedSpecifier,
              transpileError,
            );
          }
        }
      }
      try {
        const bundledEntry = await buildActualModuleEntry(resolvedSpecifier);
        if (bundledEntry) {
          if (bunMockDebugEnabled) {
            console.error("[bun-mock:import-actual:bundle]", resolvedSpecifier, "=>", bundledEntry);
          }
          return (await import(toBypassMockImportSpecifier(bundledEntry))) as T;
        }
      } catch (error) {
        if (bunMockDebugEnabled) {
          console.error("[bun-mock:import-actual:bundle:error]", resolvedSpecifier, error);
        }
        try {
          const transpiledEntry = await buildTranspiledActualModuleEntry(resolvedSpecifier);
          if (transpiledEntry) {
            if (bunMockDebugEnabled) {
              console.error(
                "[bun-mock:import-actual:transpile]",
                resolvedSpecifier,
                "=>",
                transpiledEntry,
              );
            }
            return (await import(toBypassMockImportSpecifier(transpiledEntry))) as T;
          }
        } catch (transpileError) {
          if (bunMockDebugEnabled) {
            console.error(
              "[bun-mock:import-actual:transpile:error]",
              resolvedSpecifier,
              transpileError,
            );
          }
        }
      }
    } else {
      try {
        const requiredModule = require(resolvedSpecifier) as T;
        if (bunMockDebugEnabled) {
          console.error("[bun-mock:import-actual:require]", resolvedSpecifier);
        }
        return requiredModule;
      } catch (error) {
        if (bunMockDebugEnabled) {
          console.error("[bun-mock:import-actual:require:error]", resolvedSpecifier, error);
        }
      }
    }

    try {
      if (bunMockDebugEnabled) {
        console.error("[bun-mock:import-actual:import]", resolvedSpecifier);
      }
      return (await import(toBypassMockImportSpecifier(resolvedSpecifier))) as T;
    } catch (error) {
      if (bunMockDebugEnabled) {
        console.error("[bun-mock:import-actual:import:error]", resolvedSpecifier, error);
      }
    }
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    if (caller) {
      const resolved = pathToFileURL(path.resolve(path.dirname(caller), specifier));
      resolved.searchParams.set("openclaw-import-actual", "1");
      return (await import(resolved.href)) as T;
    }
  }
  if (specifier.startsWith("file:") || path.isAbsolute(specifier)) {
    return (await import(toBypassMockImportSpecifier(specifier))) as T;
  }
  return (await import(specifier)) as T;
}

function replaceModuleExports(target: Record<PropertyKey, unknown>, source: unknown): void {
  const normalizedSource = toModuleExportsObject(source);
  for (const key of Reflect.ownKeys(normalizedSource)) {
    const currentValue = target[key];
    const nextValue = normalizedSource[key];
    if (isForwardingMock(currentValue) && typeof nextValue === "function") {
      currentValue[FORWARDING_MOCK] = nextValue as (...args: unknown[]) => unknown;
      normalizedSource[key] = currentValue;
    }
  }
  for (const key of Reflect.ownKeys(target)) {
    Reflect.deleteProperty(target, key);
  }
  Object.assign(target, normalizedSource);
}

function mergeActualExportsForMock(
  actualSource: unknown,
  mockSource: unknown,
): Record<PropertyKey, unknown> {
  const actualExports = toModuleExportsObject(actualSource);
  const mockExports = toModuleExportsObject(mockSource);
  const mergedExports: Record<PropertyKey, unknown> = {};

  for (const key of Reflect.ownKeys(actualExports)) {
    mergedExports[key] = actualExports[key];
  }
  for (const key of Reflect.ownKeys(mockExports)) {
    mergedExports[key] = mockExports[key];
  }
  if (!Reflect.has(mergedExports, "default")) {
    mergedExports.default = mergedExports;
  }

  return mergedExports;
}

function collectBindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    collectBindingNames(element.name, into);
  }
}

function resolveStaticExportSourcePath(specifier: string, importerFilePath: string): string | undefined {
  if (specifier.startsWith("node:")) {
    return undefined;
  }
  if (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  ) {
    const resolvedPath = specifier.startsWith("file:")
      ? fileURLToPath(specifier)
      : path.resolve(path.dirname(importerFilePath), specifier);
    return resolvePlaceholderSourcePath(resolvedPath);
  }
  try {
    return resolvePlaceholderSourcePath(createRequire(importerFilePath).resolve(specifier));
  } catch {
    return undefined;
  }
}

function collectStaticExportNames(filePath: string, seen = new Set<string>()): Set<string> {
  if (seen.has(filePath)) {
    return new Set<string>();
  }
  seen.add(filePath);
  const exportNames = new Set<string>();
  const sourceText = fsSync.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      exportNames.add("default");
      continue;
    }

    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          exportNames.add(element.name.text);
        }
      }
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      !statement.exportClause &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      const reExportSourcePath = resolveStaticExportSourcePath(
        statement.moduleSpecifier.text,
        filePath,
      );
      if (reExportSourcePath && fsSync.existsSync(reExportSourcePath)) {
        const reExportNames = collectStaticExportNames(reExportSourcePath, seen);
        for (const exportName of reExportNames) {
          exportNames.add(exportName);
        }
      }
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    const isExported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) {
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      exportNames.add(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, exportNames);
      }
    }
  }

  return exportNames;
}

function resolvePlaceholderSourcePath(specifier: string): string | undefined {
  const normalizedPath = normalizeImporterPath(specifier);
  if (!normalizedPath || !/\.[cm]?[jt]sx?$/.test(normalizedPath)) {
    return undefined;
  }
  if (fsSync.existsSync(normalizedPath)) {
    return normalizedPath;
  }

  const parsedPath = path.parse(normalizedPath);
  const fallbackExtensions =
    parsedPath.ext === ".js"
      ? [".ts", ".tsx"]
      : parsedPath.ext === ".mjs"
        ? [".mts"]
        : parsedPath.ext === ".cjs"
          ? [".cts"]
          : parsedPath.ext === ".jsx"
            ? [".tsx", ".ts"]
            : [];

  for (const fallbackExtension of fallbackExtensions) {
    const candidatePath = path.join(parsedPath.dir, `${parsedPath.name}${fallbackExtension}`);
    if (fsSync.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return normalizedPath;
}

function seedPlaceholderFromSource(
  placeholder: Record<PropertyKey, unknown>,
  specifier: string,
): boolean {
  const sourcePath = resolvePlaceholderSourcePath(specifier);
  if (!sourcePath || !/\.[cm]?[jt]sx?$/.test(sourcePath) || !fsSync.existsSync(sourcePath)) {
    return false;
  }
  try {
    const exportNames = collectStaticExportNames(sourcePath);
    for (const exportName of exportNames) {
      if (exportName === "default") {
        continue;
      }
      placeholder[exportName] ??= undefined;
    }
    if (exportNames.has("default") && typeof placeholder.default === "undefined") {
      placeholder.default = placeholder;
    }
    return exportNames.size > 0;
  } catch {
    return false;
  }
}

function registerBunMock(specifier: string, factory?: unknown): void {
  const caller = resolveCallerPath();
  const resolvedSpecifiers = resolveCallerSpecifiers(specifier, caller);
  const primarySpecifier = resolvedSpecifiers[0] ?? specifier;
  const scopeId = currentRegistrationScopeId ?? caller ?? primarySpecifier;
  const useScopedRelativeTarget =
    Boolean(caller) &&
    isRelativeLikeSpecifier(specifier) &&
    scopeId === currentRegistrationScopeId;
  const additionalActualTargets = !useScopedRelativeTarget &&
    shouldRegisterResolvedActualMockTargets(primarySpecifier)
    ? resolveActualImportSpecifiers(primarySpecifier, caller)
    : [];
  const mockTargets = useScopedRelativeTarget
    ? [...new Set([resolveScopedImportSpecifier(specifier, caller!, scopeId), ...resolvedSpecifiers])]
    : [...new Set([...resolvedSpecifiers, ...additionalActualTargets])];
  for (const target of mockTargets) {
    bunMockRegisteredTargets.add(target);
  }
  if (bunMockDebugEnabled) {
    console.error(
      "[bun-mock]",
      specifier,
      "=>",
      mockTargets,
      typeof factory,
      typeof factory === "function" ? factory.length : "n/a",
    );
  }
  if (typeof factory !== "function") {
    const exportsObject = toModuleExportsObject(factory);
    for (const target of mockTargets) {
      seedPlaceholderFromSource(exportsObject, target);
      bunMockExports.set(target, exportsObject);
      bunMockPending.delete(target);
      bunMockResolved.add(target);
      bunMockScopeByTarget.set(target, scopeId);
    }
    if (bunMockDebugEnabled) {
      console.error("[bun-mock:register:direct:start]", mockTargets);
    }
    for (const target of mockTargets) {
      bunMock.module(target, async () => {
        if (!shouldServeScopedMock(scopeId)) {
          return await importActual<Record<PropertyKey, unknown>>(target);
        }
        if (bunMockDebugEnabled) {
          console.error("[bun-mock:callback]", target, typeof factory);
        }
        return exportsObject;
      });
    }
    if (bunMockDebugEnabled) {
      console.error("[bun-mock:register:direct:done]", mockTargets);
    }
    return;
  }

  let resolvedExportsObject: Record<PropertyKey, unknown> | undefined;
  let pendingModuleLoad: Promise<Record<PropertyKey, unknown>> | undefined;
  const placeholderExportsObject: Record<PropertyKey, unknown> = {};
  placeholderExportsObject.default = placeholderExportsObject;
  for (const target of mockTargets) {
    seedPlaceholderFromSource(placeholderExportsObject, target);
  }
  for (const target of mockTargets) {
    bunMockExports.set(target, placeholderExportsObject);
    bunMockScopeByTarget.set(target, scopeId);
  }
  const importOriginal = <T>(overrideSpecifier?: string) =>
    importActual<T>(overrideSpecifier ?? primarySpecifier, caller);
  const finalizeResolvedExports = async (resolvedModuleValue: unknown) => {
    const mergedExports = mergeActualExportsForMock(
      factory.length > 0
        ? await importOriginal<Record<PropertyKey, unknown>>().catch(() => placeholderExportsObject)
        : placeholderExportsObject,
      resolvedModuleValue,
    );
    resolvedExportsObject = mergedExports;
    replaceModuleExports(placeholderExportsObject, mergedExports);
    if (bunMockDebugEnabled) {
      console.error(
        "[bun-mock:resolved]",
        primarySpecifier,
        Reflect.ownKeys(mergedExports).map((key) => [String(key), typeof mergedExports[key]]),
      );
    }
    for (const target of mockTargets) {
      bunMockExports.set(target, placeholderExportsObject);
      bunMockResolved.add(target);
      bunMockScopeByTarget.set(target, scopeId);
    }
    return placeholderExportsObject;
  };
  const resolveFactoryExports = (): Record<PropertyKey, unknown> => {
    if (resolvedExportsObject) {
      return placeholderExportsObject;
    }
    if (pendingModuleLoad) {
      return placeholderExportsObject;
    }
    const moduleValue =
      factory.length > 0
        ? (factory as (importOriginal: <T>(specifier?: string) => Promise<T>) => unknown)(
            importOriginal,
          )
        : (factory as () => unknown)();
    const isThenable =
      moduleValue !== null &&
      (typeof moduleValue === "object" || typeof moduleValue === "function") &&
      typeof (moduleValue as PromiseLike<unknown>).then === "function";
    if (!isThenable && factory.length === 0) {
      const mergedExports = mergeActualExportsForMock(placeholderExportsObject, moduleValue);
      resolvedExportsObject = mergedExports;
      replaceModuleExports(placeholderExportsObject, mergedExports);
      for (const target of mockTargets) {
        bunMockExports.set(target, placeholderExportsObject);
        bunMockPending.delete(target);
        bunMockResolved.add(target);
        bunMockScopeByTarget.set(target, scopeId);
      }
      return placeholderExportsObject;
    }
    pendingModuleLoad = Promise.resolve(moduleValue)
      .then(finalizeResolvedExports)
      .finally(() => {
        pendingAsyncMocks.delete(pendingPromise);
        for (const target of mockTargets) {
          bunMockPending.delete(target);
        }
      });

    const pendingPromise = pendingModuleLoad.then(() => undefined);
    pendingAsyncMocks.add(pendingPromise);
    for (const target of mockTargets) {
      bunMockPending.set(target, pendingPromise);
      bunMockScopeByTarget.set(target, scopeId);
    }
    return placeholderExportsObject;
  };

  for (const target of mockTargets) {
    bunMock.module(target, async () => {
      if (!shouldServeScopedMock(scopeId)) {
        return await importActual<Record<PropertyKey, unknown>>(target);
      }
      const exportsObject = resolveFactoryExports();
      if (pendingModuleLoad) {
        await pendingModuleLoad;
      }
      if (bunMockDebugEnabled) {
        console.error("[bun-mock:callback]", target, activeImportScopeId, scopeId);
      }
      return exportsObject;
    });
  }
}

async function waitForCompat<T>(
  callback: () => T | Promise<T>,
  options?: { interval?: number; timeout?: number },
): Promise<T> {
  const timeout = options?.timeout ?? 1_000;
  const interval = options?.interval ?? 20;
  const deadline = Date.now() + timeout;
  let lastError: unknown;
  // Keep retrying until the callback stops throwing or the timeout expires.
  // Bun's Vitest shim does not currently expose `vi.waitFor`.
  while (Date.now() <= deadline) {
    try {
      return await callback();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  throw lastError;
}

if (typeof compat.importActual !== "function") {
  compat.importActual = <T>(specifier: string): Promise<T> => importActual<T>(specifier);
}

if (typeof compat.importMock !== "function") {
  compat.importMock = async <T>(specifier: string): Promise<T> => {
    await Promise.all(pendingAsyncMocks);
    return importActual<T>(specifier);
  };
}

if (typeof compat.hoisted !== "function") {
  compat.hoisted = <T>(factory: () => T): T => factory();
}

if (typeof compat.mocked !== "function") {
  compat.mocked = <T>(item: T): T => item;
}

if (typeof compat.stubEnv !== "function") {
  compat.stubEnv = (key: string, value: string | undefined): void => {
    if (!envSnapshot.has(key)) {
      envSnapshot.set(key, process.env[key]);
    }
    if (typeof value === "undefined") {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  };
}

if (typeof compat.unstubAllEnvs !== "function") {
  compat.unstubAllEnvs = (): void => {
    for (const [key, value] of envSnapshot) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    envSnapshot.clear();
  };
}

if (typeof compat.stubGlobal !== "function") {
  compat.stubGlobal = (key: PropertyKey, value: unknown): void => {
    if (!globalSnapshot.has(key)) {
      globalSnapshot.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    }
    Object.defineProperty(globalThis, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    });
  };
}

if (typeof compat.unstubAllGlobals !== "function") {
  compat.unstubAllGlobals = (): void => {
    for (const [key, descriptor] of globalSnapshot) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, key);
      }
    }
    globalSnapshot.clear();
  };
}

if (typeof compat.waitFor !== "function") {
  compat.waitFor = waitForCompat;
}

const originalUseFakeTimers = compat.useFakeTimers.bind(compat);
const originalUseRealTimers = compat.useRealTimers.bind(compat);
const originalAdvanceTimersByTime = compat.advanceTimersByTime.bind(compat);
const originalAdvanceTimersByTimeAsync =
  typeof compat.advanceTimersByTimeAsync === "function"
    ? compat.advanceTimersByTimeAsync.bind(compat)
    : undefined;
const originalAdvanceTimersToNextTimer = compat.advanceTimersToNextTimer.bind(compat);
const originalAdvanceTimersToNextTimerAsync =
  typeof compat.advanceTimersToNextTimerAsync === "function"
    ? compat.advanceTimersToNextTimerAsync.bind(compat)
    : undefined;
const originalRunAllTimers = compat.runAllTimers.bind(compat);
const originalRunAllTimersAsync =
  typeof compat.runAllTimersAsync === "function" ? compat.runAllTimersAsync.bind(compat) : undefined;
const originalRunOnlyPendingTimers = compat.runOnlyPendingTimers.bind(compat);
const originalRunOnlyPendingTimersAsync =
  typeof compat.runOnlyPendingTimersAsync === "function"
    ? compat.runOnlyPendingTimersAsync.bind(compat)
    : undefined;

function wrapTimerHandleUnref<T extends typeof setTimeout | typeof setInterval>(timerFn: T): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const handle = timerFn(...args);
    if (handle && typeof handle === "object" && "unref" in handle) {
      const timerHandle = handle as { unref?: () => unknown };
      if (typeof timerHandle.unref === "function") {
        timerHandle.unref = () => handle;
      }
    }
    return handle;
  }) as T;
}

compat.useFakeTimers = ((config?: Parameters<typeof vi.useFakeTimers>[0]) => {
  const nextConfig =
    mockedSystemTime && config && typeof config === "object" && !("now" in config)
      ? { ...config, now: mockedSystemTime }
      : mockedSystemTime && !config
        ? ({ now: mockedSystemTime } as Parameters<typeof vi.useFakeTimers>[0])
        : config;
  restoreMockedDate();
  const result = originalUseFakeTimers(nextConfig);
  globalThis.setTimeout = wrapTimerHandleUnref(globalThis.setTimeout.bind(globalThis));
  globalThis.setInterval = wrapTimerHandleUnref(globalThis.setInterval.bind(globalThis));
  return result;
}) as typeof vi.useFakeTimers;

compat.useRealTimers = (() => {
  mockedSystemTime = null;
  restoreMockedDate();
  return originalUseRealTimers();
}) as typeof vi.useRealTimers;

compat.advanceTimersByTimeAsync = async (ms: number): Promise<void> => {
  if (originalAdvanceTimersByTimeAsync) {
    await originalAdvanceTimersByTimeAsync(ms);
  } else {
    originalAdvanceTimersByTime(ms);
  }
  await drainAsyncTimerQueue();
};

compat.advanceTimersToNextTimerAsync = async (): Promise<void> => {
  if (originalAdvanceTimersToNextTimerAsync) {
    await originalAdvanceTimersToNextTimerAsync();
  } else {
    originalAdvanceTimersToNextTimer();
  }
  await drainAsyncTimerQueue();
};

compat.runAllTimersAsync = async (): Promise<void> => {
  if (originalRunAllTimersAsync) {
    await originalRunAllTimersAsync();
  } else {
    originalRunAllTimers();
  }
  await drainAsyncTimerQueue();
};

compat.runOnlyPendingTimersAsync = async (): Promise<void> => {
  if (originalRunOnlyPendingTimersAsync) {
    await originalRunOnlyPendingTimersAsync();
  } else {
    originalRunOnlyPendingTimers();
  }
  await drainAsyncTimerQueue();
};

if (typeof compat.setSystemTime !== "function") {
  compat.setSystemTime = (time: string | number | Date): void => {
    mockedSystemTime = new RealDate(time);
    if (compat.isFakeTimers?.()) {
      compat.useFakeTimers({ now: mockedSystemTime });
      return;
    }
    installMockedDate(mockedSystemTime);
  };
}

if (typeof compat.getMockedSystemTime !== "function") {
  compat.getMockedSystemTime = (): Date | null =>
    mockedSystemTime ? new RealDate(mockedSystemTime) : null;
}

if (typeof compat.getRealSystemTime !== "function") {
  compat.getRealSystemTime = (): number => RealDate.now();
}

compat.resetModules = (): void => {
  moduleResetGeneration += 1;
  compat.unstubAllEnvs?.();
  compat.unstubAllGlobals?.();
};

const wrappedMock = ((specifier: string, factory?: unknown) => {
  registerBunMock(specifier, factory);
}) as typeof vi.mock;

compat.mock = wrappedMock;

if (typeof compat.doMock !== "function") {
  compat.doMock = wrappedMock;
}

if (typeof compat.doUnmock !== "function") {
  compat.doUnmock = (_specifier: string): void => {};
}

if (typeof compat.unmock !== "function") {
  compat.unmock = compat.doUnmock;
}

installConditionalRunnerCompat(it as ConditionalTestLike);
installConditionalRunnerCompat(test as ConditionalTestLike);
installConditionalRunnerCompat(describe as ConditionalSuiteLike);

const compatGlobal = globalThis as typeof globalThis & {
  __openclawBeginMockScope?: (seed: string) => string;
  __openclawFlushPendingMocks?: () => Promise<void>;
  __openclawImportWithMocks?: (
    specifier: string,
    importer?: string,
    scopeId?: string,
  ) => Promise<Record<PropertyKey, unknown>>;
  __openclawResetRegisteredMocks?: () => void;
  __openclawScopedImportSpecifier?: (
    specifier: string,
    importer: string,
    scopeId: string,
  ) => string;
  __openclawViMock?: typeof wrappedMock;
  __openclawViUnmock?: (specifier: string) => void;
  __openclawWithMockScope?: <T>(scopeId: string, loader: () => Promise<T>) => Promise<T>;
};
compatGlobal.__openclawResetRegisteredMocks = (): void => {
  for (const target of bunMockRegisteredTargets) {
    const actualExports =
      bunMockActualExports.get(target) ??
      (normalizeImporterPath(target) ? bunMockActualExports.get(normalizeImporterPath(target)!) : undefined);
    if (actualExports) {
      bunMock.module(target, () => actualExports);
    }
  }
  pendingAsyncMocks.clear();
  bunMockPending.clear();
  bunMockExports.clear();
  bunMockResolved.clear();
  bunMockRegisteredTargets.clear();
  bunMockScopeByTarget.clear();
  currentRegistrationScopeId = null;
  activeImportScopeId = null;
  if (bunMockDebugEnabled) {
    console.error("[bun-mock:reset:done]");
  }
};
compatGlobal.__openclawBeginMockScope = (seed: string): string => {
  const scopeId = activeImportScopeId ?? `${seed}#${++mockScopeCounter}`;
  currentRegistrationScopeId = scopeId;
  return scopeId;
};
compatGlobal.__openclawFlushPendingMocks = async (): Promise<void> => {
  if (bunMockDebugEnabled) {
    console.error("[bun-mock:flush:start]", pendingAsyncMocks.size);
  }
  await Promise.all(pendingAsyncMocks);
  if (bunMockDebugEnabled) {
    console.error("[bun-mock:flush:done]");
  }
};
compatGlobal.__openclawScopedImportSpecifier = resolveScopedImportSpecifier;
compatGlobal.__openclawWithMockScope = async <T>(
  scopeId: string,
  loader: () => Promise<T>,
): Promise<T> => {
  const previousScopeId = activeImportScopeId;
  activeImportScopeId = scopeId;
  try {
    await Promise.all(pendingAsyncMocks);
    return await loader();
  } finally {
    activeImportScopeId = previousScopeId;
  }
};
compatGlobal.__openclawImportWithMocks = async (
  specifier: string,
  importer?: string,
  scopeId?: string,
): Promise<Record<PropertyKey, unknown>> => {
  const resolvedSpecifiers = resolveCallerSpecifiers(specifier, importer);
  const activeScopeId = scopeId ?? activeImportScopeId;
  for (const target of resolvedSpecifiers) {
    if (!activeScopeId || bunMockScopeByTarget.get(target) !== activeScopeId) {
      continue;
    }
    const pending = bunMockPending.get(target);
    if (pending) {
      await pending;
    }
    const exportsObject = bunMockExports.get(target);
    if (exportsObject && bunMockResolved.has(target)) {
      return exportsObject;
    }
  }
  const scopedSpecifier =
    importer && isRelativeLikeSpecifier(specifier) && activeScopeId
      ? resolveScopedImportSpecifier(specifier, importer, activeScopeId)
      : null;
  if (bunMockDebugEnabled && scopedSpecifier) {
    console.error(
      "[bun-mock:scoped-lookup]",
      scopedSpecifier,
      bunMockScopeByTarget.get(scopedSpecifier),
      activeScopeId,
      bunMockResolved.has(scopedSpecifier),
    );
  }
  if (scopedSpecifier && bunMockScopeByTarget.get(scopedSpecifier) === activeScopeId) {
    const pending = bunMockPending.get(scopedSpecifier);
    if (pending) {
      await pending;
    }
    const exportsObject = bunMockExports.get(scopedSpecifier);
    if (exportsObject && bunMockResolved.has(scopedSpecifier)) {
      return exportsObject;
    }
  }
  const importSpecifier =
    importer && isRelativeLikeSpecifier(specifier)
      ? resolveScopedImportSpecifier(specifier, importer, scopeId ?? importer)
      : specifier;
  const importTarget = appendImportGenerationSpecifier(importSpecifier, moduleResetGeneration);
  return (await import(importTarget)) as Record<PropertyKey, unknown>;
};
compatGlobal.__openclawViMock = wrappedMock;
compatGlobal.__openclawViUnmock = (specifier: string): void => {
  compat.unmock?.(specifier);
};

const pluginRegistry = globalThis as typeof globalThis & {
  [BUN_TEST_HOIST_PLUGIN]?: boolean;
};

if (!pluginRegistry[BUN_TEST_HOIST_PLUGIN]) {
  pluginRegistry[BUN_TEST_HOIST_PLUGIN] = true;
  const bunTransformFilter =
    /^(?!.*(?:\/node_modules\/|\/dist\/))(?:.*\/test\/.*|.*\/[^/]+\.(?:test|spec)\.[cm]?[jt]sx?|.*\/[^/]+\.(?:test-helpers|test-support|test-harness|test-mocks|mocks|mock-harness|harness)\.[cm]?[jt]sx?)$/;
  const bunPiAiShimPath = path.join(process.cwd(), "test/bun.pi-ai-shim.ts");
  const bunPiAiOAuthShimPath = path.join(process.cwd(), "test/bun.pi-ai-oauth-shim.ts");
  plugin({
    name: "openclaw-bun-vi-mock-hoist",
    setup(build) {
      build.onResolve({ filter: /^@mariozechner\/pi-ai$/ }, () => ({
        path: bunPiAiShimPath,
      }));
      build.onResolve({ filter: /^@mariozechner\/pi-ai\/oauth$/ }, () => ({
        path: bunPiAiOAuthShimPath,
      }));
      build.onLoad({ filter: bunTransformFilter }, async (args) => {
        const sourceText = await Bun.file(args.path).text();
        const ext = path.extname(args.path).toLowerCase();
        const loader =
          ext === ".tsx" ? "tsx" : ext === ".jsx" ? "jsx" : ext === ".json" ? "json" : "ts";
        if (
          args.path.endsWith("/test/setup.ts") ||
          args.path.endsWith("/test/bun.setup.ts") ||
          args.path.endsWith("/test/bun-hoist-transform.ts")
        ) {
          return {
            contents: sourceText,
            loader,
          };
        }
        const transformed = transformBunHoistSource({
          filePath: args.path,
          sourceText,
        });
        return {
          contents: transformed ?? sourceText,
          loader,
        };
      });
    },
  });
}

process.env.VITEST = "true";
process.env.OPENCLAW_PLUGIN_MANIFEST_CACHE_MS ??= "60000";

const TEST_PROCESS_MAX_LISTENERS = 128;
if (process.getMaxListeners() > 0 && process.getMaxListeners() < TEST_PROCESS_MAX_LISTENERS) {
  process.setMaxListeners(TEST_PROCESS_MAX_LISTENERS);
}

await import("./setup.ts");
