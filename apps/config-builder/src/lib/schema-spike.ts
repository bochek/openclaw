import { buildConfigSchema } from "@openclaw/config/schema.ts";
import { OpenClawSchema } from "@openclaw/config/zod-schema.ts";

type JsonSchemaRoot = {
  properties?: Record<string, unknown>;
};

export type SchemaSpikeSummary = {
  schemaRootProperties: number;
  schemaTopSections: string[];
  uiHintCount: number;
  generatedAt: string;
  version: string;
};

export function runSchemaSpike(): SchemaSpikeSummary {
  const schema = OpenClawSchema.toJSONSchema({
    target: "draft-07",
    unrepresentable: "any",
  }) as JsonSchemaRoot;
  const topLevelProps = Object.keys(schema.properties ?? {});

  const configSchema = buildConfigSchema();

  return {
    schemaRootProperties: topLevelProps.length,
    schemaTopSections: topLevelProps.slice(0, 10),
    uiHintCount: Object.keys(configSchema.uiHints).length,
    generatedAt: configSchema.generatedAt,
    version: configSchema.version,
  };
}
