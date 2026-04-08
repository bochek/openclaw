import { qaBackend } from "./qa.js";
import type { KovaBackend, KovaRunTarget } from "./types.js";

const kovaBackends: KovaBackend[] = [qaBackend];

export function resolveKovaBackend(target: KovaRunTarget) {
  const backend = kovaBackends.find((candidate) => candidate.supportsTarget(target));
  if (!backend) {
    throw new Error(`no Kova backend registered for target: ${target}`);
  }
  return backend;
}
