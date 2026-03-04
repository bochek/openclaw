// Matrix-js plugin-sdk surface.
// Reuse root plugin-sdk exports on branches that don't yet expose matrix-specific subpaths.

export * from "./index.js";

export type { ChannelSetupInput } from "../channels/plugins/types.js";
export type { GatewayRequestHandlerOptions } from "../gateway/server-methods/types.js";
export { migrateBaseNameToDefaultAccount } from "../channels/plugins/setup-helpers.js";
export { promptAccountId } from "../channels/plugins/onboarding/helpers.js";
export { writeJsonFileAtomically } from "./json-store.js";
export { formatZonedTimestamp } from "../infra/format-time/format-datetime.js";
