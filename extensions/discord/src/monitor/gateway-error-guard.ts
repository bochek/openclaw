import type { Client } from "@buape/carbon";
import { getDiscordGatewayEmitter } from "../monitor.gateway.js";

export type EarlyGatewayErrorGuard = {
  pendingErrors: unknown[];
  setHandler: (handler: ((err: unknown) => void) | undefined) => void;
  release: () => void;
};

export function attachEarlyGatewayErrorGuard(client: Client): EarlyGatewayErrorGuard {
  const pendingErrors: unknown[] = [];
  const gateway = client.getPlugin("gateway");
  const emitter = getDiscordGatewayEmitter(gateway);
  if (!emitter) {
    return {
      pendingErrors,
      setHandler: () => {},
      release: () => {},
    };
  }

  let released = false;
  let activeHandler: ((err: unknown) => void) | undefined;
  const onGatewayError = (err: unknown) => {
    if (activeHandler) {
      activeHandler(err);
      return;
    }
    pendingErrors.push(err);
  };
  emitter.on("error", onGatewayError);

  return {
    pendingErrors,
    setHandler: (handler) => {
      activeHandler = handler;
    },
    release: () => {
      if (released) {
        return;
      }
      released = true;
      activeHandler = undefined;
      emitter.removeListener("error", onGatewayError);
    },
  };
}
