import { html, nothing, type TemplateResult } from "lit";
import type { ExplorerField, FieldKind } from "../../lib/schema-spike.ts";

type FieldRendererParams = {
  field: ExplorerField;
  value: unknown;
  onSet: (value: unknown) => void;
  onClear: () => void;
  onValidationError?: (message: string) => void;
};

function defaultValueForKind(kind: FieldKind): unknown {
  if (kind === "boolean") {
    return false;
  }
  if (kind === "number" || kind === "integer") {
    return 0;
  }
  return "";
}

function parseScalar(kind: FieldKind, raw: string): unknown {
  if (kind === "number") {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error("Enter a valid number.");
    }
    return parsed;
  }

  if (kind === "integer") {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error("Enter a valid integer.");
    }
    return Math.trunc(parsed);
  }

  if (kind === "boolean") {
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
    throw new Error("Use true or false.");
  }

  return raw;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function jsonValue(value: unknown): string {
  if (value === undefined) {
    return "{}";
  }
  try {
    return JSON.stringify(value, null, 2) ?? "{}";
  } catch {
    return "{}";
  }
}

function renderScalarControl(params: {
  field: ExplorerField;
  value: unknown;
  onSet: (value: unknown) => void;
  onClear: () => void;
  onValidationError?: (message: string) => void;
}): TemplateResult {
  const { field, value, onSet, onClear, onValidationError } = params;

  if (field.kind === "boolean") {
    return html`
      <label class="cfg-toggle-row builder-toggle-row">
        <span class="cfg-field__help">Toggle value</span>
        <div class="cfg-toggle">
          <input
            type="checkbox"
            .checked=${value === true}
            @change=${(event: Event) => onSet((event.target as HTMLInputElement).checked)}
          />
          <span class="cfg-toggle__track"></span>
        </div>
      </label>
    `;
  }

  if (field.kind === "enum") {
    const selected = typeof value === "string" ? value : "";
    if (field.enumValues.length > 0 && field.enumValues.length <= 4) {
      return html`
        <div class="cfg-segmented">
          ${field.enumValues.map(
            (entry) => html`
              <button
                type="button"
                class="cfg-segmented__btn ${entry === selected ? "active" : ""}"
                @click=${() => onSet(entry)}
              >
                ${entry}
              </button>
            `,
          )}
          <button type="button" class="cfg-segmented__btn ${selected ? "" : "active"}" @click=${onClear}>
            unset
          </button>
        </div>
      `;
    }

    return html`
      <select
        class="cfg-select"
        .value=${selected}
        @change=${(event: Event) => {
          const next = (event.target as HTMLSelectElement).value;
          if (!next) {
            onClear();
            return;
          }
          onSet(next);
        }}
      >
        <option value="">(unset)</option>
        ${field.enumValues.map((entry) => html`<option value=${entry}>${entry}</option>`)}
      </select>
    `;
  }

  const inputType = field.kind === "number" || field.kind === "integer" ? "number" : "text";
  const inputValue = value == null ? "" : String(value);

  return html`
    <input
      class="cfg-input"
      type=${field.sensitive ? "password" : inputType}
      .value=${inputValue}
      @input=${(event: Event) => {
        const raw = (event.target as HTMLInputElement).value;
        if (raw.trim() === "") {
          onClear();
          return;
        }
        try {
          onSet(parseScalar(field.kind, raw));
        } catch (error) {
          onValidationError?.(error instanceof Error ? error.message : String(error));
        }
      }}
    />
  `;
}

