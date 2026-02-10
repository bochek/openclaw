import { LitElement, css, html, nothing } from "lit";
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

class ConfigBuilderApp extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: #09090b;
      color: #fafafa;
      font-family: Inter, "Segoe UI", Roboto, sans-serif;
    }

    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
    }

    .sidebar {
      border-right: 1px solid #27272a;
      background: #09090b;
      padding: 16px;
      position: sticky;
      top: 0;
      max-height: 100vh;
      overflow-y: auto;
    }

    .brand {
      font-size: 0.98rem;
      font-weight: 700;
      margin: 0;
    }

    .sub {
      margin-top: 6px;
      color: #a1a1aa;
      font-size: 0.82rem;
      line-height: 1.4;
    }

    .search {
      margin-top: 16px;
      width: 100%;
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 8px;
      color: #fafafa;
      font-size: 0.86rem;
      padding: 10px 12px;
    }

    .search:focus-visible {
      outline: 2px solid #ff5a36;
      outline-offset: 1px;
      border-color: #ff5a36;
    }

    .nav {
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .nav-btn {
      width: 100%;
      border: 1px solid #27272a;
      background: #18181b;
      color: #a1a1aa;
      border-radius: 8px;
      text-align: left;
      font-size: 0.82rem;
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
    }

    .nav-btn:hover {
      color: #fafafa;
      border-color: #3f3f46;
    }

    .nav-btn.active {
      color: #ff5a36;
      border-color: #ff5a36;
      background: rgba(255, 90, 54, 0.08);
    }

    .count {
      color: #71717a;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
        monospace;
      font-size: 0.75rem;
    }

    .main {
      padding: 20px;
    }

    .hero {
      border: 1px solid #27272a;
      background: #18181b;
      border-radius: 12px;
      padding: 16px;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }

    .hero-item {
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 10px;
      background: #0f0f12;
    }

    .hero-label {
      color: #71717a;
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .hero-value {
      margin-top: 6px;
      font-size: 0.9rem;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
        monospace;
      word-break: break-word;
    }

    .sections {
      margin-top: 18px;
      display: grid;
      gap: 14px;
    }

    .section-card {
      border: 1px solid #27272a;
      border-radius: 12px;
      background: #18181b;
      overflow: hidden;
    }

    .section-header {
      border-bottom: 1px solid #27272a;
      padding: 14px;
      background: #111114;
    }

    .section-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
    }

    .section-meta {
      margin-top: 6px;
      color: #a1a1aa;
      font-size: 0.82rem;
      line-height: 1.4;
    }

    .field-list {
      padding: 6px 10px 10px;
      display: grid;
      gap: 8px;
    }

    .field {
      border: 1px solid #27272a;
      border-radius: 10px;
      padding: 10px;
      background: #121216;
    }

    .field-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .field-label {
      font-size: 0.86rem;
      font-weight: 600;
      color: #fafafa;
    }

    .badges {
      display: inline-flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .badge {
      border: 1px solid #3f3f46;
      border-radius: 999px;
      padding: 2px 7px;
      font-size: 0.68rem;
      color: #a1a1aa;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .badge.sensitive {
      color: #fb7185;
      border-color: #fb7185;
    }

    .badge.advanced {
      color: #fbbf24;
      border-color: #fbbf24;
    }

    .field-path {
      margin-top: 6px;
      font-size: 0.75rem;
      color: #71717a;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
        monospace;
      word-break: break-word;
    }

    .field-help {
      margin-top: 6px;
      color: #a1a1aa;
      font-size: 0.78rem;
      line-height: 1.4;
    }

    .empty,
    .error,
    .loading {
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 16px;
      background: #18181b;
      margin-top: 18px;
      color: #a1a1aa;
    }

    .error {
      color: #f87171;
      white-space: pre-wrap;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
        monospace;
      font-size: 0.8rem;
    }

    @media (max-width: 980px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .sidebar {
        position: static;
        max-height: none;
        border-right: none;
        border-bottom: 1px solid #27272a;
      }

      .hero {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  private state: AppState = { status: "loading" };
  private selectedSectionId: string | null = null;
  private searchQuery = "";

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

  override render() {
    if (this.state.status === "loading") {
      return html`<main class="main"><div class="loading">Loading schema explorer…</div></main>`;
    }

    if (this.state.status === "error") {
      return html`<main class="main"><pre class="error">${this.state.message}</pre></main>`;
    }

    const { snapshot } = this.state;
    const visibleSections = this.getVisibleSections(snapshot);

    return html`
      <div class="shell">
        <aside class="sidebar">
          <h1 class="brand">OpenClaw Config Builder</h1>
          <div class="sub">Explorer read-only scaffold (Phase 1)</div>

          <input
            class="search"
            type="text"
            placeholder="Search fields, labels, help…"
            @input=${(event: Event) =>
              this.setSearchQuery((event.target as HTMLInputElement).value)}
          />

          <nav class="nav">
            <button
              class="nav-btn ${this.selectedSectionId === null ? "active" : ""}"
              @click=${() => this.setSection(null)}
            >
              <span>All sections</span>
              <span class="count">${snapshot.fieldCount}</span>
            </button>
            ${snapshot.sections.map(
              (section) => html`
                <button
                  class="nav-btn ${this.selectedSectionId === section.id ? "active" : ""}"
                  @click=${() => this.setSection(section.id)}
                >
                  <span>${section.label}</span>
                  <span class="count">${section.fields.length}</span>
                </button>
              `,
            )}
          </nav>
        </aside>

        <main class="main">
          <section class="hero">
            <div class="hero-item">
              <div class="hero-label">Schema status</div>
              <div class="hero-value">ready</div>
            </div>
            <div class="hero-item">
              <div class="hero-label">Sections</div>
              <div class="hero-value">${snapshot.sectionCount}</div>
            </div>
            <div class="hero-item">
              <div class="hero-label">Field hints</div>
              <div class="hero-value">${snapshot.fieldCount}</div>
            </div>
            <div class="hero-item">
              <div class="hero-label">Version</div>
              <div class="hero-value">${snapshot.version}</div>
            </div>
          </section>

          ${this.searchQuery
            ? html`<div class="sub" style="margin-top: 12px;">
                Search: <code>${this.searchQuery}</code>
              </div>`
            : nothing}

          ${visibleSections.length === 0
            ? html`<div class="empty">No matching sections/fields for this filter.</div>`
            : html`
                <div class="sections">
                  ${visibleSections.map(
                    (section) => html`
                      <section class="section-card">
                        <header class="section-header">
                          <h2 class="section-title">${section.label}</h2>
                          <div class="section-meta">
                            <strong>${section.id}</strong>
                            · ${section.fields.length} field hint${
                              section.fields.length === 1 ? "" : "s"
                            }
                            ${section.description ? html`<br />${section.description}` : nothing}
                          </div>
                        </header>

                        <div class="field-list">
                          ${section.fields.map(
                            (field) => html`
                              <article class="field">
                                <div class="field-head">
                                  <div class="field-label">${field.label}</div>
                                  <div class="badges">
                                    ${field.sensitive
                                      ? html`<span class="badge sensitive">sensitive</span>`
                                      : nothing}
                                    ${field.advanced
                                      ? html`<span class="badge advanced">advanced</span>`
                                      : nothing}
                                  </div>
                                </div>
                                <div class="field-path">${field.path}</div>
                                ${field.help
                                  ? html`<div class="field-help">${field.help}</div>`
                                  : nothing}
                              </article>
                            `,
                          )}
                        </div>
                      </section>
                    `,
                  )}
                </div>
              `}
        </main>
      </div>
    `;
  }
}

customElements.define("config-builder-app", ConfigBuilderApp);
