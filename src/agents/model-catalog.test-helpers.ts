import type { ModelCatalogEntry } from "./model-catalog.js";

type RequiredModelCatalogFields = Pick<ModelCatalogEntry, "provider" | "id" | "name">;

export function makeModelCatalogEntry(
  required: RequiredModelCatalogFields,
  optional?: Omit<ModelCatalogEntry, keyof RequiredModelCatalogFields>,
): ModelCatalogEntry {
  return {
    provider: required.provider,
    id: required.id,
    name: required.name,
    ...optional,
  };
}
