import createDOMPurify from "dompurify";

type DOMPurifyLike = {
  addHook: (name: string, hook: (node: Node) => void) => void;
  sanitize: (value: string, options?: unknown) => string;
};

const DOM_PURIFY_INSTANCE = Symbol.for("openclaw.ui.domPurify");

function isDOMPurifyLike(value: unknown): value is DOMPurifyLike {
  return (
    Boolean(value) &&
    typeof (value as DOMPurifyLike).addHook === "function" &&
    typeof (value as DOMPurifyLike).sanitize === "function"
  );
}

function resolveDOMPurify(): DOMPurifyLike {
  const candidate = createDOMPurify as unknown as DOMPurifyLike & ((window: Window) => DOMPurifyLike);
  if (isDOMPurifyLike(candidate)) {
    return candidate;
  }
  if (typeof window === "undefined") {
    throw new Error("DOMPurify requires a browser window");
  }
  return candidate(window);
}

export function getDOMPurify(): DOMPurifyLike {
  const instance = resolveDOMPurify();
  if (typeof window === "undefined" || isDOMPurifyLike(createDOMPurify)) {
    return instance;
  }
  const cachedWindow = window as Window & {
    [DOM_PURIFY_INSTANCE]?: DOMPurifyLike;
  };
  cachedWindow[DOM_PURIFY_INSTANCE] ??= instance;
  return cachedWindow[DOM_PURIFY_INSTANCE]!;
}
