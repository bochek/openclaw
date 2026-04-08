import { readQaScenarioPack } from "../../../extensions/qa-lab/api.js";

export type KovaQaScenarioCatalogEntry = {
  id: string;
  title: string;
  surface: string;
  objective: string;
  sourcePath: string;
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
