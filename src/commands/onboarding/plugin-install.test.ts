import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const existsSync = vi.fn();
  return {
    ...actual,
    existsSync,
    default: {
      ...actual,
      existsSync,
    },
  };
});

const installPluginFromNpmSpec = vi.fn();
vi.mock("../../plugins/install.js", () => ({
  installPluginFromNpmSpec: (...args: unknown[]) => installPluginFromNpmSpec(...args),
}));

const resolveBundledPluginSources = vi.fn();
vi.mock("../../plugins/bundled-sources.js", () => ({
  findBundledPluginSourceInMap: ({
    bundled,
    lookup,
  }: {
    bundled: ReadonlyMap<string, { pluginId: string; localPath: string; npmSpec?: string }>;
    lookup: { kind: "pluginId" | "npmSpec"; value: string };
  }) => {
    const targetValue = lookup.value.trim();
    if (!targetValue) {
      return undefined;
    }
    if (lookup.kind === "pluginId") {
      return bundled.get(targetValue);
    }
    for (const source of bundled.values()) {
      if (source.npmSpec === targetValue) {
        return source;
      }
    }
    return undefined;
  },
  resolveBundledPluginSources: (...args: unknown[]) => resolveBundledPluginSources(...args),
}));

vi.mock("../../plugins/loader.js", () => ({
  loadOpenClawPlugins: vi.fn(),
}));

const clearPluginDiscoveryCache = vi.fn();
vi.mock("../../plugins/discovery.js", () => ({
  clearPluginDiscoveryCache: () => clearPluginDiscoveryCache(),
}));

import fs from "node:fs";
import type { ChannelPluginCatalogEntry } from "../../channels/plugins/catalog.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadOpenClawPlugins } from "../../plugins/loader.js";
import type { WizardPrompter } from "../../wizard/prompts.js";
import { makePrompter, makeRuntime } from "./__tests__/test-utils.js";
import {
  ensureOnboardingPluginInstalled,
  reloadOnboardingPluginRegistry,
} from "./plugin-install.js";

const baseEntry: ChannelPluginCatalogEntry = {
  id: "zalo",
  meta: {
    id: "zalo",
    label: "Zalo",
    selectionLabel: "Zalo (Bot API)",
    docsPath: "/channels/zalo",
    docsLabel: "zalo",
    blurb: "Test",
  },
  install: {
    npmSpec: "@openclaw/zalo",
    localPath: "extensions/zalo",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveBundledPluginSources.mockReturnValue(new Map());
});

function mockRepoLocalPathExists() {
  vi.mocked(fs.existsSync).mockImplementation((value) => {
    const raw = String(value);
    return raw.endsWith(`${path.sep}.git`) || raw.endsWith(`${path.sep}extensions${path.sep}zalo`);
  });
}

async function runPromptShapeForChannel(channel: "dev" | "beta") {
  const runtime = makeRuntime();
  const text = vi.fn(async () => "");
  const prompter = makePrompter({
    text: text as unknown as WizardPrompter["text"],
  });
  const cfg: OpenClawConfig = { update: { channel } };
  mockRepoLocalPathExists();
  installPluginFromNpmSpec.mockResolvedValue({
    ok: false,
    error: "nope",
  });

  await ensureOnboardingPluginInstalled({
    cfg,
    entry: baseEntry,
    prompter,
    runtime,
  });

  const call = text.mock.calls[0];
  return call?.[0];
}

function expectPluginLoadedFromLocalPath(
  result: Awaited<ReturnType<typeof ensureOnboardingPluginInstalled>>,
) {
  const expectedPath = path.resolve(process.cwd(), "extensions/zalo");
  expect(result.installed).toBe(true);
  expect(result.cfg.plugins?.load?.paths).toContain(expectedPath);
}

