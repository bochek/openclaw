import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function setTestLocation(params: { protocol: string; host: string; pathname: string }) {
  if (typeof window !== "undefined" && window.history?.replaceState) {
    window.history.replaceState({}, "", params.pathname);
    return;
  }
  vi.stubGlobal("location", {
    protocol: params.protocol,
    host: params.host,
    pathname: params.pathname,
  } as Location);
}

function setControlUiBasePath(value: string | undefined) {
  if (typeof window === "undefined") {
    vi.stubGlobal(
      "window",
      value == null
        ? ({} as Window & typeof globalThis)
        : ({ __OPENCLAW_CONTROL_UI_BASE_PATH__: value } as Window & typeof globalThis),
    );
    return;
  }
  if (value == null) {
    delete window.__OPENCLAW_CONTROL_UI_BASE_PATH__;
    return;
  }
  Object.defineProperty(window, "__OPENCLAW_CONTROL_UI_BASE_PATH__", {
    value,
    writable: true,
    configurable: true,
  });
}

function expectedGatewayUrl(basePath: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${basePath}`;
}

function normalizeScopedUrl(url: string): string {
  const parsed = new URL(url);
  const pathname =
    parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "") || parsed.pathname;
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function expectedSettingsStorageKey(basePath: string): string {
  const normalizedBasePath = basePath === "/" ? "" : basePath;
  return `openclaw.control.settings.v1:${normalizeScopedUrl(expectedGatewayUrl(normalizedBasePath))}`;
}

describe("loadSettings default gateway URL derivation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createStorageMock());
    vi.stubGlobal("sessionStorage", createStorageMock());
    vi.stubGlobal("navigator", { language: "en-US" } as Navigator);
    localStorage.clear();
    sessionStorage.clear();
    setControlUiBasePath(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setControlUiBasePath(undefined);
    vi.unstubAllGlobals();
  });

  it("uses configured base path and normalizes trailing slash", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/ignored/path",
    });
    setControlUiBasePath(" /openclaw/ ");

    const { loadSettings } = await import("./storage.ts");
    expect(loadSettings().gatewayUrl).toBe(expectedGatewayUrl("/openclaw"));
  });

  it("infers base path from nested pathname when configured base path is not set", async () => {
    setTestLocation({
      protocol: "http:",
      host: "gateway.example:18789",
      pathname: "/apps/openclaw/chat",
    });

    const { loadSettings } = await import("./storage.ts");
    expect(loadSettings().gatewayUrl).toBe(expectedGatewayUrl("/apps/openclaw"));
  });

  it("ignores and scrubs legacy persisted tokens", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });
    sessionStorage.setItem("openclaw.control.token.v1", "legacy-session-token");
    localStorage.setItem(
      "openclaw.control.settings.v1",
      JSON.stringify({
        gatewayUrl: "wss://gateway.example:8443/openclaw",
        token: "persisted-token",
        sessionKey: "agent",
      }),
    );

    const { loadSettings } = await import("./storage.ts");
    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "",
      sessionKey: "agent",
    });
    expect(JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}")).toEqual({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
      sessionsByGateway: {
        "wss://gateway.example:8443/openclaw": {
          sessionKey: "agent",
          lastActiveSessionKey: "agent",
        },
      },
    });
    expect(sessionStorage.length).toBe(0);
  });

  it("loads the current-tab token from sessionStorage", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    const { loadSettings, saveSettings } = await import("./storage.ts");
    saveSettings({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "session-token",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });

    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "session-token",
    });
  });

  it("does not reuse a session token for a different gatewayUrl", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    sessionStorage.setItem(
      "openclaw.control.token.v1:wss://gateway.example:8443/openclaw",
      "gateway-a-token",
    );

    const { loadSettings } = await import("./storage.ts");
    localStorage.setItem(
      "openclaw.control.settings.v1",
      JSON.stringify({
        gatewayUrl: "wss://other-gateway.example:8443/openclaw",
        sessionKey: "main",
        lastActiveSessionKey: "main",
        theme: "claw",
        themeMode: "system",
        chatFocusMode: false,
        chatShowThinking: true,
        chatShowToolCalls: true,
        splitRatio: 0.6,
        navCollapsed: false,
        navWidth: 220,
        navGroupsCollapsed: {},
      }),
    );

    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://other-gateway.example:8443/openclaw",
      token: "",
    });
    expect(JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}")).toMatchObject(
      {
        gatewayUrl: "wss://other-gateway.example:8443/openclaw",
        sessionsByGateway: {
          "wss://other-gateway.example:8443/openclaw": {
            sessionKey: "main",
            lastActiveSessionKey: "main",
          },
        },
      },
    );
  });

  it("does not persist gateway tokens when saving settings", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    const { loadSettings, saveSettings } = await import("./storage.ts");
    saveSettings({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "memory-only-token",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });
    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "memory-only-token",
    });

    expect(JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}")).toEqual({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
      sessionsByGateway: {
        "wss://gateway.example:8443/openclaw": {
          sessionKey: "main",
          lastActiveSessionKey: "main",
        },
      },
    });
    expect(sessionStorage.length).toBe(1);
  });

  it("migrates tokenless legacy settings on first load", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/gateway-a/chat",
    });

    localStorage.setItem(
      "openclaw.control.settings.v1",
      JSON.stringify({
        gatewayUrl: "wss://custom-gateway.example:8443/openclaw",
        sessionKey: "agent",
        lastActiveSessionKey: "agent",
        theme: "claw",
        themeMode: "system",
        chatFocusMode: false,
        chatShowThinking: true,
        chatShowToolCalls: true,
        splitRatio: 0.6,
        navCollapsed: false,
        navWidth: 220,
        navGroupsCollapsed: {},
      }),
    );

    const { loadSettings } = await import("./storage.ts");

    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://custom-gateway.example:8443/openclaw",
      sessionKey: "agent",
      lastActiveSessionKey: "agent",
    });
    expect(
      JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/gateway-a")) ?? "{}"),
    ).toMatchObject({
      gatewayUrl: "wss://custom-gateway.example:8443/openclaw",
      sessionsByGateway: {
        "wss://custom-gateway.example:8443/openclaw": {
          sessionKey: "agent",
          lastActiveSessionKey: "agent",
        },
      },
    });
  });

  it("clears the current-tab token when saving an empty token", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    const { loadSettings, saveSettings } = await import("./storage.ts");
    saveSettings({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "stale-token",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });
    saveSettings({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });

    expect(loadSettings().token).toBe("");
    expect(sessionStorage.length).toBe(0);
  });

  it("persists themeMode and navWidth alongside the selected theme", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    const { saveSettings } = await import("./storage.ts");
    saveSettings({
      gatewayUrl: "wss://gateway.example:8443/openclaw",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "dash",
      themeMode: "light",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 320,
      navGroupsCollapsed: {},
    });

    expect(JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}")).toMatchObject(
      {
        theme: "dash",
        themeMode: "light",
        navWidth: 320,
      },
    );
  });

  it("scopes persisted session selection per gateway", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    const { loadSettings, saveSettings } = await import("./storage.ts");

    saveSettings({
      gatewayUrl: "wss://gateway-a.example:8443/openclaw",
      token: "",
      sessionKey: "agent:test_old:main",
      lastActiveSessionKey: "agent:test_old:main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });

    saveSettings({
      gatewayUrl: "wss://gateway-b.example:8443/openclaw",
      token: "",
      sessionKey: "agent:test_new:main",
      lastActiveSessionKey: "agent:test_new:main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });

    localStorage.setItem(
      expectedSettingsStorageKey("/"),
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}"),
        gatewayUrl: "wss://gateway-a.example:8443/openclaw",
      }),
    );

    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://gateway-a.example:8443/openclaw",
      sessionKey: "agent:test_old:main",
      lastActiveSessionKey: "agent:test_old:main",
    });

    localStorage.setItem(
      expectedSettingsStorageKey("/"),
      JSON.stringify({
        ...JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}"),
        gatewayUrl: "wss://gateway-b.example:8443/openclaw",
      }),
    );

    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://gateway-b.example:8443/openclaw",
      sessionKey: "agent:test_new:main",
      lastActiveSessionKey: "agent:test_new:main",
    });
  });

  it("caps persisted session scopes to the most recent gateways", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/",
    });

    const { saveSettings } = await import("./storage.ts");

    for (let i = 0; i < 12; i += 1) {
      saveSettings({
        gatewayUrl: `wss://gateway-${i}.example:8443/openclaw`,
        token: "",
        sessionKey: `agent:test_${i}:main`,
        lastActiveSessionKey: `agent:test_${i}:main`,
        theme: "claw",
        themeMode: "system",
        chatFocusMode: false,
        chatShowThinking: true,
        chatShowToolCalls: true,
        splitRatio: 0.6,
        navCollapsed: false,
        navWidth: 220,
        navGroupsCollapsed: {},
      });
    }

    const persisted = JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/")) ?? "{}");
    const scopes = Object.keys(persisted.sessionsByGateway ?? {});

    expect(scopes).toHaveLength(10);
    expect(scopes).not.toContain("wss://gateway-0.example:8443/openclaw");
    expect(scopes).not.toContain("wss://gateway-1.example:8443/openclaw");
    expect(scopes).toContain("wss://gateway-11.example:8443/openclaw");
  });

  it("scopes page settings separately even when gatewayUrl matches", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/gateway-a/chat",
    });

    const { loadSettings, saveSettings } = await import("./storage.ts");

    saveSettings({
      gatewayUrl: "wss://shared-gateway.example:8443/openclaw",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "dash",
      themeMode: "light",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.55,
      navCollapsed: false,
      navWidth: 240,
      navGroupsCollapsed: {},
    });

    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/gateway-b/chat",
    });

    saveSettings({
      gatewayUrl: "wss://shared-gateway.example:8443/openclaw",
      token: "",
      sessionKey: "main",
      lastActiveSessionKey: "main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: true,
      navWidth: 220,
      navGroupsCollapsed: {},
    });

    expect(
      JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/gateway-a")) ?? "{}"),
    ).toMatchObject({
      theme: "dash",
      themeMode: "light",
      splitRatio: 0.55,
    });
    expect(
      JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/gateway-b")) ?? "{}"),
    ).toMatchObject({
      theme: "claw",
      themeMode: "system",
      navCollapsed: true,
    });

    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/gateway-a/chat",
    });
    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://shared-gateway.example:8443/openclaw",
      theme: "dash",
      themeMode: "light",
      splitRatio: 0.55,
    });
  });

  it("keeps a custom gatewayUrl across reloads on the same page scope", async () => {
    setTestLocation({
      protocol: "https:",
      host: "gateway.example:8443",
      pathname: "/gateway-a/chat",
    });

    const { loadSettings, saveSettings } = await import("./storage.ts");
    saveSettings({
      gatewayUrl: "wss://custom-gateway.example:8443/openclaw",
      token: "",
      sessionKey: "agent:custom:main",
      lastActiveSessionKey: "agent:custom:main",
      theme: "claw",
      themeMode: "system",
      chatFocusMode: false,
      chatShowThinking: true,
      chatShowToolCalls: true,
      splitRatio: 0.6,
      navCollapsed: false,
      navWidth: 220,
      navGroupsCollapsed: {},
    });

    expect(loadSettings()).toMatchObject({
      gatewayUrl: "wss://custom-gateway.example:8443/openclaw",
      sessionKey: "agent:custom:main",
      lastActiveSessionKey: "agent:custom:main",
    });
    expect(
      JSON.parse(localStorage.getItem(expectedSettingsStorageKey("/gateway-a")) ?? "{}"),
    ).toMatchObject({
      gatewayUrl: "wss://custom-gateway.example:8443/openclaw",
      sessionsByGateway: {
        "wss://custom-gateway.example:8443/openclaw": {
          sessionKey: "agent:custom:main",
          lastActiveSessionKey: "agent:custom:main",
        },
      },
    });
  });
});
