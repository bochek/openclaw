import { LitElement, html, nothing } from "lit";
import {
  clearFieldValue,
  getFieldValue,
  loadPersistedDraft,
  persistDraft,
  resetDraft,
  setFieldValue,
  type ConfigDraft,
} from "../lib/config-store.ts";
import { downloadJson5File, formatConfigJson5 } from "../lib/json5-format.ts";
import {
  buildExplorerSnapshot,
  type ExplorerField,
  type ExplorerSection,
  type ExplorerSnapshot,
} from "../lib/schema-spike.ts";
import { validateConfigDraft, type ValidationResult } from "../lib/validation.ts";
import { modeToHash, parseModeFromHash, type ConfigBuilderMode } from "./navigation.ts";
import { renderFieldEditor } from "./components/field-renderer.ts";
import { WIZARD_STEPS, wizardStepByIndex, wizardStepFields } from "./wizard.ts";

type AppState =
  | { status: "loading" }
  | { status: "ready"; snapshot: ExplorerSnapshot }
  | { status: "error"; message: string };

type CopyState = "idle" | "copied" | "failed";

function includesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function matchesField(field: ExplorerField, query: string): boolean {
  if (!query) {
    return true;
  }
  return (
    includesQuery(field.path, query) ||
    includesQuery(field.label, query) ||
    includesQuery(field.help, query)
  );
}

function matchesSection(section: ExplorerSection, query: string): boolean {
  if (!query) {
    return true;
  }
  return (
    includesQuery(section.id, query) ||
    includesQuery(section.label, query) ||
    includesQuery(section.description, query)
  );
}

function sectionGlyph(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "•";
}

class ConfigBuilderApp extends LitElement {
  private state: AppState = { status: "loading" };
  private mode: ConfigBuilderMode = "landing";
  private config: ConfigDraft = {};
  private validation: ValidationResult = validateConfigDraft({});
  private selectedSectionId: string | null = null;
  private searchQuery = "";
  private fieldErrors: Record<string, string> = {};
  private wizardStepIndex = 0;
  private previewOpenMobile = false;
  private copyState: CopyState = "idle";
  private copyResetTimer: number | null = null;

  private readonly hashChangeHandler = () => this.handleHashChange();

  override createRenderRoot() {
    // Match the existing OpenClaw web UI approach (global CSS classes/tokens).
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.bootstrap();
    window.addEventListener("hashchange", this.hashChangeHandler);
  }

  override disconnectedCallback(): void {
    window.removeEventListener("hashchange", this.hashChangeHandler);
    if (this.copyResetTimer != null) {
      window.clearTimeout(this.copyResetTimer);
      this.copyResetTimer = null;
    }
    super.disconnectedCallback();
  }

  private bootstrap(): void {
    try {
      this.mode = parseModeFromHash(window.location.hash);
      this.config = loadPersistedDraft();
      this.validation = validateConfigDraft(this.config);
      const snapshot = buildExplorerSnapshot();
      this.state = { status: "ready", snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.state = { status: "error", message };
    }
    this.requestUpdate();
  }

  private handleHashChange(): void {
    const next = parseModeFromHash(window.location.hash);
    if (next === this.mode) {
      return;
    }
    this.mode = next;
    if (next !== "wizard") {
      this.wizardStepIndex = 0;
    }
    this.requestUpdate();
  }

  private navigateMode(mode: ConfigBuilderMode): void {
    if (mode !== this.mode) {
      this.mode = mode;
      this.requestUpdate();
    }
    const hash = modeToHash(mode);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    if (mode === "wizard") {
      this.focusWizardStep();
    }
  }

  private setSection(sectionId: string | null): void {
    this.selectedSectionId = sectionId;
    this.requestUpdate();
  }

  private setSearchQuery(raw: string): void {
    this.searchQuery = raw.trim().toLowerCase();
    this.requestUpdate();
  }

  private saveConfig(next: ConfigDraft): void {
    this.config = next;
    this.validation = validateConfigDraft(next);
    persistDraft(next);
    this.requestUpdate();
  }

  private setFieldError(path: string, message: string): void {
    this.fieldErrors = {
      ...this.fieldErrors,
      [path]: message,
    };
    this.requestUpdate();
  }

  private clearFieldError(path: string): void {
    if (!(path in this.fieldErrors)) {
      return;
    }
    const next = { ...this.fieldErrors };
    delete next[path];
    this.fieldErrors = next;
  }

  private clearField(path: string): void {
    this.clearFieldError(path);
    this.saveConfig(clearFieldValue(this.config, path));
  }

  private setField(path: string, value: unknown): void {
    this.clearFieldError(path);
    this.saveConfig(setFieldValue(this.config, path, value));
  }

  private resetAllFields(): void {
    this.fieldErrors = {};
    this.saveConfig(resetDraft());
  }

  private sectionErrorCount(sectionId: string): number {
    return this.validation.sectionErrorCounts[sectionId] ?? 0;
  }

  private totalErrorCount(): number {
    return this.validation.issues.length;
  }

  private async copyPreview(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copyState = "copied";
    } catch {
      this.copyState = "failed";
    }

    if (this.copyResetTimer != null) {
      window.clearTimeout(this.copyResetTimer);
    }

    this.copyResetTimer = window.setTimeout(() => {
      this.copyState = "idle";
      this.copyResetTimer = null;
      this.requestUpdate();
    }, 1500);

    this.requestUpdate();
  }

