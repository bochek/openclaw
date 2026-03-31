import { installBrowserGlobals, registerBrowserGlobalsHooks } from "./browser-globals.ts";

if (
  typeof document === "undefined" ||
  typeof document.createComment !== "function" ||
  typeof requestAnimationFrame !== "function"
) {
  installBrowserGlobals();
}

registerBrowserGlobalsHooks();
