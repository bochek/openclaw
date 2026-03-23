/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTROL_UI_BOOTSTRAP_CONFIG_PATH } from "../../../../src/gateway/control-ui-contract.js";
import { i18n } from "../../i18n/index.ts";
import { loadControlUiBootstrapConfig } from "./control-ui-bootstrap.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("loadControlUiBootstrapConfig", () => {
  it("loads assistant identity from the bootstrap endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        basePath: "/openclaw",
        assistantName: "Ops",
        assistantAvatar: "O",
        assistantAgentId: "main",
        serverVersion: "2026.3.7",
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const state = {
      basePath: "/openclaw",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
    };

    await loadControlUiBootstrapConfig(state);

    expect(fetchMock).toHaveBeenCalledWith(
      `/openclaw${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(state.assistantName).toBe("Ops");
    expect(state.assistantAvatar).toBe("O");
    expect(state.assistantAgentId).toBe("main");
    expect(state.serverVersion).toBe("2026.3.7");

    vi.unstubAllGlobals();
  });

  it("ignores failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const state = {
      basePath: "",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
    };

    await loadControlUiBootstrapConfig(state);

    expect(fetchMock).toHaveBeenCalledWith(
      CONTROL_UI_BOOTSTRAP_CONFIG_PATH,
      expect.objectContaining({ method: "GET" }),
    );
    expect(state.assistantName).toBe("Assistant");

    vi.unstubAllGlobals();
  });

  it("normalizes trailing slash basePath for bootstrap fetch path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const state = {
      basePath: "/openclaw/",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
    };

    await loadControlUiBootstrapConfig(state);

    expect(fetchMock).toHaveBeenCalledWith(
      `/openclaw${CONTROL_UI_BOOTSTRAP_CONFIG_PATH}`,
      expect.objectContaining({ method: "GET" }),
    );

    vi.unstubAllGlobals();
  });

  it("refreshes i18n subscribers when remote locales are registered without a preferred locale", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locales: [{ locale: "fr", url: "/__openclaw/locales/fr/control-ui.json" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const refreshSpy = vi.spyOn(i18n, "refresh");
    const setLocaleSpy = vi.spyOn(i18n, "setLocale");

    const state = {
      basePath: "",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
      settings: {},
    };

    await loadControlUiBootstrapConfig(state);

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(setLocaleSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("applies a preferred locale after registering remote locale sources", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locales: [{ locale: "fr", url: "/__openclaw/locales/fr/control-ui.json" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const setLocaleSpy = vi.spyOn(i18n, "setLocale").mockResolvedValue();
    const refreshSpy = vi.spyOn(i18n, "refresh");

    const state = {
      basePath: "",
      assistantName: "Assistant",
      assistantAvatar: null,
      assistantAgentId: null,
      serverVersion: null,
      settings: { locale: "fr" },
    };

    await loadControlUiBootstrapConfig(state);

    expect(setLocaleSpy).toHaveBeenCalledWith("fr");
    expect(refreshSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
