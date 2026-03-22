#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import {
  pluginSdkDocMetadata,
  resolvePluginSdkDocImportSpecifier,
  type PluginSdkDocCategory,
  type PluginSdkDocEntrypoint,
  type PluginSdkDocStability,
} from "./lib/plugin-sdk-doc-metadata.ts";
import { pluginSdkEntrypoints } from "./lib/plugin-sdk-entries.mjs";

type PluginSdkApiExportKind =
  | "class"
  | "const"
  | "enum"
  | "function"
  | "interface"
  | "namespace"
  | "type"
  | "unknown"
  | "variable";

type PluginSdkApiSourceLink = {
  line: number;
  path: string;
};

type PluginSdkApiExport = {
  declaration: string | null;
  exportName: string;
  kind: PluginSdkApiExportKind;
  source: PluginSdkApiSourceLink | null;
};

type PluginSdkApiModule = {
  category: PluginSdkDocCategory;
  entrypoint: PluginSdkDocEntrypoint;
  exports: PluginSdkApiExport[];
  importSpecifier: string;
  source: PluginSdkApiSourceLink;
  stability: PluginSdkDocStability;
};

type PluginSdkApiBaseline = {
  generatedBy: "scripts/generate-plugin-sdk-api-baseline.ts";
  modules: PluginSdkApiModule[];
};

type PluginSdkApiBaselineRender = {
  baseline: PluginSdkApiBaseline;
  json: string;
  jsonl: string;
};

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const writeMode = args.has("--write");

if (checkOnly === writeMode) {
  console.error("Use exactly one of --check or --write.");
  process.exit(1);
}

const repoRoot = process.cwd();
const jsonPath = path.join(repoRoot, "docs", ".generated", "plugin-sdk-api-baseline.json");
const statefilePath = path.join(repoRoot, "docs", ".generated", "plugin-sdk-api-baseline.jsonl");
const generatedBy = "scripts/generate-plugin-sdk-api-baseline.ts" as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join(path.posix.sep);
}

function buildSourceLink(filePath: string, start: number): PluginSdkApiSourceLink {
  const sourceFile = program.getSourceFile(filePath);
  assert(sourceFile, `Unable to read source file for ${relativePath(filePath)}`);
  const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  return {
    line,
    path: relativePath(filePath),
  };
}

function inferExportKind(
  symbol: ts.Symbol,
  declaration: ts.Declaration | undefined,
): PluginSdkApiExportKind {
  if (declaration) {
    switch (declaration.kind) {
      case ts.SyntaxKind.ClassDeclaration:
        return "class";
      case ts.SyntaxKind.EnumDeclaration:
        return "enum";
      case ts.SyntaxKind.FunctionDeclaration:
        return "function";
      case ts.SyntaxKind.InterfaceDeclaration:
        return "interface";
      case ts.SyntaxKind.ModuleDeclaration:
        return "namespace";
      case ts.SyntaxKind.TypeAliasDeclaration:
        return "type";
      case ts.SyntaxKind.VariableDeclaration: {
        const variableStatement = declaration.parent?.parent;
        if (
          variableStatement &&
          ts.isVariableStatement(variableStatement) &&
          (ts.getCombinedNodeFlags(variableStatement.declarationList) & ts.NodeFlags.Const) !== 0
        ) {
          return "const";
        }
        return "variable";
      }
      default:
        break;
    }
  }

  if (symbol.flags & ts.SymbolFlags.Function) {
    return "function";
  }
  if (symbol.flags & ts.SymbolFlags.Class) {
    return "class";
  }
  if (symbol.flags & ts.SymbolFlags.Interface) {
    return "interface";
  }
  if (symbol.flags & ts.SymbolFlags.TypeAlias) {
    return "type";
  }
  if (symbol.flags & ts.SymbolFlags.ConstEnum || symbol.flags & ts.SymbolFlags.RegularEnum) {
    return "enum";
  }
  if (symbol.flags & ts.SymbolFlags.Variable) {
    return "variable";
  }
  if (symbol.flags & ts.SymbolFlags.NamespaceModule || symbol.flags & ts.SymbolFlags.ValueModule) {
    return "namespace";
  }
  return "unknown";
}

