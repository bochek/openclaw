import { LitElement, html, nothing } from "lit";
import {
  buildExplorerSnapshot,
  type ExplorerField,
  type ExplorerSection,
  type ExplorerSnapshot,
} from "../lib/schema-spike.ts";

type AppState =
  | { status: "loading" }
  | { status: "ready"; snapshot: ExplorerSnapshot }
  | { status: "error"; message: string };

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
  private selectedSectionId: string | null = null;
  private searchQuery = "";

  override createRenderRoot() {
    // Match the existing OpenClaw web UI approach (global CSS classes/tokens).
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.bootstrap();
  }

  private bootstrap(): void {
    try {
      const snapshot = buildExplorerSnapshot();
      this.state = { status: "ready", snapshot };
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.state = { status: "error", message };
    }
    this.requestUpdate();
  }

  private setSection(sectionId: string | null): void {
    this.selectedSectionId = sectionId;
    this.requestUpdate();
  }

  private setSearchQuery(raw: string): void {
    this.searchQuery = raw.trim().toLowerCase();
    this.requestUpdate();
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
            <div class="config-sidebar__title">Config Builder</div>
            <div class="builder-subtitle">Explorer scaffold</div>
          </div>
          <span class="pill pill--sm pill--ok">ready</span>
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
              </button>
            `,
          )}
        </nav>

        <div class="config-sidebar__footer">
          <div class="builder-footer-note">
            Read-only schema explorer using OpenClaw config hints.
          </div>
        </div>
      </aside>
    `;
  }

  private renderField(field: ExplorerField) {
    return html`
      <div class="cfg-field builder-field">
        <div class="builder-field__head">
          <div class="cfg-field__label">${field.label}</div>
          <div class="builder-field__badges">
            ${field.sensitive ? html`<span class="pill pill--sm pill--danger">sensitive</span>` : nothing}
            ${field.advanced ? html`<span class="pill pill--sm">advanced</span>` : nothing}
          </div>
        </div>
        <div class="builder-field__path mono">${field.path}</div>
        ${field.help ? html`<div class="cfg-field__help">${field.help}</div>` : nothing}
      </div>
    `;
  }

  private renderSections(visibleSections: ExplorerSection[]) {
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
                    ${section.description ? html`<br />${section.description}` : nothing}
                  </div>
                </div>
              </div>

              <div class="config-section-card__content">
                <div class="cfg-fields">${section.fields.map((field) => this.renderField(field))}</div>
              </div>
            </section>
          `,
        )}
      </div>
    `;
  }

  override render() {
    if (this.state.status === "loading") {
      return html`<div class="builder-screen"><div class="card">Loading schema explorer…</div></div>`;
    }

    if (this.state.status === "error") {
      return html`<div class="builder-screen"><pre class="callout danger">${this.state.message}</pre></div>`;
    }

    const { snapshot } = this.state;
    const visibleSections = this.getVisibleSections(snapshot);

    return html`
      <div class="builder-screen">
        <div class="config-layout builder-layout">
          ${this.renderSidebar(snapshot)}

          <main class="config-main">
            <div class="config-actions">
              <div class="config-actions__left">
                <span class="config-status">Schema explorer (read-only)</span>
              </div>
              <div class="config-actions__right">
                <span class="pill pill--sm">sections: ${snapshot.sectionCount}</span>
                <span class="pill pill--sm">fields: ${snapshot.fieldCount}</span>
                <span class="pill pill--sm mono">v${snapshot.version}</span>
              </div>
            </div>

            <div class="config-content">
              ${this.searchQuery
                ? html`<div class="builder-search-state">Search: <span class="mono">${this.searchQuery}</span></div>`
                : nothing}

              ${this.renderSections(visibleSections)}
            </div>
          </main>
        </div>
      </div>
    `;
  }
}

customElements.define("config-builder-app", ConfigBuilderApp);
