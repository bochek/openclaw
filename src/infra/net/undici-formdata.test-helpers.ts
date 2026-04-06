import { expect } from "vitest";

export class MockRuntimeFormData {
  readonly parts: Array<{ key: string; value: unknown; fileName?: string }> = [];

  append(key: string, value: unknown, fileName?: string): void {
    this.parts.push({ key, value, fileName });
  }

  get(key: string): unknown {
    return this.parts.find((part) => part.key === key)?.value ?? null;
  }

  getFileName(key: string): string | undefined {
    return this.parts.find((part) => part.key === key)?.fileName;
  }
}

export function createTranscriptionForm(): FormData {
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob(["audio"], { type: "audio/wav" }), "note.wav");
  return form;
}

export function expectNormalizedMultipartBody<
  TFormData extends { get(key: string): unknown },
>(params: {
  body: unknown;
  formDataCtor: abstract new (...args: never[]) => TFormData;
  expectedModel?: string;
  expectedFileName?: string;
}): TFormData {
  expect(params.body).toBeInstanceOf(params.formDataCtor);
  const normalizedBody = params.body as TFormData & {
    getFileName?: (key: string) => string | undefined;
  };
  expect(normalizedBody.get("model")).toBe(params.expectedModel ?? "gpt-4o-mini-transcribe");
  expect(normalizedBody.get("file")).toBeInstanceOf(Blob);
  if (params.expectedFileName) {
    expect(normalizedBody.getFileName?.("file")).toBe(params.expectedFileName);
  }
  return normalizedBody;
}
