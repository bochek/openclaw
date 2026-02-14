export const ROOT_CONFIG_SCHEMA_KEY = "$schema";

export const ROOT_CONFIG_METADATA_KEYS = [ROOT_CONFIG_SCHEMA_KEY] as const;

export const ROOT_CONFIG_METADATA_KEY_SET = new Set<string>(ROOT_CONFIG_METADATA_KEYS);
