import { LitElement, css, html } from "lit";
import { runSchemaSpike, type SchemaSpikeSummary } from "../lib/schema-spike.ts";

type AppState =
  | { status: "loading" }
  | { status: "ready"; summary: SchemaSpikeSummary }
  | { status: "error"; message: string };

class ConfigBuilderApp extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: #09090b;
      color: #fafafa;
    }

    .shell {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .title {
      font-size: 1.4rem;
      font-weight: 700;
      margin: 0;
    }

    .subtitle {
      margin-top: 10px;
      color: #a1a1aa;
      font-size: 0.95rem;
    }

    .card {
      margin-top: 20px;
      border: 1px solid #27272a;
      border-radius: 12px;
      background: #18181b;
      padding: 18px;
    }

    .row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #27272a;
      font-size: 0.92rem;
    }

    .row:last-child {
      border-bottom: none;
    }

    .label {
      color: #a1a1aa;
    }

    .value {
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
        monospace;
      text-align: right;
      color: #fafafa;
    }

    .ok {
      color: #4ade80;
    }

    .error {
      color: #f87171;
      white-space: pre-wrap;
      font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
        monospace;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    .hint {
      margin-top: 16px;
      color: #71717a;
      font-size: 0.85rem;
    }
  `;

  private state: AppState = { status: "loading" };

  override connectedCallback(): void {
    super.connectedCallback();
    this.bootstrap();
  }

  private bootstrap(): void {
    try {
      const summary = runSchemaSpike();
      this.state = { status: "ready", summary };
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      this.state = { status: "error", message };
    }
    this.requestUpdate();
  }

  override render() {
    return html`<main class="shell">
      <h1 class="title">OpenClaw Config Builder</h1>
      <div class="subtitle">Phase 0 spike: schema imports + browser runtime checks.</div>

      ${this.renderBody()}

      <div class="hint">
        Next: replace this spike page with Explorer read-only group rendering.
      </div>
    </main>`;
  }

  private renderBody() {
    if (this.state.status === "loading") {
      return html`<section class="card">Loading schema spike…</section>`;
    }

    if (this.state.status === "error") {
      return html`<section class="card">
        <div class="row">
          <span class="label">Schema import status</span>
          <span class="value error">failed</span>
        </div>
        <pre class="error">${this.state.message}</pre>
      </section>`;
    }

    const { summary } = this.state;
    return html`<section class="card">
      <div class="row">
        <span class="label">Schema import status</span>
        <span class="value ok">ok</span>
      </div>
      <div class="row">
        <span class="label">Top-level schema sections</span>
        <span class="value">${summary.schemaRootProperties}</span>
      </div>
      <div class="row">
        <span class="label">UI hint entries</span>
        <span class="value">${summary.uiHintCount}</span>
      </div>
      <div class="row">
        <span class="label">Schema version</span>
        <span class="value">${summary.version}</span>
      </div>
      <div class="row">
        <span class="label">Generated at</span>
        <span class="value">${summary.generatedAt}</span>
      </div>
      <div class="row">
        <span class="label">Sample sections</span>
        <span class="value">${summary.schemaTopSections.join(", ") || "(none)"}</span>
      </div>
    </section>`;
  }
}

customElements.define("config-builder-app", ConfigBuilderApp);
