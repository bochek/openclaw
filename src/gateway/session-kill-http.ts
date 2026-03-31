import type { IncomingMessage, ServerResponse } from "node:http";
import { killSubagentRunAdmin } from "../agents/subagent-control.js";
import { loadConfig } from "../config/config.js";
import type { AuthRateLimiter } from "./auth-rate-limit.js";
import { isLocalDirectRequest, type ResolvedGatewayAuth } from "./auth.js";
import { authorizeGatewayBearerRequestOrReply } from "./http-auth-helpers.js";
import { sendJson, sendMethodNotAllowed } from "./http-common.js";
import { loadSessionEntry } from "./session-utils.js";

function resolveSessionKeyFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sessions\/([^/]+)\/kill$/);
  if (!match) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(match[1] ?? "").trim();
    return decoded || null;
  } catch {
    return null;
  }
}

export async function handleSessionKillHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    allowRealIpFallback?: boolean;
    rateLimiter?: AuthRateLimiter;
  },
): Promise<boolean> {
  const cfg = loadConfig();
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const sessionKey = resolveSessionKeyFromPath(url.pathname);
  if (!sessionKey) {
    return false;
  }

  if (req.method !== "POST") {
    sendMethodNotAllowed(res, "POST");
    return true;
  }

  const ok = await authorizeGatewayBearerRequestOrReply({
    req,
    res,
    auth: opts.auth,
    trustedProxies: opts.trustedProxies ?? cfg.gateway?.trustedProxies,
    allowRealIpFallback: opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback,
    rateLimiter: opts.rateLimiter,
  });
  if (!ok) {
    return true;
  }

  const { entry, canonicalKey } = loadSessionEntry(sessionKey);
  if (!entry) {
    sendJson(res, 404, {
      ok: false,
      error: {
        type: "not_found",
        message: `Session not found: ${sessionKey}`,
      },
    });
    return true;
  }

  const trustedProxies = opts.trustedProxies ?? cfg.gateway?.trustedProxies;
  const allowRealIpFallback = opts.allowRealIpFallback ?? cfg.gateway?.allowRealIpFallback;
  const allowLocalAdminKill = isLocalDirectRequest(req, trustedProxies, allowRealIpFallback);

  if (!allowLocalAdminKill) {
    sendJson(res, 403, {
      ok: false,
      error: {
        type: "forbidden",
        message: "Session kills require a local admin request.",
      },
    });
    return true;
  }

  const result = await killSubagentRunAdmin({
    cfg,
    sessionKey: canonicalKey,
  });
  const killed = result.killed;

  sendJson(res, 200, {
    ok: true,
    killed,
  });
  return true;
}