function renderPrimitiveArray(params: {
  field: ExplorerField;
  value: unknown;
  onSet: (value: unknown) => void;
  onValidationError?: (message: string) => void;
}): TemplateResult {
  const { field, value, onSet, onValidationError } = params;
  const list = asArray(value);
  const itemKind = field.itemKind;
  const itemEnum = field.itemEnumValues;

  if (!itemKind || itemKind === "unknown" || itemKind === "object" || itemKind === "array") {
    return renderJsonControl({ field, value, onSet, onValidationError });
  }

  return html`
    <div class="cfg-array">
      <div class="cfg-array__header">
        <span class="cfg-array__label">Items</span>
        <span class="cfg-array__count">${list.length} item${list.length === 1 ? "" : "s"}</span>
        <button
          type="button"
          class="cfg-array__add"
          @click=${() => onSet([...list, defaultValueForKind(itemKind)])}
        >
          Add
        </button>
      </div>

      ${list.length === 0
        ? html`<div class="cfg-array__empty">No items yet.</div>`
        : html`
            <div class="cfg-array__items">
              ${list.map((item, index) =>
                html`
                  <div class="cfg-array__item">
                    <div class="cfg-array__item-header">
                      <span class="cfg-array__item-index">#${index + 1}</span>
                      <button
                        type="button"
                        class="cfg-array__item-remove"
                        title="Remove item"
                        @click=${() => {
                          const next = [...list];
                          next.splice(index, 1);
                          onSet(next);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div class="cfg-array__item-content">
                      ${itemKind === "boolean"
                        ? html`
                            <label class="cfg-toggle-row builder-toggle-row">
                              <span class="cfg-field__help">boolean</span>
                              <div class="cfg-toggle">
                                <input
                                  type="checkbox"
                                  .checked=${item === true}
                                  @change=${(event: Event) => {
                                    const next = [...list];
                                    next[index] = (event.target as HTMLInputElement).checked;
                                    onSet(next);
                                  }}
                                />
                                <span class="cfg-toggle__track"></span>
                              </div>
                            </label>
                          `
                        : itemKind === "enum" && itemEnum.length > 0
                          ? html`
                              <select
                                class="cfg-select"
                                .value=${String(item ?? "")}
                                @change=${(event: Event) => {
                                  const next = [...list];
                                  next[index] = (event.target as HTMLSelectElement).value;
                                  onSet(next);
                                }}
                              >
                                ${itemEnum.map(
                                  (entry) => html`<option value=${entry}>${entry}</option>`,
                                )}
                              </select>
                            `
                          : html`
                              <input
                                class="cfg-input"
                                type=${itemKind === "number" || itemKind === "integer" ? "number" : "text"}
                                .value=${item == null ? "" : String(item)}
                                @input=${(event: Event) => {
                                  const raw = (event.target as HTMLInputElement).value;
                                  const next = [...list];
                                  if (raw.trim() === "") {
                                    next[index] = defaultValueForKind(itemKind);
                                    onSet(next);
                                    return;
                                  }
                                  try {
                                    next[index] = parseScalar(itemKind, raw);
                                    onSet(next);
                                  } catch (error) {
                                    onValidationError?.(
                                      error instanceof Error ? error.message : String(error),
                                    );
                                  }
                                }}
                              />
                            `}
                    </div>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

function renderRecordObject(params: {
  field: ExplorerField;
  value: unknown;
  onSet: (value: unknown) => void;
  onValidationError?: (message: string) => void;
}): TemplateResult {
  const { field, value, onSet, onValidationError } = params;
  const record = asObject(value);
  const entries = Object.entries(record);
  const valueKind = field.recordValueKind;

  if (!valueKind || valueKind === "unknown" || valueKind === "object" || valueKind === "array") {
    return renderJsonControl(params);
  }

  return html`
    <div class="cfg-map">
      <div class="cfg-map__header">
        <span class="cfg-map__label">Entries</span>
        <button
          type="button"
          class="cfg-map__add"
          @click=${() => {
            const next = { ...record };
            let index = 1;
            let key = `key-${index}`;
            while (key in next) {
              index += 1;
              key = `key-${index}`;
            }
            next[key] = defaultValueForKind(valueKind);
            onSet(next);
          }}
        >
          Add Entry
        </button>
      </div>

      ${entries.length === 0
        ? html`<div class="cfg-map__empty">No entries yet.</div>`
        : html`
            <div class="cfg-map__items">
              ${entries.map(([key, entryValue]) =>
                html`
                  <div class="cfg-map__item">
                    <div class="cfg-map__item-key">
                      <input
                        type="text"
                        class="cfg-input cfg-input--sm"
                        .value=${key}
                        @change=${(event: Event) => {
                          const nextKey = (event.target as HTMLInputElement).value.trim();
                          if (!nextKey || nextKey === key || nextKey in record) {
                            return;
                          }
                          const next = { ...record };
                          next[nextKey] = next[key];
                          delete next[key];
                          onSet(next);
                        }}
                      />
                    </div>

                    <div class="cfg-map__item-value">
                      ${valueKind === "boolean"
                        ? html`
                            <label class="cfg-toggle-row builder-toggle-row">
                              <span class="cfg-field__help">boolean</span>
                              <div class="cfg-toggle">
                                <input
                                  type="checkbox"
                                  .checked=${entryValue === true}
                                  @change=${(event: Event) => {
                                    const next = { ...record };
                                    next[key] = (event.target as HTMLInputElement).checked;
                                    onSet(next);
                                  }}
                                />
                                <span class="cfg-toggle__track"></span>
                              </div>
                            </label>
                          `
                        : html`
                            <input
                              class="cfg-input cfg-input--sm"
                              type=${valueKind === "number" || valueKind === "integer" ? "number" : "text"}
                              .value=${entryValue == null ? "" : String(entryValue)}
                              @input=${(event: Event) => {
                                const raw = (event.target as HTMLInputElement).value;
                                const next = { ...record };
                                try {
                                  next[key] = raw.trim() === "" ? defaultValueForKind(valueKind) : parseScalar(valueKind, raw);
                                  onSet(next);
                                } catch (error) {
                                  onValidationError?.(
                                    error instanceof Error ? error.message : String(error),
                                  );
                                }
                              }}
                            />
                          `}
                    </div>

                    <button
                      type="button"
                      class="cfg-map__item-remove"
                      title="Remove entry"
                      @click=${() => {
                        const next = { ...record };
                        delete next[key];
                        onSet(next);
                      }}
                    >
                      ×
                    </button>
                  </div>
                `,
              )}
            </div>
          `}
    </div>
  `;
}

function renderJsonControl(params: {
  field: ExplorerField;
  value: unknown;
  onSet: (value: unknown) => void;
  onValidationError?: (message: string) => void;
}): TemplateResult {
  const { field, value, onSet, onValidationError } = params;
  return html`
    <label class="cfg-field">
      <span class="cfg-field__help">Edit as JSON (${field.kind})</span>
      <textarea
        class="cfg-textarea"
        rows="4"
        .value=${jsonValue(value ?? (field.kind === "array" ? [] : {}))}
        @change=${(event: Event) => {
          const raw = (event.target as HTMLTextAreaElement).value.trim();
          if (!raw) {
            onSet(field.kind === "array" ? [] : {});
            return;
          }
          try {
            onSet(JSON.parse(raw));
          } catch {
            onValidationError?.("Invalid JSON value.");
            (event.target as HTMLTextAreaElement).value = jsonValue(
              value ?? (field.kind === "array" ? [] : {}),
            );
          }
        }}
      ></textarea>
    </label>
  `;
}

export function renderFieldEditor(params: FieldRendererParams): TemplateResult | typeof nothing {
  const { field, value, onSet, onClear, onValidationError } = params;

  if (!field.editable) {
    return html`<div class="cfg-field__help">Read-only in this phase.</div>`;
  }

  if (
    field.kind === "string" ||
    field.kind === "number" ||
    field.kind === "integer" ||
    field.kind === "boolean" ||
    field.kind === "enum"
  ) {
    return renderScalarControl({ field, value, onSet, onClear, onValidationError });
  }

  if (field.kind === "array") {
    return renderPrimitiveArray({ field, value, onSet, onValidationError });
  }

  if (field.kind === "object") {
    return renderRecordObject({ field, value, onSet, onValidationError });
  }

  return html`<div class="cfg-field__help">Unsupported schema node.</div>`;
}