  private setWizardStep(index: number): void {
    const clamped = Math.max(0, Math.min(WIZARD_STEPS.length - 1, index));
    if (clamped === this.wizardStepIndex) {
      return;
    }
    this.wizardStepIndex = clamped;
    this.requestUpdate();
    this.focusWizardStep();
  }

  private focusWizardStep(): void {
    window.setTimeout(() => {
      const root = document.querySelector(".builder-wizard");
      const target = root?.querySelector<HTMLElement>("input, select, textarea, button");
      target?.focus();
    }, 0);
  }

  private getVisibleSections(snapshot: ExplorerSnapshot): ExplorerSection[] {
    const bySection = this.selectedSectionId
      ? snapshot.sections.filter((section) => section.id === this.selectedSectionId)
      : snapshot.sections;

    const query = this.searchQuery;
    if (!query) {
      return bySection;
    }

    const visible: ExplorerSection[] = [];
    for (const section of bySection) {
      if (matchesSection(section, query)) {
        visible.push(section);
        continue;
      }
      const fields = section.fields.filter((field) => matchesField(field, query));
      if (fields.length === 0) {
        continue;
      }
      visible.push({ ...section, fields });
    }

    return visible;
  }

  private sensitiveFieldsWithValues(snapshot: ExplorerSnapshot): string[] {
    const paths: string[] = [];
    for (const section of snapshot.sections) {
      for (const field of section.fields) {
        if (!field.sensitive) {
          continue;
        }
        if (getFieldValue(this.config, field.path) === undefined) {
          continue;
        }
        paths.push(field.path);
      }
    }
    return paths;
  }

  private renderTopbar() {
    const modeButton = (mode: ConfigBuilderMode, label: string) => html`
      <button
        class="builder-mode-toggle__btn ${this.mode === mode ? "active" : ""}"
        @click=${() => this.navigateMode(mode)}
      >
        ${label}
      </button>
    `;

    return html`
      <header class="builder-topbar">
        <div class="builder-brand">
          <div class="builder-brand__title">OpenClaw Config Builder</div>
          <div class="builder-brand__subtitle">Wizard + Explorer</div>
        </div>

        <div class="builder-mode-toggle" role="tablist" aria-label="Builder mode">
          ${modeButton("landing", "Home")}
          ${modeButton("explorer", "Explorer")}
          ${modeButton("wizard", "Wizard")}
        </div>

        <a
          class="btn btn--sm"
          href="https://docs.openclaw.ai/configuration"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </a>
      </header>
    `;
  }

  private renderSearch() {
    return html`
      <div class="config-search">
        <svg
          class="config-search__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <path d="M21 21l-4.35-4.35"></path>
        </svg>
        <input
          class="config-search__input"
          type="text"
          placeholder="Search fields, labels, help…"
          @input=${(event: Event) => this.setSearchQuery((event.target as HTMLInputElement).value)}
        />
        ${this.searchQuery
          ? html`
              <button
                class="config-search__clear"
                title="Clear search"
                @click=${() => this.setSearchQuery("")}
              >
                ×
              </button>
            `
          : nothing}
      </div>
    `;
  }