function resolveSymbolAndDeclaration(symbol: ts.Symbol): {
  declaration: ts.Declaration | undefined;
  resolvedSymbol: ts.Symbol;
} {
  const resolvedSymbol =
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declarations = resolvedSymbol.getDeclarations() ?? symbol.getDeclarations() ?? [];
  const declaration = declarations.find((candidate) => candidate.kind !== ts.SyntaxKind.SourceFile);
  return { declaration, resolvedSymbol };
}

function printNode(declaration: ts.Declaration): string | null {
  if (ts.isFunctionDeclaration(declaration)) {
    const signatures = checker.getTypeAtLocation(declaration).getCallSignatures();
    if (signatures.length === 0) {
      return `export function ${declaration.name?.text ?? "anonymous"}();`;
    }
    return signatures
      .map(
        (signature) =>
          `export function ${declaration.name?.text ?? "anonymous"}${checker.signatureToString(signature)};`,
      )
      .join("\n");
  }

  if (ts.isVariableDeclaration(declaration)) {
    const name = declaration.name.getText();
    const type = checker.getTypeAtLocation(declaration);
    const prefix =
      declaration.parent && (ts.getCombinedNodeFlags(declaration.parent) & ts.NodeFlags.Const) !== 0
        ? "const"
        : "let";
    return `export ${prefix} ${name}: ${checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation)};`;
  }

  if (ts.isInterfaceDeclaration(declaration)) {
    return `export interface ${declaration.name.text}`;
  }

  if (ts.isClassDeclaration(declaration)) {
    return `export class ${declaration.name?.text ?? "AnonymousClass"}`;
  }

  if (ts.isEnumDeclaration(declaration)) {
    return `export enum ${declaration.name.text}`;
  }

  if (ts.isModuleDeclaration(declaration)) {
    return `export namespace ${declaration.name.getText()}`;
  }

  if (ts.isTypeAliasDeclaration(declaration)) {
    const type = checker.getTypeAtLocation(declaration);
    const rendered = `export type ${declaration.name.text} = ${checker.typeToString(
      type,
      declaration,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals,
    )};`;
    if (rendered.length > 1200) {
      return `export type ${declaration.name.text} = /* see source */`;
    }
    return rendered;
  }

  const text = printer
    .printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile())
    .trim();
  if (!text) {
    return null;
  }
  return text.length > 1200
    ? `${text.slice(0, 1175).trimEnd()}\n/* truncated; see source */`
    : text;
}

function buildExportSurface(symbol: ts.Symbol): PluginSdkApiExport {
  const { declaration, resolvedSymbol } = resolveSymbolAndDeclaration(symbol);
  return {
    declaration: declaration ? printNode(declaration) : null,
    exportName: symbol.getName(),
    kind: inferExportKind(resolvedSymbol, declaration),
    source: declaration
      ? buildSourceLink(declaration.getSourceFile().fileName, declaration.getStart())
      : null,
  };
}

function sortExports(left: PluginSdkApiExport, right: PluginSdkApiExport): number {
  const kindRank: Record<PluginSdkApiExportKind, number> = {
    function: 0,
    const: 1,
    variable: 2,
    type: 3,
    interface: 4,
    class: 5,
    enum: 6,
    namespace: 7,
    unknown: 8,
  };

  const byKind = kindRank[left.kind] - kindRank[right.kind];
  if (byKind !== 0) {
    return byKind;
  }
  return left.exportName.localeCompare(right.exportName);
}

function buildModuleSurface(entrypoint: PluginSdkDocEntrypoint): PluginSdkApiModule {
  const metadata = pluginSdkDocMetadata[entrypoint];
  const importSpecifier = resolvePluginSdkDocImportSpecifier(entrypoint);
  const moduleSourcePath = path.join(repoRoot, "src", "plugin-sdk", `${entrypoint}.ts`);
  const sourceFile = program.getSourceFile(moduleSourcePath);
  assert(sourceFile, `Missing source file for ${importSpecifier}`);

  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  assert(moduleSymbol, `Unable to resolve module symbol for ${importSpecifier}`);

  const exports = checker
    .getExportsOfModule(moduleSymbol)
    .filter((symbol) => symbol.getName() !== "__esModule")
    .map((symbol) => buildExportSurface(symbol))
    .toSorted(sortExports);

  return {
    category: metadata.category,
    entrypoint,
    exports,
    importSpecifier,
    source: buildSourceLink(moduleSourcePath, 0),
    stability: metadata.stability,
  };
}

