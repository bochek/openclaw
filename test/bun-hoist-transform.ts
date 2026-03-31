import MagicString from "magic-string";
import ts from "typescript";

type ImportBindingInfo = {
  localName: string;
};

type ImportAnalysis = {
  hasValueBindings: boolean;
  importClause: ts.ImportClause | undefined;
  isPreserved: boolean;
  statement: ts.ImportDeclaration;
  typeOnlyImportText: string;
  usedByHoist: boolean;
  valueBindings: ImportBindingInfo[];
};

const HOIST_METHODS = new Set(["doMock", "doUnmock", "hoisted", "mock", "unmock"]);
const SAFE_STATIC_IMPORTS = new Set(["bun:test", "vitest"]);

function isViMethodCall(node: ts.Node, methodNames: Set<string>): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "vi" &&
    methodNames.has(node.expression.name.text)
  );
}

function statementContainsViHoisted(statement: ts.Statement): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (isViMethodCall(node, new Set(["hoisted"]))) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(statement);
  return found;
}

function isTopLevelHoistStatement(statement: ts.Statement): boolean {
  if (ts.isExpressionStatement(statement)) {
    return isViMethodCall(statement.expression, HOIST_METHODS);
  }
  if (ts.isVariableStatement(statement)) {
    return statementContainsViHoisted(statement);
  }
  return false;
}

function isRuntimeIdentifierReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (!parent) {
    return true;
  }

  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isTypeReferenceNode(parent) && parent.typeName === node)
  ) {
    return false;
  }

  if (
    (ts.isImportClause(parent) && parent.name === node) ||
    (ts.isImportSpecifier(parent) && (parent.name === node || parent.propertyName === node)) ||
    (ts.isNamespaceImport(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isFunctionDeclaration(parent) && parent.name === node) ||
    (ts.isClassDeclaration(parent) && parent.name === node) ||
    (ts.isInterfaceDeclaration(parent) && parent.name === node) ||
    (ts.isTypeAliasDeclaration(parent) && parent.name === node) ||
    (ts.isEnumDeclaration(parent) && parent.name === node)
  ) {
    return false;
  }

  return true;
}

function collectReferencedIdentifierTexts(node: ts.Node, into: Set<string>): void {
  if (ts.isIdentifier(node)) {
    if (isRuntimeIdentifierReference(node)) {
      into.add(node.text);
    }
    return;
  }
  ts.forEachChild(node, (child) => collectReferencedIdentifierTexts(child, into));
}

function toScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs") || filePath.endsWith(".cjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function escapeModuleSpecifier(text: string): string {
  return JSON.stringify(text);
}

function isRelativeLikeSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith("./") ||
    specifier.startsWith("../") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  );
}

function renderTypeOnlyImport(statement: ts.ImportDeclaration): string {
  const importClause = statement.importClause;
  if (!importClause) {
    return "";
  }
  if (importClause.isTypeOnly) {
    return statement.getText();
  }
  const moduleSpecifier = escapeModuleSpecifier(
    (statement.moduleSpecifier as ts.StringLiteral).text,
  );
  const parts: string[] = [];
  if (importClause.name) {
    parts.push(importClause.name.text);
  }
  const namedBindings = importClause.namedBindings;
  if (namedBindings && ts.isNamedImports(namedBindings)) {
    const typeElements = namedBindings.elements.filter((element) => element.isTypeOnly);
    if (typeElements.length > 0) {
      const rendered = typeElements.map((element) => {
        const imported = element.propertyName?.text ?? element.name.text;
        const local = element.name.text;
        return imported === local ? imported : `${imported} as ${local}`;
      });
      parts.push(`{ ${rendered.join(", ")} }`);
    }
  }
  if (parts.length === 0) {
    return "";
  }
  return `import type ${parts.join(", ")} from ${moduleSpecifier};`;
}