  private renderSidebar(snapshot: ExplorerSnapshot) {
    return html`
      <aside class="config-sidebar">
        <div class="config-sidebar__header">
          <div>
            <div class="config-sidebar__title">Explorer</div>
            <div class="builder-subtitle">Schema-backed field editor</div>
          </div>
          <span class="pill pill--sm ${this.validation.valid ? "pill--ok" : "pill--danger"}">
            ${this.validation.valid ? "valid" : "errors"}
          </span>
        </div>

        ${this.renderSearch()}

        <nav class="config-nav">
          <button
            class="config-nav__item ${this.selectedSectionId === null ? "active" : ""}"
            @click=${() => this.setSection(null)}
          >
            <span class="config-nav__icon builder-icon" aria-hidden="true">A</span>
            <span class="config-nav__label">All sections</span>
            <span class="builder-count mono">${snapshot.fieldCount}</span>
          </button>

          ${snapshot.sections.map(
            (section) => html`
              <button
                class="config-nav__item ${this.selectedSectionId === section.id ? "active" : ""}"
                @click=${() => this.setSection(section.id)}
              >
                <span class="config-nav__icon builder-icon" aria-hidden="true"
                  >${sectionGlyph(section.label)}</span
                >
                <span class="config-nav__label">${section.label}</span>
                <span class="builder-count mono">${section.fields.length}</span>
                ${this.sectionErrorCount(section.id) > 0
                  ? html`<span class="builder-error-count">${this.sectionErrorCount(section.id)}</span>`
                  : nothing}
              </button>
            `,
          )}
        </nav>

        <div class="config-sidebar__footer">
          <div class="builder-footer-note">
            Draft values persist to localStorage. Validation updates in real time.
          </div>
        </div>
      </aside>
    `;
  }

  private renderField(field: ExplorerField, context: "explorer" | "wizard") {
    const value = getFieldValue(this.config, field.path);
    const hasValue = value !== undefined;
    const localError = this.fieldErrors[field.path] ?? null;
    const schemaErrors = this.validation.issuesByPath[field.path] ?? [];

    return html`
      <div class="cfg-field builder-field ${hasValue ? "builder-field--set" : ""}">
        <div class="builder-field__head">
          <div class="cfg-field__label">${field.label}</div>
          <div class="builder-field__badges">
            ${hasValue ? html`<span class="pill pill--sm">set</span>` : nothing}
            ${field.sensitive ? html`<span class="pill pill--sm pill--danger">sensitive</span>` : nothing}
            ${field.advanced ? html`<span class="pill pill--sm">advanced</span>` : nothing}
            <span class="pill pill--sm mono">${field.kind}</span>
            ${field.kind === "array" && field.itemKind
              ? html`<span class="pill pill--sm mono">item:${field.itemKind}</span>`
              : nothing}
            ${field.kind === "object" && field.recordValueKind
              ? html`<span class="pill pill--sm mono">value:${field.recordValueKind}</span>`
              : nothing}
          </div>
        </div>

        <div class="builder-field__path mono">${field.path}</div>

        ${field.help ? html`<div class="cfg-field__help">${field.help}</div>` : nothing}

        <div class="builder-field__controls">
          ${renderFieldEditor({
            field,
            value,
            onSet: (nextValue: unknown) => this.setField(field.path, nextValue),
            onClear: () => this.clearField(field.path),
            onValidationError: (message: string) => this.setFieldError(field.path, message),
          })}
        </div>

        ${localError ? html`<div class="cfg-field__error">${localError}</div>` : nothing}
        ${schemaErrors.map((message) => html`<div class="cfg-field__error">${message}</div>`)}

        <div class="builder-field__actions">
          <button class="btn btn--sm" @click=${() => this.clearField(field.path)}>Clear</button>
          ${context === "wizard"
            ? html`<button class="btn btn--sm" @click=${() => this.navigateMode("explorer")}>Open in Explorer</button>`
            : nothing}
        </div>
      </div>
    `;
  }

  private renderValidationSummary() {
    if (this.validation.valid) {
      return nothing;
    }

    const sectionEntries = Object.entries(this.validation.sectionErrorCounts).toSorted((a, b) =>
      a[0].localeCompare(b[0]),
    );

    return html`
      <div class="callout danger builder-validation-summary" role="alert">
        <div class="builder-validation-summary__title">
          ${this.totalErrorCount()} validation error${this.totalErrorCount() === 1 ? "" : "s"}
        </div>
        <div class="builder-validation-summary__sections">
          ${sectionEntries.map(
            ([section, count]) => html`<span class="pill pill--sm">${section}: ${count}</span>`,
          )}
        </div>
        <ul class="builder-validation-summary__list">
          ${this.validation.issues.slice(0, 8).map(
            (issue) => html`<li><span class="mono">${issue.path || "(root)"}</span> — ${issue.message}</li>`,
          )}
        </ul>
      </div>
    `;
  }

