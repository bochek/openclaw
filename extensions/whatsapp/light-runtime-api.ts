// Keep the light runtime wrapper delegated to the dedicated light assembly so
// lazy callers do not accidentally pull the heavy runtime graph.
export * from "./src/light-runtime-api.js";
