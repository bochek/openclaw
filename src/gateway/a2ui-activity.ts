import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import type { CanvasHostActivityConfig } from "../config/types.gateway.js";

export type A2uiActivityHub = {
  enabled: boolean;
  token?: string;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean;
  broadcastPush: (jsonl: string) => void;
  broadcastReset: () => void;
  close: () => Promise<void>;
};

type A2uiActivityPayload =
  | { type: "a2ui.state"; jsonl: string; updatedAt: number }
  | { type: "a2ui.push"; jsonl: string; updatedAt: number }
  | { type: "a2ui.reset"; updatedAt: number };

function resolveActivityToken(req: IncomingMessage): string | undefined {
  const url = new URL(req.url ?? "/", "http://localhost");
  const raw = url.searchParams.get("activityToken") ?? url.searchParams.get("a2uiToken");
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function isA2uiActivityAccessAllowed(
  activity: CanvasHostActivityConfig | undefined,
  req: IncomingMessage,
): boolean {
  if (!activity?.enabled) {
    return false;
  }
  const token = activity.token?.trim();
  if (!token) {
    return true;
  }
  return resolveActivityToken(req) === token;
}

function sendPayload(ws: WebSocket, payload: A2uiActivityPayload) {
  if (ws.readyState !== ws.OPEN) {
    return;
  }
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // ignore send errors
  }
}

export function createA2uiActivityHub(params: {
  activity?: CanvasHostActivityConfig;
}): A2uiActivityHub {
  const enabled = params.activity?.enabled === true;
  const token = params.activity?.token?.trim() || undefined;
  if (!enabled) {
    return {
      enabled: false,
      token,
      handleUpgrade: () => false,
      broadcastPush: () => {},
      broadcastReset: () => {},
      close: async () => {},
    };
  }

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();
  let lastJsonl: string | null = null;
  let lastUpdatedAt = 0;

  const broadcast = (payload: A2uiActivityPayload) => {
    for (const ws of clients) {
      sendPayload(ws, payload);
    }
  };

  const broadcastPush = (jsonl: string) => {
    lastJsonl = jsonl;
    lastUpdatedAt = Date.now();
    broadcast({ type: "a2ui.push", jsonl, updatedAt: lastUpdatedAt });
  };

  const broadcastReset = () => {
    lastJsonl = null;
    lastUpdatedAt = Date.now();
    broadcast({ type: "a2ui.reset", updatedAt: lastUpdatedAt });
  };

  wss.on("connection", (ws) => {
    clients.add(ws);
    if (lastJsonl) {
      sendPayload(ws, { type: "a2ui.state", jsonl: lastJsonl, updatedAt: lastUpdatedAt });
    } else if (lastUpdatedAt > 0) {
      sendPayload(ws, { type: "a2ui.reset", updatedAt: lastUpdatedAt });
    }

    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  return {
    enabled,
    token,
    handleUpgrade: (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return true;
    },
    broadcastPush,
    broadcastReset,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      clients.clear();
    },
  };
}
