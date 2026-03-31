import { drainSessionWriteLockStateForTest } from "../agents/session-write-lock.js";
import * as sessionStoreModule from "../config/sessions/store.js";
import * as fileLockModule from "../infra/file-lock.js";

function getOptionalModuleFn<T extends (...args: never[]) => unknown>(
  module: object,
  key: string,
): T | undefined {
  try {
    const candidate = Reflect.get(module, key);
    return typeof candidate === "function" ? (candidate as T) : undefined;
  } catch {
    return undefined;
  }
}

type DrainSessionStoreLockQueuesForTest = typeof sessionStoreModule.drainSessionStoreLockQueuesForTest;
type ClearSessionStoreCacheForTest = typeof sessionStoreModule.clearSessionStoreCacheForTest;
type DrainFileLockStateForTest = typeof fileLockModule.drainFileLockStateForTest;

let fileLockDrainerForTests: DrainFileLockStateForTest | null = null;
let sessionStoreLockQueueDrainerForTests: DrainSessionStoreLockQueuesForTest | null = null;
let sessionWriteLockDrainerForTests: typeof drainSessionWriteLockStateForTest | null = null;
let sessionStoreCacheClearerForTests: ClearSessionStoreCacheForTest | null = null;

export function setSessionStateCleanupRuntimeForTests(params: {
  clearSessionStoreCacheForTest?: ClearSessionStoreCacheForTest | null;
  drainFileLockStateForTest?: DrainFileLockStateForTest | null;
  drainSessionStoreLockQueuesForTest?: DrainSessionStoreLockQueuesForTest | null;
  drainSessionWriteLockStateForTest?: typeof drainSessionWriteLockStateForTest | null;
}): void {
  if ("clearSessionStoreCacheForTest" in params) {
    sessionStoreCacheClearerForTests = params.clearSessionStoreCacheForTest ?? null;
  }
  if ("drainFileLockStateForTest" in params) {
    fileLockDrainerForTests = params.drainFileLockStateForTest ?? null;
  }
  if ("drainSessionStoreLockQueuesForTest" in params) {
    sessionStoreLockQueueDrainerForTests = params.drainSessionStoreLockQueuesForTest ?? null;
  }
  if ("drainSessionWriteLockStateForTest" in params) {
    sessionWriteLockDrainerForTests = params.drainSessionWriteLockStateForTest ?? null;
  }
}

export function resetSessionStateCleanupRuntimeForTests(): void {
  sessionStoreCacheClearerForTests = null;
  fileLockDrainerForTests = null;
  sessionStoreLockQueueDrainerForTests = null;
  sessionWriteLockDrainerForTests = null;
}

export async function cleanupSessionStateForTest(): Promise<void> {
  await (
    sessionStoreLockQueueDrainerForTests ??
    getOptionalModuleFn<DrainSessionStoreLockQueuesForTest>(
      sessionStoreModule,
      "drainSessionStoreLockQueuesForTest",
    )
  )?.();
  (
    sessionStoreCacheClearerForTests ??
    getOptionalModuleFn<ClearSessionStoreCacheForTest>(sessionStoreModule, "clearSessionStoreCacheForTest")
  )?.();
  await (
    fileLockDrainerForTests ??
    getOptionalModuleFn<DrainFileLockStateForTest>(fileLockModule, "drainFileLockStateForTest")
  )?.();
  await (sessionWriteLockDrainerForTests ?? drainSessionWriteLockStateForTest)();
}