function analyzeImport(
  statement: ts.ImportDeclaration,
  hoistIdentifiers: Set<string>,
): ImportAnalysis {
  const importClause = statement.importClause;
  const moduleSpecifierText = (statement.moduleSpecifier as ts.StringLiteral).text;
  const valueBindings: ImportBindingInfo[] = [];
  let hasValueBindings = false;

  if (importClause && !importClause.isTypeOnly) {
    if (importClause.name) {
      valueBindings.push({ localName: importClause.name.text });
      hasValueBindings = true;
    }
    const namedBindings = importClause.namedBindings;
    if (namedBindings) {
      if (ts.isNamespaceImport(namedBindings)) {
        valueBindings.push({ localName: namedBindings.name.text });
        hasValueBindings = true;
      } else if (ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (element.isTypeOnly) {
            continue;
          }
          valueBindings.push({ localName: element.name.text });
          hasValueBindings = true;
        }
      }
    }
  }

  const usedByHoist = valueBindings.some((binding) => hoistIdentifiers.has(binding.localName));
  return {
    hasValueBindings,
    importClause,
    isPreserved:
      !hasValueBindings || SAFE_STATIC_IMPORTS.has(moduleSpecifierText) || Boolean(usedByHoist),
    statement,
    typeOnlyImportText: renderTypeOnlyImport(statement),
    usedByHoist,
    valueBindings,
  };
}

function collectTopLevelDeclaredNames(statement: ts.Statement): Set<string> {
  const declaredNames = new Set<string>();
  const collectBindingNames = (name: ts.BindingName): void => {
    if (ts.isIdentifier(name)) {
      declaredNames.add(name.text);
      return;
    }
    for (const element of name.elements) {
      collectBindingNames(element.name);
    }
  };
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    declaredNames.add(statement.name.text);
    return declaredNames;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name);
    }
  }
  return declaredNames;
}

type HoistDependencyPlan = {
  requiredIdentifiers: Set<string>;
  statements: ts.Statement[];
};

function planHoistDependencies(
  statements: readonly ts.Statement[],
  initialIdentifiers: Set<string>,
): HoistDependencyPlan {
  const requiredIdentifiers = new Set(initialIdentifiers);
  const selectedStatements: ts.Statement[] = [];
  let changed = true;

  while (changed) {
    changed = false;
    for (const statement of statements) {
      if (selectedStatements.includes(statement)) {
        continue;
      }
      if (!(ts.isVariableStatement(statement) || ts.isFunctionDeclaration(statement))) {
        continue;
      }
      const declaredNames = collectTopLevelDeclaredNames(statement);
      if (![...declaredNames].some((name) => requiredIdentifiers.has(name))) {
        continue;
      }
      selectedStatements.push(statement);
      const referencedNames = new Set<string>();
      collectReferencedIdentifierTexts(statement, referencedNames);
      for (const referencedName of referencedNames) {
        if (!requiredIdentifiers.has(referencedName)) {
          requiredIdentifiers.add(referencedName);
          changed = true;
        }
      }
      changed = true;
    }
  }

  return {
    requiredIdentifiers,
    statements: selectedStatements,
  };
}

function renderDynamicImport(
  analysis: ImportAnalysis,
  index: number,
  mockedSpecifiers: Set<string>,
  sourceFile: ts.SourceFile,
): string {
  const statement = analysis.statement;
  const moduleSpecifierText = (statement.moduleSpecifier as ts.StringLiteral).text;
  const importClause = statement.importClause;
  const moduleSpecifier = escapeModuleSpecifier(moduleSpecifierText);
  if (!importClause || !analysis.hasValueBindings) {
    return `await import(${moduleSpecifier});`;
  }

  const lines: string[] = [];
  const moduleVar = `__bunHoistedImport${index}`;
  const importExpression =
    mockedSpecifiers.has(moduleSpecifierText) || isRelativeLikeSpecifier(moduleSpecifierText)
      ? `globalThis.__openclawImportWithMocks(${moduleSpecifier}, import.meta.url, __openclawMockScope)`
      : `import(${moduleSpecifier})`;
  lines.push("await globalThis.__openclawFlushPendingMocks?.();");
  lines.push(
    `const ${moduleVar} = await globalThis.__openclawWithMockScope(__openclawMockScope, async () => ${importExpression});`,
  );

  if (importClause.name) {
    lines.push(`const ${importClause.name.text} = ${moduleVar}.default;`);
  }

  const namedBindings = importClause.namedBindings;
  if (namedBindings) {
    if (ts.isNamespaceImport(namedBindings)) {
      lines.push(`const ${namedBindings.name.text} = ${moduleVar};`);
    } else if (ts.isNamedImports(namedBindings)) {
      const valueElements = namedBindings.elements.filter((element) => !element.isTypeOnly);
      if (valueElements.length > 0) {
        const rendered = valueElements.map((element) => {
          const imported = element.propertyName?.text ?? element.name.text;
          const local = element.name.text;
          return imported === local ? imported : `${imported}: ${local}`;
        });
        lines.push(`const { ${rendered.join(", ")} } = ${moduleVar};`);
      }
    }
  }

  const trailingComment = ts.getTrailingCommentRanges(sourceFile.text, statement.end) ?? [];
  if (trailingComment.length > 0) {
    lines[lines.length - 1] += sourceFile.text
      .slice(trailingComment[0].pos, trailingComment[trailingComment.length - 1].end)
      .trimEnd();
  }

  return lines.join("\n");
}

