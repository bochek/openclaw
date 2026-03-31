import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __testing as invokeBrowserTesting,
  runBrowserProxyCommand,
} from "./invoke-browser.js";

const controlServiceMocks = vi.hoisted(() => ({
  createBrowserControlContext: vi.fn(() => ({ control: true })),
  startBrowserControlServiceFromConfig: vi.fn(async () => true),
}));

const dispatcherMocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  createBrowserRouteDispatcher: vi.fn(() => ({
    dispatch: dispatcherMocks.dispatch,
  })),
}));

const configMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({
    browser: {},
    nodeHost: { browserProxy: { enabled: true, allowProfiles: [] as string[] } },
  })),
}));

const browserConfigMocks = vi.hoisted(() => ({
  resolveBrowserConfig: vi.fn(() => ({
    enabled: true,
    defaultProfile: "openclaw",
  })),
}));

const timeoutMocks = vi.hoisted(() => ({
  withTimeout: vi.fn(async (work: (signal: AbortSignal | undefined) => Promise<unknown>) =>
    await work(undefined),
  ),
}));

function normalizeBrowserRequestPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withLeadingSlash.length <= 1) {
    return withLeadingSlash;
  }
  return withLeadingSlash.replace(/\/+$/, "");
}

function isPersistentBrowserProfileMutation(method: string, path: string): boolean {
  const normalizedPath = normalizeBrowserRequestPath(path);
  if (
    method === "POST" &&
    (normalizedPath === "/profiles/create" || normalizedPath === "/reset-profile")
  ) {
    return true;
  }
  return method === "DELETE" && /^\/profiles\/[^/]+$/.test(normalizedPath);
}

function resolveRequestedBrowserProfile(params: {
  query?: Record<string, unknown>;
  body?: unknown;
  profile?: string | null;
}): string | undefined {
  const queryProfile =
    typeof params.query?.profile === "string" ? params.query.profile.trim() : undefined;
  if (queryProfile) {
    return queryProfile;
  }
  if (params.body && typeof params.body === "object") {
    const bodyProfile =
      "profile" in params.body && typeof params.body.profile === "string"
        ? params.body.profile.trim()
        : undefined;
    if (bodyProfile) {
      return bodyProfile;
    }
  }
  const explicitProfile = typeof params.profile === "string" ? params.profile.trim() : undefined;
  return explicitProfile || undefined;
}