  private renderExplorerSections(visibleSections: ExplorerSection[]) {
    if (visibleSections.length === 0) {
      return html`<div class="config-empty"><div class="config-empty__text">No matching sections/fields for this filter.</div></div>`;
    }

    return html`
      <div class="config-form config-form--modern">
        ${visibleSections.map(
          (section) => html`
            <section class="config-section-card" id=${`section-${section.id}`}>
              <div class="config-section-card__header">
                <div class="config-section-card__icon builder-section-glyph" aria-hidden="true">
                  ${sectionGlyph(section.label)}
                </div>
                <div class="config-section-card__titles">
                  <h2 class="config-section-card__title">${section.label}</h2>
                  <div class="config-section-card__desc">
                    <span class="mono">${section.id}</span>
                    · ${section.fields.length} field hint${section.fields.length === 1 ? "" : "s"}
                    ${this.sectionErrorCount(section.id) > 0
                      ? html` · <span class="builder-error-text">${this.sectionErrorCount(section.id)} errors</span>`
                      : nothing}
                    ${section.description ? html`<br />${section.description}` : nothing}
                  </div>
                </div>
              </div>

              <div class="config-section-card__content">
                <div class="cfg-fields">
                  ${section.fields.map((field) => this.renderField(field, "explorer"))}
                </div>
              </div>
            </section>
          `,
        )}
      </div>
    `;
  }