function sliceWithTrivia(sourceFile: ts.SourceFile, statement: ts.Statement): string {
  return sourceFile.text.slice(statement.getFullStart(), statement.getEnd());
}

function rewriteBunManagedViCalls(sourceText: string): string {
  return sourceText
    .replaceAll(/\bvi\.(?:doMock|mock)\s*\(/g, "globalThis.__openclawViMock(")
    .replaceAll(/\bvi\.(?:doUnmock|unmock)\s*\(/g, "globalThis.__openclawViUnmock(");
}

function collectTopLevelMockSpecifiers(statements: readonly ts.Statement[]): Set<string> {
  const specifiers = new Set<string>();
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement)) {
      continue;
    }
    const expression = statement.expression;
    if (!isViMethodCall(expression, new Set(["doMock", "mock"]))) {
      continue;
    }
    const firstArg = expression.arguments[0];
    if (firstArg && ts.isStringLiteralLike(firstArg)) {
      specifiers.add(firstArg.text);
    }
  }
  return specifiers;
}

function hasRewritableDynamicImports(sourceFile: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function shouldTransformBunHoistSource(sourceText: string): boolean {
  return (
    sourceText.includes("vi.mock(") ||
    sourceText.includes("vi.doMock(") ||
    sourceText.includes("vi.unmock(") ||
    sourceText.includes("vi.doUnmock(") ||
    sourceText.includes("vi.hoisted(")
  );
}

function hasAnyViMockCalls(sourceText: string): boolean {
  return (
    sourceText.includes("vi.mock(") ||
    sourceText.includes("vi.doMock(") ||
    sourceText.includes("vi.unmock(") ||
    sourceText.includes("vi.doUnmock(")
  );
}

export function transformBunHoistSource(params: {
  filePath: string;
  sourceText: string;
}): string | null {
  const normalizedPath = params.filePath.replaceAll("\\", "/");
  if (normalizedPath.endsWith("/test/setup.ts") || normalizedPath === "test/setup.ts") {
    return null;
  }
  if (!shouldTransformBunHoistSource(params.sourceText)) {
    return null;
  }

  const sourceFile = ts.createSourceFile(
    params.filePath,
    params.sourceText,
    ts.ScriptTarget.Latest,
    true,
    toScriptKind(params.filePath),
  );
  const hoistStatements = sourceFile.statements.filter(isTopLevelHoistStatement);
  const mockedSpecifiers = collectTopLevelMockSpecifiers(hoistStatements);
  const anyViMockCalls = hasAnyViMockCalls(params.sourceText);

  const hoistIdentifiers = new Set<string>();
  for (const statement of hoistStatements) {
    collectReferencedIdentifierTexts(statement, hoistIdentifiers);
  }

  const hoistDependencyPlan = planHoistDependencies(sourceFile.statements, hoistIdentifiers);
  for (const requiredIdentifier of hoistDependencyPlan.requiredIdentifiers) {
    hoistIdentifiers.add(requiredIdentifier);
  }

  const imports = sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => analyzeImport(statement, hoistIdentifiers));
  const lateImportBindings = new Set(
    imports
      .filter((analysis) => !analysis.isPreserved)
      .flatMap((analysis) => analysis.valueBindings.map((binding) => binding.localName)),
  );
  const hoistDependencyStatements = hoistDependencyPlan.statements.filter(
    (statement) => !ts.isImportDeclaration(statement) && !hoistStatements.includes(statement),
  );
  const lateImports = imports.filter(
    (analysis) => !analysis.isPreserved && analysis.hasValueBindings,
  );
  const rewritableDynamicImports = hasRewritableDynamicImports(sourceFile);
  const hasPreservedRelativeSideEffectImport = imports.some(
    (analysis) =>
      analysis.isPreserved &&
      !analysis.importClause &&
      isRelativeLikeSpecifier((analysis.statement.moduleSpecifier as ts.StringLiteral).text),
  );
  const needsSideEffectImportBarrier =
    hoistStatements.length === 0 && hasPreservedRelativeSideEffectImport && lateImports.length > 0;
  const needsDynamicImportMockBarrier =
    rewritableDynamicImports && anyViMockCalls && hoistStatements.length === 0;
  if (
    hoistStatements.length === 0 &&
    !needsSideEffectImportBarrier &&
    !needsDynamicImportMockBarrier
  ) {
    return null;
  }
  if (lateImports.length === 0 && !rewritableDynamicImports) {
    return null;
  }

  const magic = new MagicString(params.sourceText);
  const rewriteDynamicImports = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const specifier = escapeModuleSpecifier(node.arguments[0].text);
      const importExpression =
        mockedSpecifiers.has(node.arguments[0].text) || isRelativeLikeSpecifier(node.arguments[0].text)
          ? `globalThis.__openclawImportWithMocks(${specifier}, import.meta.url, __openclawMockScope)`
          : `import(${specifier})`;
      magic.overwrite(
        node.getStart(sourceFile),
        node.getEnd(),
        `(await (async () => { await globalThis.__openclawFlushPendingMocks?.(); return globalThis.__openclawWithMockScope(__openclawMockScope, async () => ${importExpression}); })())`,
      );
      return;
    }
    ts.forEachChild(node, rewriteDynamicImports);
  };
  rewriteDynamicImports(sourceFile);

  let insertionPoint = sourceFile.statements[0]?.getFullStart() ?? 0;
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      break;
    }
    const analysis = imports.find((entry) => entry.statement === statement);
    if (!analysis?.isPreserved) {
      break;
    }
    insertionPoint = statement.end;
  }

  for (const analysis of imports) {
    if (analysis.isPreserved) {
      continue;
    }
    const replacement = analysis.typeOnlyImportText;
    magic.overwrite(
      analysis.statement.getFullStart(),
      analysis.statement.getEnd(),
      replacement ? `${replacement}\n` : "",
    );
  }

  const movedHoistStatements = hoistStatements
    .map((statement) => rewriteBunManagedViCalls(sliceWithTrivia(sourceFile, statement).trim()))
    .filter(Boolean);
  const movedDependencyStatements = hoistDependencyStatements
    .map((statement) => sliceWithTrivia(sourceFile, statement).trim())
    .filter(Boolean);
  for (const statement of hoistStatements) {
    magic.remove(statement.getFullStart(), statement.getEnd());
  }
  for (const statement of hoistDependencyStatements) {
    magic.remove(statement.getFullStart(), statement.getEnd());
  }

  const dynamicImportLines = lateImports.map((analysis, index) =>
    renderDynamicImport(analysis, index, mockedSpecifiers, sourceFile),
  );
  const shouldResetRegisteredMocks =
    hoistStatements.length > 0 || needsDynamicImportMockBarrier;
  const insertedSections = [
    shouldResetRegisteredMocks ? "globalThis.__openclawResetRegisteredMocks?.();" : "",
    "const __openclawMockScope = globalThis.__openclawBeginMockScope?.(import.meta.url) ?? import.meta.url;",
    movedHoistStatements.join("\n\n"),
    movedDependencyStatements.join("\n\n"),
    "await globalThis.__openclawFlushPendingMocks?.();",
    dynamicImportLines.join("\n"),
  ].filter(Boolean);
  if (insertedSections.length === 0) {
    return null;
  }

  magic.appendLeft(insertionPoint, `\n${insertedSections.join("\n\n")}\n`);
  const transformed = magic.toString();
  return transformed === params.sourceText ? null : transformed;
}
