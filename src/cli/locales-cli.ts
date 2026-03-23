import type { Command } from "commander";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { resolveDefaultAgentWorkspaceDir } from "../agents/workspace.js";
import { loadConfig } from "../config/config.js";
import { getSelectedLocaleResource, loadLocaleRegistry } from "../locales/registry.js";
import { syncDocsLocales } from "../locales/sync-docs.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";

type LocalesSyncDocsOptions = {
  docsDir?: string;
  sourceConfig?: string;
  workspaceDir?: string;
  outputConfig?: string;
  locale?: string[];
  json?: boolean;
};

type LocalesListOptions = {
  json?: boolean;
};

type LocalesInspectOptions = {
  json?: boolean;
};

type LocalesDoctorOptions = {
  json?: boolean;
};

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function loadWorkspaceLocaleRegistry() {
  const config = loadConfig();
  const workspaceDir =
    resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config)) ??
    resolveDefaultAgentWorkspaceDir();
  return loadLocaleRegistry({ config, workspaceDir });
}

export function registerLocalesCli(program: Command) {
  const locales = program
    .command("locales")
    .description("Sync and inspect locale packages")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/tools/plugin", "docs.openclaw.ai/tools/plugin")}\n`,
    );

  locales
    .command("list")
    .description("List discovered locale artifacts")
    .option("--json", "Print JSON", false)
    .action(async (opts: LocalesListOptions) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const registry = loadWorkspaceLocaleRegistry();
        if (opts.json) {
          defaultRuntime.log(JSON.stringify(registry, null, 2));
          return;
        }
        if (registry.packages.length === 0) {
          defaultRuntime.log(theme.muted("No locale artifacts found."));
          return;
        }
        defaultRuntime.log(
          `${theme.heading("Locales")} ${theme.muted(`(${registry.packages.length} package(s))`)}`,
        );
        for (const entry of registry.packages) {
          const kinds = entry.resourceKinds.join(", ");
          const selectedKinds = ["docs", "controlUi", "runtime"]
            .filter((kind) => {
              const selected = getSelectedLocaleResource(
                registry,
                entry.locale,
                kind as "docs" | "controlUi" | "runtime",
              )?.selected;
              return (
                selected?.pluginId === entry.pluginId &&
                selected.rootDir === entry.rootDir &&
                selected.manifestPath === entry.manifestPath &&
                selected.origin === entry.origin
              );
            })
            .join(", ");
          defaultRuntime.log(
            `- ${theme.command(entry.locale)} from ${entry.pluginId} ${theme.muted(`[${kinds}]${selectedKinds ? ` selected: ${selectedKinds}` : ""}`)}`,
          );
        }
      });
    });

  locales
    .command("inspect")
    .description("Inspect one locale artifact or locale id")
    .argument("<id-or-locale>", "Locale id or package id")
    .option("--json", "Print JSON", false)
    .action(async (idOrLocale: string, opts: LocalesInspectOptions) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const registry = loadWorkspaceLocaleRegistry();
        const matches = registry.packages.filter(
          (entry) => entry.pluginId === idOrLocale || entry.locale === idOrLocale,
        );
        if (matches.length === 0) {
          defaultRuntime.error(`Locale artifact not found: ${idOrLocale}`);
          defaultRuntime.exit(1);
          return;
        }
        if (opts.json) {
          defaultRuntime.log(
            JSON.stringify(
              {
                packages: matches,
                selections: registry.selections.filter(
                  (selection) =>
                    selection.locale === idOrLocale ||
                    selection.selected.pluginId === idOrLocale ||
                    selection.shadowed.some((entry) => entry.pluginId === idOrLocale),
                ),
                diagnostics: registry.diagnostics.filter(
                  (diag) =>
                    diag.pluginId === idOrLocale ||
                    matches.some((entry) => entry.pluginId === diag.pluginId),
                ),
              },
              null,
              2,
            ),
          );
          return;
        }
        for (const entry of matches) {
          defaultRuntime.log(
            `${theme.heading(entry.pluginId)} ${theme.muted(`(${entry.locale})`)}`,
          );
          defaultRuntime.log(`Origin: ${entry.origin}`);
          defaultRuntime.log(`Package mode: ${entry.packageMode}`);
          defaultRuntime.log(`Kinds: ${entry.resourceKinds.join(", ")}`);
          if (entry.version) {
            defaultRuntime.log(`Version: ${entry.version}`);
          }
          const selections = registry.selections.filter(
            (selection) =>
              selection.locale === entry.locale && selection.selected.pluginId === entry.pluginId,
          );
          if (selections.length > 0) {
            defaultRuntime.log(
              `Selected kinds: ${selections.map((selection) => selection.kind).join(", ")}`,
            );
          }
          const shadowed = registry.selections.flatMap((selection) =>
            selection.shadowed.filter((candidate) => candidate.pluginId === entry.pluginId),
          );
          if (shadowed.length > 0) {
            defaultRuntime.log(
              `${theme.muted("Shadowed kinds:")} ${shadowed.map((candidate) => candidate.kind).join(", ")}`,
            );
          }
          defaultRuntime.log("");
        }
      });
    });

  locales
    .command("doctor")
    .description("Show locale registry diagnostics")
    .option("--json", "Print JSON", false)
    .action(async (opts: LocalesDoctorOptions) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const registry = loadWorkspaceLocaleRegistry();
        if (opts.json) {
          defaultRuntime.log(
            JSON.stringify(
              {
                diagnostics: registry.diagnostics,
                conflicts: registry.conflicts,
              },
              null,
              2,
            ),
          );
          return;
        }
        if (registry.diagnostics.length === 0 && registry.conflicts.length === 0) {
          defaultRuntime.log(theme.success("No locale diagnostics."));
          return;
        }
        defaultRuntime.log(theme.heading("Locale diagnostics"));
        for (const diagnostic of registry.diagnostics) {
          const prefix = diagnostic.level === "error" ? theme.error("error") : theme.warn("warn");
          defaultRuntime.log(`- ${prefix} ${diagnostic.message}`);
        }
      });
    });

  locales
    .command("sync-docs")
    .description("Materialize docs locale resources from installed locale plugins")
    .option("--docs-dir <path>", "Docs directory (default: ./docs)")
    .option("--source-config <path>", "Source docs config (default: docs.source.json or docs.json)")
    .option(
      "--workspace-dir <path>",
      "Generated docs workspace (default: docs/.generated/locale-workspace)",
    )
    .option(
      "--output-config <path>",
      "Generated docs config output path (default: <workspace>/docs.json)",
    )
    .option("--locale <id>", "Only sync one locale (repeatable)", collectRepeatedOption, [])
    .option("--json", "Print JSON output", false)
    .action(async (opts: LocalesSyncDocsOptions) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const result = await syncDocsLocales({
          docsDir: opts.docsDir,
          sourceConfigPath: opts.sourceConfig,
          workspaceDir: opts.workspaceDir,
          outputConfigPath: opts.outputConfig,
          locales: opts.locale,
        });

        if (opts.json) {
          defaultRuntime.log(JSON.stringify(result, null, 2));
          return;
        }

        defaultRuntime.log(
          `${theme.heading("Docs locale sync")} ${theme.muted(`(${result.syncedLocales.length} locale(s))`)}`,
        );
        defaultRuntime.log(`Source config: ${result.sourceConfigPath}`);
        defaultRuntime.log(`Workspace: ${result.workspaceDir}`);
        defaultRuntime.log(`Output config: ${result.outputConfigPath}`);
        if (result.syncedLocales.length === 0) {
          defaultRuntime.log(theme.muted("No locale artifacts with docs resources were found."));
          return;
        }
        for (const locale of result.syncedLocales) {
          defaultRuntime.log(
            `- ${theme.command(locale.locale)} (${locale.language}) from ${locale.pluginId} -> ${locale.targetDir} ${theme.muted(`[${locale.pageCount} page(s)]`)}`,
          );
        }
      });
    });
}
