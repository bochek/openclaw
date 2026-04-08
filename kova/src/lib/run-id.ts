export function createKovaRunId(now = new Date()) {
  const stamp = now
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll(".", "")
    .replace("T", "_")
    .replace("Z", "");
  return `kova_${stamp}`;
}
