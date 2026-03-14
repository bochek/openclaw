/**
 * Drivers that launch/manage a browser instance (sandbox). Any driver not in
 * this set attaches to the user's existing browser.
 */
export const MANAGED_BROWSER_DRIVERS = new Set(["openclaw", "clawd"]);

export const DEFAULT_OPENCLAW_BROWSER_ENABLED = true;
export const DEFAULT_BROWSER_EVALUATE_ENABLED = true;
export const DEFAULT_OPENCLAW_BROWSER_COLOR = "#FF4500";
export const DEFAULT_OPENCLAW_BROWSER_PROFILE_NAME = "openclaw";
export const DEFAULT_BROWSER_DEFAULT_PROFILE_NAME = "openclaw";
export const DEFAULT_AI_SNAPSHOT_MAX_CHARS = 80_000;
export const DEFAULT_AI_SNAPSHOT_EFFICIENT_MAX_CHARS = 10_000;
export const DEFAULT_AI_SNAPSHOT_EFFICIENT_DEPTH = 6;
