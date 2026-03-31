import { JSDOM } from "jsdom";
import { afterEach, beforeEach, vi } from "vitest";

let activeDom: JSDOM | null = null;

export function installBrowserGlobals(url = "https://control.example/") {
  activeDom?.window.close();
  activeDom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url,
  });
  const { window } = activeDom;
  const viewportWidth = 390;
  const viewportHeight = 844;

  Object.defineProperty(window, "innerWidth", { value: viewportWidth, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: viewportHeight, configurable: true });
  window.matchMedia = ((query: string) => {
    const maxWidth = /max-width:\s*(\d+)px/.exec(query);
    const minWidth = /min-width:\s*(\d+)px/.exec(query);
    const matchesMax = maxWidth ? viewportWidth <= Number(maxWidth[1]) : true;
    const matchesMin = minWidth ? viewportWidth >= Number(minWidth[1]) : true;
    const matches = matchesMax && matchesMin;
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;

  vi.stubGlobal("window", window as unknown as Window & typeof globalThis);
  vi.stubGlobal("document", window.document as unknown as Document);
  vi.stubGlobal("navigator", window.navigator as Navigator);
  vi.stubGlobal("location", window.location as Location);
  vi.stubGlobal("history", window.history as History);
  vi.stubGlobal("localStorage", window.localStorage as Storage);
  vi.stubGlobal("sessionStorage", window.sessionStorage as Storage);
  vi.stubGlobal("customElements", window.customElements as CustomElementRegistry);
  vi.stubGlobal("HTMLElement", window.HTMLElement);
  vi.stubGlobal("HTMLAnchorElement", window.HTMLAnchorElement);
  vi.stubGlobal("HTMLButtonElement", window.HTMLButtonElement);
  vi.stubGlobal("HTMLDialogElement", window.HTMLDialogElement);
  vi.stubGlobal("HTMLInputElement", window.HTMLInputElement);
  vi.stubGlobal("HTMLSelectElement", window.HTMLSelectElement);
  vi.stubGlobal("HTMLTextAreaElement", window.HTMLTextAreaElement);
  vi.stubGlobal("Element", window.Element);
  vi.stubGlobal("Node", window.Node);
  vi.stubGlobal("Event", window.Event);
  vi.stubGlobal("CustomEvent", window.CustomEvent);
  vi.stubGlobal("MouseEvent", window.MouseEvent);
  vi.stubGlobal("KeyboardEvent", window.KeyboardEvent);
  vi.stubGlobal("Document", window.Document);
  vi.stubGlobal("DocumentFragment", window.DocumentFragment);
  vi.stubGlobal("ShadowRoot", window.ShadowRoot);
  vi.stubGlobal("DOMParser", window.DOMParser);
  vi.stubGlobal("MutationObserver", window.MutationObserver);
  vi.stubGlobal("getComputedStyle", window.getComputedStyle.bind(window));
  vi.stubGlobal("matchMedia", window.matchMedia.bind(window));
  vi.stubGlobal("requestAnimationFrame", window.requestAnimationFrame.bind(window));
  vi.stubGlobal("cancelAnimationFrame", window.cancelAnimationFrame.bind(window));

  return window;
}

export function cleanupBrowserGlobals() {
  activeDom?.window.close();
  activeDom = null;
  vi.unstubAllGlobals();
}

export function registerBrowserGlobalsHooks(url = "https://control.example/") {
  beforeEach(() => {
    installBrowserGlobals(url);
  });

  afterEach(() => {
    cleanupBrowserGlobals();
  });
}
