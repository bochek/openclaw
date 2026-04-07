import { createLazyPluginLocalModule } from "openclaw/plugin-sdk/lazy-runtime";
import type {
  saveBackfilledMatrixDeviceId as saveBackfilledMatrixDeviceIdType,
  saveMatrixCredentials as saveMatrixCredentialsType,
  touchMatrixCredentials as touchMatrixCredentialsType,
} from "./credentials.js";

const loadMatrixCredentialsModule = createLazyPluginLocalModule<typeof import("./credentials.js")>(
  import.meta.url,
  "./credentials.js",
);

export async function saveMatrixCredentials(
  ...args: Parameters<typeof saveMatrixCredentialsType>
): ReturnType<typeof saveMatrixCredentialsType> {
  const runtime = await loadMatrixCredentialsModule();
  return runtime.saveMatrixCredentials(...args);
}

export async function saveBackfilledMatrixDeviceId(
  ...args: Parameters<typeof saveBackfilledMatrixDeviceIdType>
): ReturnType<typeof saveBackfilledMatrixDeviceIdType> {
  const runtime = await loadMatrixCredentialsModule();
  return runtime.saveBackfilledMatrixDeviceId(...args);
}

export async function touchMatrixCredentials(
  ...args: Parameters<typeof touchMatrixCredentialsType>
): ReturnType<typeof touchMatrixCredentialsType> {
  const runtime = await loadMatrixCredentialsModule();
  return runtime.touchMatrixCredentials(...args);
}
