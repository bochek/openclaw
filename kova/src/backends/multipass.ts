import type { KovaBackend } from "./types.js";

export const multipassBackend: KovaBackend = {
  id: "multipass",
  supportsTarget(target): target is "qa" {
    return target === "qa";
  },
  async run(selection) {
    throw new Error(
      `multipass backend is not implemented yet for target ${selection.target}; use --backend host for now`,
    );
  },
};
