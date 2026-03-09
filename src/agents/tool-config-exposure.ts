export const CONFIGURED_TOOL_SECTION_EXPOSURES = {
  exec: ["exec", "process"],
  fs: ["read", "write", "edit"],
} as const;

export type ConfiguredToolSectionId = keyof typeof CONFIGURED_TOOL_SECTION_EXPOSURES;
