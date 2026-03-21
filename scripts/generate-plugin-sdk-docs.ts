import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import {
  resolvePluginSdkDocModuleRoute,
  resolvePluginSdkDocModuleSlug,
  type PluginSdkDocCategoryIndex,
  type PluginSdkDocExport,
  type PluginSdkDocExportKind,
  type PluginSdkDocModule,
  type PluginSdkDocSiteModel,
  type PluginSdkDocSourceLink,
  type PluginSdkDocTag,
} from "./lib/plugin-sdk-doc-ir.ts";
import {
  pluginSdkDocCategories,
  pluginSdkDocEntrypoints,
  pluginSdkDocMetadata,
  resolvePluginSdkDocImportSpecifier,
  type PluginSdkDocEntrypoint,
} from "./lib/plugin-sdk-doc-metadata.ts";
import {
  renderPluginSdkAllModulesDoc,
  renderPluginSdkCategoryDoc,
  renderPluginSdkModuleDoc,
} from "./lib/plugin-sdk-doc-render.ts";
import { pluginSdkEntrypoints } from "./lib/plugin-sdk-entries.mjs";

const checkOnly = process.argv.includes("--check");
const repoRoot = process.cwd();
const generatedRoot = path.join(repoRoot, "docs", ".generated");
const docsRoot = path.join(repoRoot, "docs", "reference", "plugin-sdk");
const githubBlobBase = "https://github.com/openclaw/openclaw/blob/main";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function relativePath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join(path.posix.sep);
}

function buildSourceLink(filePath: string, start: number): PluginSdkDocSourceLink {
  const relPath = relativePath(filePath);
  const sourceFile = program.getSourceFile(filePath);
  assert(sourceFile, `Unable to read source file for ${relPath}`);
  const line = sourceFile.getLineAndCharacterOfPosition(start).line + 1;
  return {
    line,
    path: relPath,
    url: `${githubBlobBase}/${relPath}#L${line}`,
  };
}

