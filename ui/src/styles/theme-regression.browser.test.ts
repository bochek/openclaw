import { afterEach, describe, expect, it } from "vitest";
import "../styles.css";

type ThemeCase = {
  readonly id: string;
  readonly theme: string;
  readonly mode: "light" | "dark";
};

const THEMES: readonly ThemeCase[] = [
  { id: "claw-dark", theme: "dark", mode: "dark" },
  { id: "claw-light", theme: "light", mode: "light" },
  { id: "knot-dark", theme: "openknot", mode: "dark" },
  { id: "knot-light", theme: "openknot-light", mode: "light" },
  { id: "dash-dark", theme: "dash", mode: "dark" },
  { id: "dash-light", theme: "dash-light", mode: "light" },
];

function renderThemeFixture(themeCase: ThemeCase): HTMLElement {
  document.documentElement.setAttribute("data-theme", themeCase.theme);
  document.documentElement.setAttribute("data-theme-mode", themeCase.mode);
  document.body.innerHTML = "";
  document.body.style.margin = "0";
  document.body.style.padding = "24px";
  document.body.style.background = "var(--bg)";

  const fixture = document.createElement("section");
  fixture.setAttribute("data-testid", "theme-fixture");
  fixture.style.width = "840px";
  fixture.style.padding = "28px";
  fixture.style.border = "1px solid var(--border)";
  fixture.style.borderRadius = "20px";
  fixture.style.background = "linear-gradient(180deg, var(--bg) 0%, var(--bg-accent) 100%)";
  fixture.style.boxShadow = "var(--shadow-lg)";
  fixture.style.fontFamily = "ui-sans-serif, system-ui, sans-serif";
  fixture.style.color = "var(--text)";

  fixture.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;">
      <div>
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">
          ${themeCase.id}
        </div>
        <h2 style="margin:8px 0 0;font-size:32px;line-height:1;color:var(--text-strong);">
          Theme Review
        </h2>
      </div>
      <div style="display:flex;gap:10px;">
        <button style="border:none;border-radius:999px;padding:10px 16px;background:var(--primary);color:var(--primary-foreground);font:600 14px/1 ui-sans-serif,system-ui,sans-serif;">
          Primary
        </button>
        <button style="border:1px solid var(--border-strong);border-radius:999px;padding:10px 16px;background:var(--secondary);color:var(--secondary-foreground);font:600 14px/1 ui-sans-serif,system-ui,sans-serif;">
          Secondary
        </button>
      </div>
    </div>

    <div style="margin-top:22px;display:grid;grid-template-columns:1.3fr .9fr;gap:18px;">
      <article style="padding:18px;border-radius:18px;background:var(--card);color:var(--card-foreground);border:1px solid var(--border);box-shadow:var(--shadow-sm);">
        <div style="font-size:13px;color:var(--muted);">Assistant</div>
        <p style="margin:10px 0 0;font-size:15px;line-height:1.55;">
          Accent text <span style="color:var(--accent);font-weight:700;">stays legible</span>,
          while semantic colors remain readable against the active surface.
        </p>
        <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;">
          <span style="padding:6px 10px;border-radius:999px;background:var(--accent-subtle);color:var(--accent);font-size:12px;font-weight:700;">Accent</span>
          <span style="padding:6px 10px;border-radius:999px;background:var(--ok-subtle);color:var(--ok);font-size:12px;font-weight:700;">OK</span>
          <span style="padding:6px 10px;border-radius:999px;background:var(--warn-subtle);color:var(--warn);font-size:12px;font-weight:700;">Warn</span>
          <span style="padding:6px 10px;border-radius:999px;background:var(--danger-subtle);color:var(--danger);font-size:12px;font-weight:700;">Danger</span>
        </div>
      </article>

      <aside style="padding:18px;border-radius:18px;background:var(--panel-strong);border:1px solid var(--border);">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">
          Status
        </div>
        <div style="margin-top:14px;display:grid;gap:12px;">
          <div style="padding:12px 14px;border-radius:14px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);">
            <strong style="display:block;color:var(--text-strong);">Info</strong>
            <span style="color:var(--info);">Connected to gateway.</span>
          </div>
          <div style="padding:12px 14px;border-radius:14px;background:var(--bg-elevated);border:1px solid var(--border);color:var(--text);">
            <strong style="display:block;color:var(--text-strong);">Muted copy</strong>
            <span style="color:var(--muted);">Subdued text still clears contrast.</span>
          </div>
        </div>
      </aside>
    </div>
  `;

  document.body.append(fixture);
  return fixture;
}

describe("theme visual regression", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-mode");
  });

  for (const themeCase of THEMES) {
    it(`renders ${themeCase.id} consistently`, async () => {
      const fixture = renderThemeFixture(themeCase);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await expect.element(fixture).toMatchScreenshot(`${themeCase.id}.png`, {
        comparatorOptions: {
          threshold: 0.12,
        },
      });
    });
  }
});