  private renderWizardView() {
    const step = wizardStepByIndex(this.wizardStepIndex);
    const fields = wizardStepFields(step);

    return html`
      <div class="builder-wizard">
        <div class="builder-wizard__progress" role="list">
          ${WIZARD_STEPS.map((entry, index) => {
            const state =
              index < this.wizardStepIndex ? "done" : index === this.wizardStepIndex ? "active" : "todo";
            return html`
              <button
                class="builder-wizard__step builder-wizard__step--${state}"
                @click=${() => this.setWizardStep(index)}
                role="listitem"
                aria-current=${index === this.wizardStepIndex ? "step" : "false"}
              >
                <span class="builder-wizard__step-index">${index + 1}</span>
                <span class="builder-wizard__step-label">${entry.label}</span>
              </button>
            `;
          })}
        </div>

        <section class="config-section-card">
          <div class="config-section-card__header">
            <div class="config-section-card__icon builder-section-glyph" aria-hidden="true">
              ${sectionGlyph(step.label)}
            </div>
            <div class="config-section-card__titles">
              <h2 class="config-section-card__title">${step.label}</h2>
              <div class="config-section-card__desc">${step.description}</div>
            </div>
          </div>

          <div class="config-section-card__content">
            <div class="cfg-fields">
              ${fields.map((field) => this.renderField(field, "wizard"))}
            </div>

            <div class="builder-wizard__actions">
              <button
                class="btn btn--sm"
                ?disabled=${this.wizardStepIndex === 0}
                @click=${() => this.setWizardStep(this.wizardStepIndex - 1)}
              >
                Back
              </button>

              <button
                class="btn btn--sm primary"
                @click=${() => {
                  if (this.wizardStepIndex >= WIZARD_STEPS.length - 1) {
                    this.navigateMode("explorer");
                    return;
                  }
                  this.setWizardStep(this.wizardStepIndex + 1);
                }}
              >
                ${this.wizardStepIndex >= WIZARD_STEPS.length - 1 ? "Finish" : "Continue"}
              </button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  private toggleMobilePreview(): void {
    this.previewOpenMobile = !this.previewOpenMobile;
    this.requestUpdate();
  }

  private renderPreview(snapshot: ExplorerSnapshot) {
    const preview = formatConfigJson5(this.config);
    const sensitivePaths = this.sensitiveFieldsWithValues(snapshot);

    return html`
      <aside class="builder-preview ${this.previewOpenMobile ? "mobile-open" : "mobile-collapsed"}">
        <div class="builder-preview__header">
          <div>
            <div class="builder-preview__title mono">openclaw.json</div>
            <div class="builder-preview__meta mono">${preview.lineCount} lines · ${preview.byteCount} B</div>
          </div>

          <button
            class="btn btn--sm builder-preview__mobile-toggle"
            @click=${() => this.toggleMobilePreview()}
            aria-expanded=${this.previewOpenMobile ? "true" : "false"}
          >
            ${this.previewOpenMobile ? "Hide" : "Show"} preview
          </button>
        </div>

        ${sensitivePaths.length > 0
          ? html`
              <div class="callout warn builder-sensitive-warning">
                Sensitive values included in output (${sensitivePaths.length}).
                <div class="mono builder-sensitive-warning__paths">${sensitivePaths.join(", ")}</div>
              </div>
            `
          : nothing}

        <pre class="builder-preview__code code-block">${preview.text}</pre>

        <div class="builder-preview__footer">
          <button class="btn btn--sm" @click=${() => this.copyPreview(preview.text)}>
            ${this.copyState === "copied"
              ? "Copied"
              : this.copyState === "failed"
                ? "Copy failed"
                : "Copy"}
          </button>
          <button class="btn btn--sm" @click=${() => downloadJson5File(preview.text)}>Download</button>
          <button class="btn btn--sm danger" @click=${() => this.resetAllFields()}>Reset all</button>
        </div>
      </aside>
    `;
  }

  private renderLanding() {
    return html`
      <div class="builder-landing">
        <section class="card builder-landing__card">
          <h2 class="card-title">Choose your setup flow</h2>
          <p class="card-sub">
            Start with the guided wizard for common setups, or use explorer for full schema control.
          </p>

          <div class="builder-landing__actions">
            <button class="btn primary" @click=${() => this.navigateMode("wizard")}>Start Wizard</button>
            <button class="btn" @click=${() => this.navigateMode("explorer")}>Open Explorer</button>
          </div>

          <div class="builder-landing__notes">
            <div class="pill pill--sm">7 curated wizard steps</div>
            <div class="pill pill--sm">Live JSON5 preview</div>
            <div class="pill pill--sm">Real-time schema validation</div>
          </div>
        </section>
      </div>
    `;
  }

  private renderWorkspace(snapshot: ExplorerSnapshot) {
    const explorerSections = this.getVisibleSections(snapshot);
    const layoutClass = this.mode === "wizard" ? "builder-layout builder-layout--wizard" : "builder-layout";

    return html`
      <div class="config-layout ${layoutClass}">
        ${this.mode === "explorer" ? this.renderSidebar(snapshot) : nothing}

        <main class="config-main">
          <div class="config-actions">
            <div class="config-actions__left">
              <span class="config-status">
                ${this.mode === "wizard"
                  ? `Wizard step ${this.wizardStepIndex + 1} of ${WIZARD_STEPS.length}`
                  : "Explorer mode"}
              </span>
            </div>
            <div class="config-actions__right">
              <span class="pill pill--sm">sections: ${snapshot.sectionCount}</span>
              <span class="pill pill--sm">fields: ${snapshot.fieldCount}</span>
              <span class="pill pill--sm mono">v${snapshot.version}</span>
              ${this.totalErrorCount() > 0
                ? html`<span class="pill pill--sm pill--danger">errors: ${this.totalErrorCount()}</span>`
                : html`<span class="pill pill--sm pill--ok">valid</span>`}
            </div>
          </div>

          <div class="config-content">
            ${this.renderValidationSummary()}

            ${this.mode === "explorer" && this.searchQuery
              ? html`<div class="builder-search-state">Search: <span class="mono">${this.searchQuery}</span></div>`
              : nothing}

            ${this.mode === "wizard"
              ? this.renderWizardView()
              : this.renderExplorerSections(explorerSections)}
          </div>
        </main>

        ${this.renderPreview(snapshot)}
      </div>
    `;
  }

  override render() {
    if (this.state.status === "loading") {
      return html`<div class="builder-screen"><div class="card">Loading config builder…</div></div>`;
    }

    if (this.state.status === "error") {
      return html`<div class="builder-screen"><pre class="callout danger">${this.state.message}</pre></div>`;
    }

    const { snapshot } = this.state;

    return html`
      <div class="builder-screen">
        ${this.renderTopbar()}
        ${this.mode === "landing" ? this.renderLanding() : this.renderWorkspace(snapshot)}
      </div>
    `;
  }
}

customElements.define("config-builder-app", ConfigBuilderApp);