function formatTagText(text: ts.SymbolDisplayPart[] | string | undefined): string {
  if (!text) {
    return "";
  }
  if (typeof text === "string") {
    return text.trim();
  }
  return text
    .map((part) => part.text)
    .join("")
    .replaceAll(/\s+\n/g, "\n")
    .trim();
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function summarizeDocumentation(symbol: ts.Symbol, resolvedSymbol: ts.Symbol): string | null {
  return firstNonEmpty(
    ts.displayPartsToString(symbol.getDocumentationComment(checker)),
    ts.displayPartsToString(resolvedSymbol.getDocumentationComment(checker)),
  );
}

function collectTags(symbol: ts.Symbol, resolvedSymbol: ts.Symbol): PluginSdkDocTag[] {
  const merged = [...symbol.getJsDocTags(checker), ...resolvedSymbol.getJsDocTags(checker)];
  const deduped = new Map<string, PluginSdkDocTag>();
  for (const tag of merged) {
    const text = formatTagText(tag.text);
    const key = `${tag.name}:${text}`;
    if (!deduped.has(key)) {
      deduped.set(key, { name: tag.name, text });
    }
  }
  return [...deduped.values()];
}

function findTag(tags: PluginSdkDocTag[], name: string): string | null {
  return firstNonEmpty(...tags.filter((tag) => tag.name === name).map((tag) => tag.text || null));
}

function inferExportKind(
  symbol: ts.Symbol,
  declaration: ts.Declaration | undefined,
): PluginSdkDocExportKind {
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

function buildExportDoc(symbol: ts.Symbol): PluginSdkDocExport {
  const { declaration, resolvedSymbol } = resolveSymbolAndDeclaration(symbol);
  const tags = collectTags(symbol, resolvedSymbol);
  const kind = inferExportKind(resolvedSymbol, declaration);
  const summary = summarizeDocumentation(symbol, resolvedSymbol);
  const source = declaration
    ? buildSourceLink(declaration.getSourceFile().fileName, declaration.getStart())
    : null;

  return {
    declaration: declaration ? printNode(declaration) : null,
    deprecated: findTag(tags, "deprecated"),
    exportName: symbol.getName(),
    kind,
    remarks: findTag(tags, "remarks"),
    source,
    summary,
    tags,
  };
}

function sortExports(left: PluginSdkDocExport, right: PluginSdkDocExport): number {
  const kindRank: Record<PluginSdkDocExportKind, number> = {
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

function buildModuleDoc(entrypoint: PluginSdkDocEntrypoint): PluginSdkDocModule {
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
    .map((symbol) => buildExportDoc(symbol))
    .toSorted(sortExports);

  return {
    category: metadata.category,
    entrypoint,
    exports,
    importSpecifier,
    outputPath: path.posix.join(
      "docs",
      "reference",
      "plugin-sdk",
      "modules",
      `${resolvePluginSdkDocModuleSlug(entrypoint)}.mdx`,
    ),
    route: resolvePluginSdkDocModuleRoute(entrypoint),
    slug: resolvePluginSdkDocModuleSlug(entrypoint),
    source: buildSourceLink(moduleSourcePath, 0),
    stability: metadata.stability,
    summary: metadata.summary,
  };
}

function buildCategoryIndexes(modules: PluginSdkDocModule[]): PluginSdkDocCategoryIndex[] {
  return pluginSdkDocCategories.map((category) => {
    const categoryModules = modules
      .filter((moduleDoc) => moduleDoc.category === category)
      .toSorted((left, right) => left.importSpecifier.localeCompare(right.importSpecifier));

    return {
      category,
      modules: categoryModules,
      outputPath: path.posix.join("docs", "reference", "plugin-sdk", `${category}.md`),
      route: `/reference/plugin-sdk/${category}`,
    };
  });
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeFileEnsuringDir(filePath: string, content: string): Promise<void> {
  await ensureDir(filePath);
  await fs.writeFile(filePath, content, "utf8");
}

function runOxfmt(pathsToFormat: string[]): void {
  if (pathsToFormat.length === 0) {
    return;
  }

  const localOxfmt = path.join(repoRoot, "node_modules", ".bin", "oxfmt");
  const oxfmtCommand = ts.sys.fileExists(localOxfmt) ? localOxfmt : "oxfmt";

  const result = spawnSync(oxfmtCommand, ["--write", ...pathsToFormat], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(output || "oxfmt failed while formatting generated Plugin SDK docs.");
  }
}

async function formatGeneratedDocs(outputs: Map<string, string>): Promise<Map<string, string>> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-sdk-docs-"));
  const markdownPaths: string[] = [];

  for (const [targetPath, content] of outputs) {
    const tempPath = path.join(tempRoot, relativePath(targetPath));
    await writeFileEnsuringDir(tempPath, content);
    if (tempPath.endsWith(".md") || tempPath.endsWith(".mdx")) {
      markdownPaths.push(tempPath);
    }
  }

  runOxfmt(markdownPaths);

  const formatted = new Map<string, string>();
  for (const [targetPath] of outputs) {
    const tempPath = path.join(tempRoot, relativePath(targetPath));
    formatted.set(targetPath, await fs.readFile(tempPath, "utf8"));
  }
  await fs.rm(tempRoot, { force: true, recursive: true });
  return formatted;
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

function buildOutputs(siteModel: PluginSdkDocSiteModel): Map<string, string> {
  const outputs = new Map<string, string>();

  for (const moduleDoc of siteModel.modules) {
    outputs.set(
      path.join(repoRoot, moduleDoc.outputPath),
      renderPluginSdkModuleDoc(moduleDoc, siteModel.modules),
    );
  }

  for (const category of siteModel.categories) {
    outputs.set(path.join(repoRoot, category.outputPath), renderPluginSdkCategoryDoc(category));
  }

  outputs.set(
    path.join(docsRoot, "all-modules.md"),
    renderPluginSdkAllModulesDoc(siteModel.modules),
  );
  outputs.set(
    path.join(generatedRoot, "plugin-sdk-doc-model.json"),
    `${JSON.stringify(siteModel, null, 2)}\n`,
  );

  const manifestLines = [
    ...siteModel.categories.map((category) =>
      JSON.stringify({
        category: category.category,
        kind: "category",
        outputPath: relativePath(category.outputPath),
        route: category.route,
      }),
    ),
    ...siteModel.modules.map((moduleDoc) =>
      JSON.stringify({
        entrypoint: moduleDoc.entrypoint,
        kind: "module",
        outputPath: relativePath(moduleDoc.outputPath),
        route: moduleDoc.route,
        sourcePath: moduleDoc.source.path,
      }),
    ),
  ];

  outputs.set(
    path.join(generatedRoot, "plugin-sdk-docs.manifest.jsonl"),
    `${manifestLines.join("\n")}\n`,
  );

  return outputs;
}

async function writeOutputs(outputs: Map<string, string>): Promise<void> {
  const markdownPaths: string[] = [];

  for (const [filePath, content] of outputs) {
    await writeFileEnsuringDir(filePath, content);
    if (filePath.endsWith(".md") || filePath.endsWith(".mdx")) {
      markdownPaths.push(filePath);
    }
  }

  runOxfmt(markdownPaths);
}

function validateMetadata(): void {
  const canonicalEntrypoints = new Set<string>(pluginSdkEntrypoints);
  const metadataEntrypoints = new Set<string>(pluginSdkDocEntrypoints);

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

  const modules = pluginSdkDocEntrypoints.map((entrypoint) => buildModuleDoc(entrypoint));
  const categories = buildCategoryIndexes(modules);
  const siteModel: PluginSdkDocSiteModel = {
    categories,
    modules,
  };

  const formattedOutputs = await formatGeneratedDocs(buildOutputs(siteModel));

  if (checkOnly) {
    const driftedFiles: string[] = [];
    for (const [filePath, nextContent] of formattedOutputs) {
      const currentContent = await loadCurrentFile(filePath);
      if (currentContent !== nextContent) {
        driftedFiles.push(relativePath(filePath));
      }
    }

    if (driftedFiles.length > 0) {
      console.error("Plugin SDK docs out of sync. Run `pnpm plugin-sdk:docs:gen`.");
      for (const filePath of driftedFiles) {
        console.error(`- ${filePath}`);
      }
      process.exit(1);
    }

    console.log(`Plugin SDK docs synced (${formattedOutputs.size} generated files checked).`);
    return;
  }

  await writeOutputs(formattedOutputs);
  console.log(`Generated Plugin SDK docs (${formattedOutputs.size} files).`);
}

await main();
