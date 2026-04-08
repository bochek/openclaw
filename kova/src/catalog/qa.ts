import { readQaScenarioPack } from "../../../extensions/qa-lab/api.js";

export type KovaQaScenarioCatalogEntry = {
  id: string;
  title: string;
  surface: string;
  objective: string;
  sourcePath: string;
};

export type KovaQaSurfaceSummary = {
  surface: string;
  scenarioCount: number;
};

export function listKovaQaScenarios(): KovaQaScenarioCatalogEntry[] {
  const pack = readQaScenarioPack();
  return pack.scenarios.map((scenario) => ({
    id: scenario.id,
    title: scenario.title,
    surface: scenario.surface,
    objective: scenario.objective,
    sourcePath: scenario.sourcePath,
  }));
}

export function findMissingKovaQaScenarioIds(selectedIds: string[]) {
  const knownIds = new Set(listKovaQaScenarios().map((scenario) => scenario.id));
  return selectedIds.filter((scenarioId) => !knownIds.has(scenarioId));
}

export function summarizeKovaQaSurfaces(): KovaQaSurfaceSummary[] {
  const counts = new Map<string, number>();
  for (const scenario of listKovaQaScenarios()) {
    counts.set(scenario.surface, (counts.get(scenario.surface) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([surface, scenarioCount]) => ({ surface, scenarioCount }))
    .toSorted((left, right) => left.surface.localeCompare(right.surface));
}