function redactCdpUrl(cdpUrl: string | null | undefined): string | null | undefined {
  if (typeof cdpUrl !== "string") {
    return cdpUrl;
  }
  const trimmed = cdpUrl.trim();
  if (!trimmed) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    const token = parsed.searchParams.get("token");
    if (token && token.length > 10) {
      parsed.searchParams.set("token", `${token.slice(0, 6)}…${token.slice(-4)}`);
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

function mockBrowserProxyTimeoutOnce() {
  timeoutMocks.withTimeout.mockImplementationOnce(
    async (
      work: (signal: AbortSignal | undefined) => Promise<unknown>,
      _timeoutMs?: number,
      label?: string,
    ) => {
      void work(new AbortController().signal);
      throw new Error(`${label ?? "browser proxy request"} timed out`);
    },
  );
}

vi.mock("../core-api.js", () => ({
  createBrowserControlContext: controlServiceMocks.createBrowserControlContext,
  createBrowserRouteDispatcher: dispatcherMocks.createBrowserRouteDispatcher,
  detectMime: vi.fn(async () => "image/png"),
  isPersistentBrowserProfileMutation,
  loadConfig: configMocks.loadConfig,
  normalizeBrowserRequestPath,
  redactCdpUrl,
  resolveBrowserConfig: browserConfigMocks.resolveBrowserConfig,
  resolveRequestedBrowserProfile,
  startBrowserControlServiceFromConfig: controlServiceMocks.startBrowserControlServiceFromConfig,
  withTimeout: timeoutMocks.withTimeout,
}));

describe("runBrowserProxyCommand", () => {
  beforeEach(() => {
    vi.useRealTimers();
    invokeBrowserTesting.resetForTest();
    dispatcherMocks.dispatch.mockReset();
    dispatcherMocks.createBrowserRouteDispatcher.mockReset().mockImplementation(() => ({
      dispatch: dispatcherMocks.dispatch,
    }));
    controlServiceMocks.createBrowserControlContext.mockReset().mockReturnValue({ control: true });
    controlServiceMocks.startBrowserControlServiceFromConfig.mockReset().mockResolvedValue(true);
    configMocks.loadConfig.mockReset().mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: [] as string[] } },
    });
    browserConfigMocks.resolveBrowserConfig.mockReset().mockReturnValue({
      enabled: true,
      defaultProfile: "openclaw",
    });
    timeoutMocks.withTimeout.mockReset().mockImplementation(
      async (work: (signal: AbortSignal | undefined) => Promise<unknown>) => await work(undefined),
    );
  });

  it("adds profile and browser status details on ws-backed timeouts", async () => {
    mockBrowserProxyTimeoutOnce();
    timeoutMocks.withTimeout.mockImplementationOnce(
      async (work: (signal: AbortSignal | undefined) => Promise<unknown>) => await work(undefined),
    );
    dispatcherMocks.dispatch
      .mockImplementationOnce(async () => {
        await new Promise(() => {});
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          running: true,
          cdpHttp: true,
          cdpReady: false,
          cdpUrl: "http://127.0.0.1:18792",
        },
      });

    const result = expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "GET",
          path: "/snapshot",
          profile: "openclaw",
          timeoutMs: 5,
        }),
      ),
    ).rejects.toThrow(
      /browser proxy timed out for GET \/snapshot after 5ms; ws-backed browser action; profile=openclaw; status\(running=true, cdpHttp=true, cdpReady=false, cdpUrl=http:\/\/127\.0\.0\.1:18792\)/,
    );
    await result;
  });

  it("includes chrome-mcp transport in timeout diagnostics when no CDP URL exists", async () => {
    mockBrowserProxyTimeoutOnce();
    timeoutMocks.withTimeout.mockImplementationOnce(
      async (work: (signal: AbortSignal | undefined) => Promise<unknown>) => await work(undefined),
    );
    dispatcherMocks.dispatch
      .mockImplementationOnce(async () => {
        await new Promise(() => {});
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          running: true,
          transport: "chrome-mcp",
          cdpHttp: true,
          cdpReady: false,
          cdpUrl: null,
        },
      });

    const result = expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "GET",
          path: "/snapshot",
          profile: "user",
          timeoutMs: 5,
        }),
      ),
    ).rejects.toThrow(
      /browser proxy timed out for GET \/snapshot after 5ms; ws-backed browser action; profile=user; status\(running=true, cdpHttp=true, cdpReady=false, transport=chrome-mcp\)/,
    );
    await result;
  });

  it("redacts sensitive cdpUrl details in timeout diagnostics", async () => {
    mockBrowserProxyTimeoutOnce();
    timeoutMocks.withTimeout.mockImplementationOnce(
      async (work: (signal: AbortSignal | undefined) => Promise<unknown>) => await work(undefined),
    );
    dispatcherMocks.dispatch
      .mockImplementationOnce(async () => {
        await new Promise(() => {});
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          running: true,
          cdpHttp: true,
          cdpReady: false,
          cdpUrl:
            "https://alice:supersecretpasswordvalue1234@example.com/chrome?token=supersecrettokenvalue1234567890",
        },
      });

    const result = expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "GET",
          path: "/snapshot",
          profile: "remote",
          timeoutMs: 5,
        }),
      ),
    ).rejects.toThrow(
      /status\(running=true, cdpHttp=true, cdpReady=false, cdpUrl=https:\/\/example\.com\/chrome\?token=supers%E2%80%A67890\)/,
    );
    await result;
  });

  it("keeps non-timeout browser errors intact", async () => {
    dispatcherMocks.dispatch.mockResolvedValue({
      status: 500,
      body: { error: "tab not found" },
    });

    await expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "POST",
          path: "/act",
          profile: "openclaw",
          timeoutMs: 50,
        }),
      ),
    ).rejects.toThrow("tab not found");
  });

  it("rejects unauthorized query.profile when allowProfiles is configured", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: ["openclaw"] } },
    });

    await expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "GET",
          path: "/snapshot",
          query: { profile: "user" },
          timeoutMs: 50,
        }),
      ),
    ).rejects.toThrow("INVALID_REQUEST: browser profile not allowed");
    expect(dispatcherMocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects unauthorized body.profile when allowProfiles is configured", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: ["openclaw"] } },
    });

    await expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "POST",
          path: "/stop",
          body: { profile: "user" },
          timeoutMs: 50,
        }),
      ),
    ).rejects.toThrow("INVALID_REQUEST: browser profile not allowed");
    expect(dispatcherMocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects persistent profile creation when allowProfiles is configured", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: ["openclaw"] } },
    });

    await expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "POST",
          path: "/profiles/create",
          body: { name: "poc", cdpUrl: "http://127.0.0.1:9222" },
          timeoutMs: 50,
        }),
      ),
    ).rejects.toThrow(
      "INVALID_REQUEST: browser.proxy cannot mutate persistent browser profiles when allowProfiles is configured",
    );
    expect(dispatcherMocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects persistent profile deletion when allowProfiles is configured", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: ["openclaw"] } },
    });

    await expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "DELETE",
          path: "/profiles/poc",
          timeoutMs: 50,
        }),
      ),
    ).rejects.toThrow(
      "INVALID_REQUEST: browser.proxy cannot mutate persistent browser profiles when allowProfiles is configured",
    );
    expect(dispatcherMocks.dispatch).not.toHaveBeenCalled();
  });

  it("rejects persistent profile reset when allowProfiles is configured", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: ["openclaw"] } },
    });

    await expect(
      runBrowserProxyCommand(
        JSON.stringify({
          method: "POST",
          path: "/reset-profile",
          body: { profile: "openclaw", name: "openclaw" },
          timeoutMs: 50,
        }),
      ),
    ).rejects.toThrow(
      "INVALID_REQUEST: browser.proxy cannot mutate persistent browser profiles when allowProfiles is configured",
    );
    expect(dispatcherMocks.dispatch).not.toHaveBeenCalled();
  });

  it("canonicalizes an allowlisted body profile into the dispatched query", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: {},
      nodeHost: { browserProxy: { enabled: true, allowProfiles: ["openclaw"] } },
    });
    dispatcherMocks.dispatch.mockResolvedValue({
      status: 200,
      body: { ok: true },
    });

    await runBrowserProxyCommand(
      JSON.stringify({
        method: "POST",
        path: "/stop",
        body: { profile: "openclaw" },
        timeoutMs: 50,
      }),
    );

    expect(dispatcherMocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/stop",
        query: { profile: "openclaw" },
      }),
    );
  });

  it("preserves legacy proxy behavior when allowProfiles is empty", async () => {
    dispatcherMocks.dispatch.mockResolvedValue({
      status: 200,
      body: { ok: true },
    });

    await runBrowserProxyCommand(
      JSON.stringify({
        method: "POST",
        path: "/profiles/create",
        body: { name: "poc", cdpUrl: "http://127.0.0.1:9222" },
        timeoutMs: 50,
      }),
    );

    expect(dispatcherMocks.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: "/profiles/create",
        body: { name: "poc", cdpUrl: "http://127.0.0.1:9222" },
      }),
    );
  });
});
