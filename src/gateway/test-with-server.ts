import { afterAll, beforeAll, beforeEach } from "vitest";
import { connectOk, startServerWithClient, testState } from "./test-helpers.js";

type StartServerWithClient = typeof startServerWithClient;
export type GatewayWs = Awaited<ReturnType<StartServerWithClient>>["ws"];
export type GatewayServer = Awaited<ReturnType<StartServerWithClient>>["server"];

async function closeTestServer(server: GatewayServer): Promise<void> {
  await Promise.race([
    server.close(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 2_000);
    }),
  ]);
}

export async function withServer<T>(run: (ws: GatewayWs) => Promise<T>): Promise<T> {
  const { server, ws, envSnapshot } = await startServerWithClient("secret");
  try {
    return await run(ws);
  } finally {
    ws.close();
    ws.terminate?.();
    await closeTestServer(server);
    envSnapshot.restore();
  }
}

export function installConnectedControlUiServerSuite(
  onReady: (started: { server: GatewayServer; ws: GatewayWs; port: number }) => void,
): void {
  let started: Awaited<ReturnType<StartServerWithClient>> | null = null;
  const token = "secret";

  beforeAll(async () => {
    started = await startServerWithClient(token, { controlUiEnabled: true });
    onReady({
      server: started.server,
      ws: started.ws,
      port: started.port,
    });
    await connectOk(started.ws);
  });

  beforeEach(() => {
    process.env.OPENCLAW_GATEWAY_TOKEN = token;
    testState.gatewayAuth = { mode: "token", token };
  });

  afterAll(async () => {
    started?.ws.close();
    started?.ws.terminate?.();
    if (started?.server) {
      await closeTestServer(started.server);
    }
    started?.envSnapshot.restore();
  });
}
