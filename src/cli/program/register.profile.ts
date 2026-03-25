import type { Command } from "commander";
import {
  profileCloneCommand,
  profileCreateCommand,
  profileDeleteCommand,
  profileDoctorCommand,
  profileGetCommand,
  profileImportCommand,
  profileListCommand,
  profilePathsCommand,
} from "../../commands/profile.js";
import { defaultRuntime } from "../../runtime.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerProfileCommand(program: Command) {
  const profile = program
    .command("profile")
    .description("Manage first-class OpenClaw profiles")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/gateway/multiple-gateways", "docs.openclaw.ai/gateway/multiple-gateways")}\n`,
    );

  profile
    .command("list")
    .description("List managed and legacy OpenClaw profiles")
    .option("--json", "Output JSON", false)
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileListCommand(defaultRuntime, { json: Boolean(opts.json) });
      });
    });

  profile
    .command("get <id>")
    .description("Show one profile and its resolved runtime paths")
    .option("--json", "Output JSON", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileGetCommand(defaultRuntime, id as string, { json: Boolean(opts.json) });
      });
    });

  profile
    .command("paths <id>")
    .description("Print canonical paths for one profile")
    .option("--json", "Output JSON", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profilePathsCommand(defaultRuntime, id as string, { json: Boolean(opts.json) });
      });
    });

  profile
    .command("create <id>")
    .description("Create an empty managed profile")
    .option("--json", "Output JSON", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileCreateCommand(defaultRuntime, id as string, {
          json: Boolean(opts.json),
        });
      });
    });

  profile
    .command("clone <source> <id>")
    .description("Clone an existing profile into a fresh isolated managed profile")
    .option("--json", "Output JSON", false)
    .action(async (source, id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileCloneCommand(defaultRuntime, source as string, id as string, {
          json: Boolean(opts.json),
        });
      });
    });

  profile
    .command("import <id>")
    .description("Adopt an existing legacy profile into managed profile metadata")
    .option("--json", "Output JSON", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileImportCommand(defaultRuntime, id as string, {
          json: Boolean(opts.json),
        });
      });
    });

  profile
    .command("doctor <id>")
    .description("Validate profile invariants and warn on drift or unsafe escapes")
    .option("--json", "Output JSON", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileDoctorCommand(defaultRuntime, id as string, { json: Boolean(opts.json) });
      });
    });

  profile
    .command("delete <id>")
    .description("Delete a managed profile root")
    .option("--yes", "Confirm deletion", false)
    .option("--force", "Allow deleting even if the profile appears live", false)
    .option("--json", "Output JSON", false)
    .action(async (id, opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        await profileDeleteCommand(defaultRuntime, id as string, {
          yes: Boolean(opts.yes),
          force: Boolean(opts.force),
          json: Boolean(opts.json),
        });
      });
    });
}
