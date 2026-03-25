import { describe, expect, it } from "vitest";
import { formatCliCommand } from "../cli/command-format.js";
import {
  isSystemdUnavailableDetail,
  isSystemdUserBusUnavailableDetail,
  renderSystemdUnavailableHints,
} from "./systemd-hints.js";

describe("isSystemdUnavailableDetail", () => {
  it("matches systemd unavailable error details", () => {
    expect(
      isSystemdUnavailableDetail("systemctl --user unavailable: Failed to connect to bus"),
    ).toBe(true);
    expect(
      isSystemdUnavailableDetail(
        "systemctl not available; systemd user services are required on Linux.",
      ),
    ).toBe(true);
    expect(isSystemdUnavailableDetail("permission denied")).toBe(false);
  });
});

describe("renderSystemdUnavailableHints", () => {
  it("matches systemd user bus/session failures that need headless recovery hints", () => {
    expect(
      isSystemdUserBusUnavailableDetail(
        "systemctl --user unavailable: Failed to connect to bus: No medium found",
      ),
    ).toBe(true);
    expect(
      isSystemdUserBusUnavailableDetail(
        "Failed to connect to user scope bus via local transport: $DBUS_SESSION_BUS_ADDRESS and $XDG_RUNTIME_DIR not defined",
      ),
    ).toBe(true);
    expect(
      isSystemdUserBusUnavailableDetail(
        "systemctl not available; systemd user services are required on Linux.",
      ),
    ).toBe(false);
  });

  it("renders WSL2-specific recovery hints", () => {
    expect(renderSystemdUnavailableHints({ wsl: true })).toEqual([
      "WSL2 needs systemd enabled: edit /etc/wsl.conf with [boot]\\nsystemd=true",
      "Then run: wsl --shutdown (from PowerShell) and reopen your distro.",
      "Verify: systemctl --user status",
    ]);
  });

  it("renders generic Linux recovery hints outside WSL", () => {
    expect(renderSystemdUnavailableHints()).toEqual([
      "systemd user services are unavailable; install/enable systemd or run the gateway under your supervisor.",
      `If you're in a container, run the gateway in the foreground instead of \`${formatCliCommand("openclaw gateway")}\`.`,
    ]);
  });

  it("adds headless recovery hints only for user bus/session failures", () => {
    expect(
      renderSystemdUnavailableHints({
        detail: "systemctl --user unavailable: Failed to connect to bus: No medium found",
      }),
    ).toEqual([
      "systemd user services are unavailable; install/enable systemd or run the gateway under your supervisor.",
      "On a headless server (SSH/no desktop session): run `sudo loginctl enable-linger $(whoami)` to persist your systemd user session across logins.",
      "Also ensure XDG_RUNTIME_DIR is set: `export XDG_RUNTIME_DIR=/run/user/$(id -u)`, then retry.",
      `If you're in a container, run the gateway in the foreground instead of \`${formatCliCommand("openclaw gateway")}\`.`,
    ]);
  });

  it("skips headless recovery hints when container context is known", () => {
    expect(
      renderSystemdUnavailableHints({
        detail: "systemctl --user unavailable: Failed to connect to bus: No medium found",
        container: true,
      }),
    ).toEqual([
      "systemd user services are unavailable; install/enable systemd or run the gateway under your supervisor.",
      `If you're in a container, run the gateway in the foreground instead of \`${formatCliCommand("openclaw gateway")}\`.`,
    ]);
  });
});