describe("ensureOnboardingPluginInstalled", () => {
  it("installs from npm and enables the plugin", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      text: vi.fn(async () => "@openclaw/zalo") as WizardPrompter["text"],
    });
    const cfg: OpenClawConfig = { plugins: { allow: ["other"] } };
    vi.mocked(fs.existsSync).mockReturnValue(false);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "zalo",
      targetDir: "/tmp/zalo",
      extensions: [],
    });

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(result.cfg.plugins?.entries?.zalo?.enabled).toBe(true);
    expect(result.cfg.plugins?.allow).toContain("zalo");
    expect(result.cfg.plugins?.installs?.zalo?.source).toBe("npm");
    expect(result.cfg.plugins?.installs?.zalo?.spec).toBe("@openclaw/zalo");
    expect(result.cfg.plugins?.installs?.zalo?.installPath).toBe("/tmp/zalo");
    expect(installPluginFromNpmSpec).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "@openclaw/zalo" }),
    );
  });

  it("accepts scoped npm package names without treating them as missing paths", async () => {
    const runtime = makeRuntime();
    const prompter = makePrompter({
      text: vi.fn(async () => "@openclaw/zalo") as WizardPrompter["text"],
    });
    const cfg: OpenClawConfig = {};
    vi.mocked(fs.existsSync).mockReturnValue(false);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "zalo",
      targetDir: "/tmp/zalo",
      extensions: [],
    });

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(installPluginFromNpmSpec).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "@openclaw/zalo" }),
    );
  });

  it("uses local path when selected", async () => {
    const runtime = makeRuntime();
    const note = vi.fn(async () => {});
    const prompter = makePrompter({
      text: vi.fn(async () => "extensions/zalo") as WizardPrompter["text"],
      note,
    });
    const cfg: OpenClawConfig = {};
    mockRepoLocalPathExists();

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expectPluginLoadedFromLocalPath(result);
    expect(result.cfg.plugins?.entries?.zalo?.enabled).toBe(true);
    expect(note).toHaveBeenCalledWith(
      `Using existing local plugin at ${path.resolve(process.cwd(), "extensions/zalo")}.\nNo download needed.`,
      "Plugin install",
    );
  });

  it("uses a generic placeholder without prefilled local value on dev channel", async () => {
    expect(await runPromptShapeForChannel("dev")).toEqual(
      expect.objectContaining({
        message: "Plugin package or local path",
        placeholder: "@scope/plugin-name or extensions/plugin-name (leave blank to skip)",
      }),
    );
  });

  it("uses the same generic placeholder without prefilled npm value on beta channel", async () => {
    expect(await runPromptShapeForChannel("beta")).toEqual(
      expect.objectContaining({
        message: "Plugin package or local path",
        placeholder: "@scope/plugin-name or extensions/plugin-name (leave blank to skip)",
      }),
    );
  });

  it("defaults to bundled local path on beta channel when available", async () => {
    const runtime = makeRuntime();
    const text = vi.fn(async () => "");
    const prompter = makePrompter({
      text: text as unknown as WizardPrompter["text"],
    });
    const cfg: OpenClawConfig = { update: { channel: "beta" } };
    vi.mocked(fs.existsSync).mockImplementation((value) => {
      const raw = String(value);
      return raw === "/opt/openclaw/extensions/zalo" || raw.endsWith(`${path.sep}.git`);
    });
    resolveBundledPluginSources.mockReturnValue(
      new Map([
        [
          "zalo",
          {
            pluginId: "zalo",
            localPath: "/opt/openclaw/extensions/zalo",
            npmSpec: "@openclaw/zalo",
          },
        ],
      ]),
    );

    await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(text).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Plugin package or local path",
        placeholder: "@scope/plugin-name or extensions/plugin-name (leave blank to skip)",
      }),
    );
  });

  it("falls back to local path after npm install failure", async () => {
    const runtime = makeRuntime();
    const note = vi.fn(async () => {});
    const confirm = vi.fn(async () => true);
    const prompter = makePrompter({
      text: vi.fn(async () => "@openclaw/zalo") as WizardPrompter["text"],
      note,
      confirm,
    });
    const cfg: OpenClawConfig = {};
    mockRepoLocalPathExists();
    installPluginFromNpmSpec.mockResolvedValue({
      ok: false,
      error: "nope",
    });

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expectPluginLoadedFromLocalPath(result);
    expect(note).toHaveBeenCalledWith(`Failed to install @openclaw/zalo: nope`, "Plugin install");
    expect(note).toHaveBeenCalledWith(
      `Using existing local plugin at ${path.resolve(process.cwd(), "extensions/zalo")}.\nNo download needed.`,
      "Plugin install",
    );
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("re-prompts when a path-like input does not exist", async () => {
    const runtime = makeRuntime();
    const note = vi.fn(async () => {});
    const text = vi
      .fn()
      .mockResolvedValueOnce("./missing-plugin")
      .mockResolvedValueOnce("@openclaw/zalo");
    const prompter = makePrompter({
      text: text as unknown as WizardPrompter["text"],
      note,
    });
    const cfg: OpenClawConfig = {};
    vi.mocked(fs.existsSync).mockReturnValue(false);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "zalo",
      targetDir: "/tmp/zalo",
      extensions: [],
    });

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(note).toHaveBeenCalledWith("Path not found: ./missing-plugin", "Plugin install");
    expect(text).toHaveBeenCalledTimes(2);
    expect(installPluginFromNpmSpec).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "@openclaw/zalo" }),
    );
  });

  it("re-prompts when the entered npm package does not match the selected provider", async () => {
    const runtime = makeRuntime();
    const note = vi.fn(async () => {});
    const text = vi
      .fn()
      .mockResolvedValueOnce("@other/provider")
      .mockResolvedValueOnce("@openclaw/zalo");
    const prompter = makePrompter({
      text: text as unknown as WizardPrompter["text"],
      note,
    });
    const cfg: OpenClawConfig = {};
    vi.mocked(fs.existsSync).mockReturnValue(false);
    installPluginFromNpmSpec.mockResolvedValue({
      ok: true,
      pluginId: "zalo",
      targetDir: "/tmp/zalo",
      extensions: [],
    });

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(true);
    expect(note).toHaveBeenCalledWith(
      "This flow installs @openclaw/zalo. Enter that package or a local plugin path.",
      "Plugin install",
    );
    expect(text).toHaveBeenCalledTimes(2);
    expect(installPluginFromNpmSpec).toHaveBeenCalledWith(
      expect.objectContaining({ spec: "@openclaw/zalo" }),
    );
  });

  it("returns unchanged config when install input is left blank", async () => {
    const runtime = makeRuntime();
    const text = vi.fn(async () => "");
    const prompter = makePrompter({
      text: text as unknown as WizardPrompter["text"],
    });
    const cfg: OpenClawConfig = {};

    const result = await ensureOnboardingPluginInstalled({
      cfg,
      entry: baseEntry,
      prompter,
      runtime,
    });

    expect(result.installed).toBe(false);
    expect(result.cfg).toBe(cfg);
    expect(text).toHaveBeenCalledTimes(1);
    expect(installPluginFromNpmSpec).not.toHaveBeenCalled();
  });

  it("clears discovery cache before reloading the onboarding plugin registry", () => {
    const runtime = makeRuntime();
    const cfg: OpenClawConfig = {};

    reloadOnboardingPluginRegistry({
      cfg,
      runtime,
      workspaceDir: "/tmp/openclaw-workspace",
    });

    expect(clearPluginDiscoveryCache).toHaveBeenCalledTimes(1);
    expect(loadOpenClawPlugins).toHaveBeenCalledWith(
      expect.objectContaining({
        config: cfg,
        workspaceDir: "/tmp/openclaw-workspace",
        cache: false,
      }),
    );
    expect(clearPluginDiscoveryCache.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(loadOpenClawPlugins).mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});
