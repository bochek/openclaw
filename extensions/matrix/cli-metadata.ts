import { definePluginEntry } from "openclaw/plugin-sdk/core";
export { registerMatrixCliMetadata } from "./src/cli-metadata.js";
import { registerMatrixCliMetadata } from "./src/cli-metadata.js";

export default definePluginEntry({
  id: "matrix",
  name: "Matrix",
  description: "Matrix channel plugin (matrix-js-sdk)",
  register: registerMatrixCliMetadata,
});
