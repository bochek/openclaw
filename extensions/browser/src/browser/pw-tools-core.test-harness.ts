import { beforeEach, vi } from "vitest";
import {
  __testing as pwToolsCoreDownloadsTesting,
  type PwToolsCoreDownloadTestDeps,
} from "./pw-tools-core.downloads.js";
import {
  __testing as pwToolsCoreInteractionsTesting,
  type PwToolsCoreInteractionTestDeps,
} from "./pw-tools-core.interactions.js";
import {
  __testing as pwToolsCoreSnapshotTesting,
  type PwToolsCoreSnapshotDeps,
} from "./pw-tools-core.snapshot.js";

let currentPage: Record<string, unknown> | null = null;
let currentRefLocator: Record<string, unknown> | null = null;
let pageState: {
  console: unknown[];
  armIdUpload: number;
  armIdDialog: number;
  armIdDownload: number;
} = {
  console: [],
  armIdUpload: 0,
  armIdDialog: 0,
  armIdDownload: 0,
};

const sessionMocks = vi.hoisted(() => ({
  getPageForTargetId: vi.fn(async () => {
    if (!currentPage) {
      throw new Error("missing page");
    }
    return currentPage;
  }),
  ensurePageState: vi.fn(() => pageState),
  forceDisconnectPlaywrightForTarget: vi.fn(async () => {}),
  restoreRoleRefsForTarget: vi.fn(() => {}),
  storeRoleRefsForTarget: vi.fn(() => {}),
  refLocator: vi.fn(() => {
    if (!currentRefLocator) {
      throw new Error("missing locator");
    }
    return currentRefLocator;
  }),
  rememberRoleRefsForTarget: vi.fn(() => {}),
}));

export function getPwToolsCoreSessionMocks() {
  return sessionMocks;
}

export function setPwToolsCoreCurrentPage(page: Record<string, unknown> | null) {
  currentPage = page;
}

export function setPwToolsCoreCurrentRefLocator(locator: Record<string, unknown> | null) {
  currentRefLocator = locator;
}

export function installPwToolsCoreTestHooks() {
  beforeEach(() => {
    currentPage = null;
    currentRefLocator = null;
    pageState = {
      console: [],
      armIdUpload: 0,
      armIdDialog: 0,
      armIdDownload: 0,
    };

    for (const fn of Object.values(sessionMocks)) {
      fn.mockClear();
    }

    const deps: PwToolsCoreInteractionTestDeps = {
      ensurePageState: sessionMocks.ensurePageState,
      forceDisconnectPlaywrightForTarget: sessionMocks.forceDisconnectPlaywrightForTarget,
      getPageForTargetId: sessionMocks.getPageForTargetId,
      refLocator: sessionMocks.refLocator,
      restoreRoleRefsForTarget: sessionMocks.restoreRoleRefsForTarget,
    };
    pwToolsCoreInteractionsTesting.setDepsForTest(deps);

    const downloadDeps: PwToolsCoreDownloadTestDeps = {
      ensurePageState: sessionMocks.ensurePageState,
      getPageForTargetId: sessionMocks.getPageForTargetId,
      refLocator: sessionMocks.refLocator,
      restoreRoleRefsForTarget: sessionMocks.restoreRoleRefsForTarget,
    };
    pwToolsCoreDownloadsTesting.setDepsForTest(downloadDeps);

    const snapshotDeps: PwToolsCoreSnapshotDeps = {
      ensurePageState: sessionMocks.ensurePageState,
      forceDisconnectPlaywrightForTarget: sessionMocks.forceDisconnectPlaywrightForTarget,
      getPageForTargetId: sessionMocks.getPageForTargetId,
      storeRoleRefsForTarget: sessionMocks.storeRoleRefsForTarget,
    };
    pwToolsCoreSnapshotTesting.setDepsForTest(snapshotDeps);
  });
}