function buildJsonlLines(baseline: PluginSdkApiBaseline): string[] {
  const lines: string[] = [];

  for (const moduleSurface of baseline.modules) {
    lines.push(
      JSON.stringify({
        category: moduleSurface.category,
        entrypoint: moduleSurface.entrypoint,
        importSpecifier: moduleSurface.importSpecifier,
        recordType: "module",
        sourceLine: moduleSurface.source.line,
        sourcePath: moduleSurface.source.path,
        stability: moduleSurface.stability,
      }),
    );

    for (const exportSurface of moduleSurface.exports) {
      lines.push(
        JSON.stringify({
          declaration: exportSurface.declaration,
          entrypoint: moduleSurface.entrypoint,
          exportName: exportSurface.exportName,
          importSpecifier: moduleSurface.importSpecifier,
          kind: exportSurface.kind,
          recordType: "export",
          sourceLine: exportSurface.source?.line ?? null,
          sourcePath: exportSurface.source?.path ?? null,
        }),
      );
    }
  }

  return lines;
}

function renderBaseline(baseline: PluginSdkApiBaseline): PluginSdkApiBaselineRender {
  return {
    baseline,
    json: `${JSON.stringify(baseline, null, 2)}\n`,
    jsonl: `${buildJsonlLines(baseline).join("\n")}\n`,
  };
}

async function writeOutputs(rendered: PluginSdkApiBaselineRender): Promise<void> {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, rendered.json, "utf8");
  await fs.writeFile(statefilePath, rendered.jsonl, "utf8");
}

async function loadCurrentFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function validateMetadata(): void {
  const canonicalEntrypoints = new Set<string>(pluginSdkEntrypoints);
  const metadataEntrypoints = new Set<string>(Object.keys(pluginSdkDocMetadata));

  for (const entrypoint of metadataEntrypoints) {
    assert(
      canonicalEntrypoints.has(entrypoint),
      `Metadata entrypoint ${entrypoint} is not exported in the Plugin SDK.`,
    );
  }
}

const configPath = ts.findConfigFile(
  repoRoot,
  (filePath) => ts.sys.fileExists(filePath),
  "tsconfig.json",
);
assert(configPath, "Could not find tsconfig.json");
const configFile = ts.readConfigFile(configPath, (filePath) => ts.sys.readFile(filePath));
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"));
}
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

async function main(): Promise<void> {
  validateMetadata();

  const modules = (Object.keys(pluginSdkDocMetadata) as PluginSdkDocEntrypoint[])
    .map((entrypoint) => buildModuleSurface(entrypoint))
    .toSorted((left, right) => left.importSpecifier.localeCompare(right.importSpecifier));
  const rendered = renderBaseline({
    generatedBy,
    modules,
  });

  if (checkOnly) {
    const changedFiles: string[] = [];
    for (const [filePath, nextContent] of [
      [jsonPath, rendered.json],
      [statefilePath, rendered.jsonl],
    ] as const) {
      const currentContent = await loadCurrentFile(filePath);
      if (currentContent !== nextContent) {
        changedFiles.push(relativePath(filePath));
      }
    }

    if (changedFiles.length > 0) {
      console.error(
        [
          "Plugin SDK API baseline drift detected.",
          ...changedFiles.map((filePath) => `Expected current: ${filePath}`),
          "If this Plugin SDK surface change is intentional, run `pnpm plugin-sdk:api:gen` and commit the updated baseline files.",
          "If not intentional, treat this as API drift and fix the plugin-sdk exports or metadata first.",
        ].join("\n"),
      );
      process.exit(1);
    }

    console.log(
      `OK ${path.relative(repoRoot, jsonPath)} ${path.relative(repoRoot, statefilePath)}`,
    );
    return;
  }

  await writeOutputs(rendered);
  console.log(
    [
      `Wrote ${path.relative(repoRoot, jsonPath)}`,
      `Wrote ${path.relative(repoRoot, statefilePath)}`,
    ].join("\n"),
  );
}

await main();
