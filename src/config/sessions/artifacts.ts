export type SessionArchiveReason = "bak" | "reset" | "deleted";

export function isSessionArchiveArtifactName(fileName: string): boolean {
  return (
    fileName.includes(".deleted.") ||
    fileName.includes(".reset.") ||
    fileName.includes(".bak.") ||
    fileName.startsWith("sessions.json.bak.")
  );
}

export function isPrimarySessionTranscriptFileName(fileName: string): boolean {
  if (fileName === "sessions.json") {
    return false;
  }
  if (!fileName.endsWith(".jsonl")) {
    return false;
  }
  return !isSessionArchiveArtifactName(fileName);
}

export function formatSessionArchiveTimestamp(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().replaceAll(":", "-");
}

function restoreSessionArchiveTimestamp(raw: string): string {
  const [datePart, timePart] = raw.split("T");
  if (!datePart || !timePart) {
    return raw;
  }
  return `${datePart}T${timePart.replace(/-/g, ":")}`;
}

export function parseSessionArchiveTimestamp(
  fileName: string,
  reason: SessionArchiveReason,
): number | null {
  const marker = `.${reason}.`;
  const index = fileName.lastIndexOf(marker);
  if (index < 0) {
    return null;
  }
  const raw = fileName.slice(index + marker.length);
  if (!raw) {
    return null;
  }
  const timestamp = Date.parse(restoreSessionArchiveTimestamp(raw));
  return Number.isNaN(timestamp) ? null : timestamp;
}
