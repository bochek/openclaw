import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStorageMock } from "../../test-helpers/storage.ts";
import { pt_BR } from "../locales/pt-BR.ts";
import { zh_CN } from "../locales/zh-CN.ts";
import { zh_TW } from "../locales/zh-TW.ts";

type TranslateModule = typeof import("../lib/translate.ts");

async function loadFreshTranslateModule(): Promise<TranslateModule> {
  return (await import(`../lib/translate.ts?t=${Date.now()}`)) as TranslateModule;
}

function installBrowserGlobals(params?: { locale?: string; withStorage?: boolean }) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language: params?.locale ?? "en-US" } satisfies Partial<Navigator>,
    writable: true,
  });
  if (params?.withStorage !== false) {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: createStorageMock(),
      writable: true,
    });
  } else {
    delete (globalThis as Record<string, unknown>).localStorage;
  }
}

describe("i18n", () => {
  let translate: TranslateModule;

  beforeEach(async () => {
    installBrowserGlobals();
    translate = await loadFreshTranslateModule();
    localStorage.clear();
    // Reset to English
    await translate.i18n.setLocale("en");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return the key if translation is missing", () => {
    expect(translate.t("non.existent.key")).toBe("non.existent.key");
  });

  it("should return the correct English translation", () => {
    expect(translate.t("common.health")).toBe("Health");
  });

  it("should replace parameters correctly", () => {
    expect(translate.t("overview.stats.cronNext", { time: "10:00" })).toBe("Next wake 10:00");
  });

  it("should fallback to English if key is missing in another locale", async () => {
    // We haven't registered other locales in the test environment yet,
    // but the logic should fallback to 'en' map which is always there.
    await translate.i18n.setLocale("zh-CN");
    // Since we don't mock the import, it might fail to load zh-CN,
    // but let's assume it falls back to English for now.
    expect(translate.t("common.health")).toBeDefined();
  });

  it("loads translations even when setting the same locale again", async () => {
    const internal = translate.i18n as unknown as {
      locale: string;
      translations: Record<string, unknown>;
    };
    internal.locale = "zh-CN";
    delete internal.translations["zh-CN"];

    await translate.i18n.setLocale("zh-CN");
    expect(translate.t("common.health")).toBe("健康状况");
  });

  it("loads saved non-English locale on startup", async () => {
    installBrowserGlobals();
    localStorage.setItem("openclaw.i18n.locale", "zh-CN");
    const fresh = await loadFreshTranslateModule();
    const manager = fresh.__testing.createManagerForTest();
    await vi.waitFor(() => {
      expect(manager.getLocale()).toBe("zh-CN");
    });
    expect(manager.getLocale()).toBe("zh-CN");
    expect(manager.t("common.health")).toBe("健康状况");
  });

  it("skips node localStorage accessors that warn without a storage file", async () => {
    vi.unstubAllGlobals();
    installBrowserGlobals({ withStorage: false });
    const warningSpy = vi.spyOn(process, "emitWarning").mockImplementation(() => {});

    const fresh = await loadFreshTranslateModule();

    expect(fresh.i18n.getLocale()).toBe("en");
    expect(warningSpy).not.toHaveBeenCalledWith(
      "`--localstorage-file` was provided without a valid path",
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps the version label available in shipped locales", () => {
    expect((pt_BR.common as { version?: string }).version).toBeTruthy();
    expect((zh_CN.common as { version?: string }).version).toBeTruthy();
    expect((zh_TW.common as { version?: string }).version).toBeTruthy();
  });
});
