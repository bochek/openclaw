import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitForWebLogin } from "../login-qr-api.js";
import { createWhatsAppLoginTool } from "./agent-tools-login.js";

vi.mock("../login-qr-api.js", () => ({
  startWebLoginWithQr: vi.fn(),
  waitForWebLogin: vi.fn(),
}));

const waitForWebLoginMock = vi.mocked(waitForWebLogin);

describe("createWhatsAppLoginTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-emits refreshed QR images during wait actions", async () => {
    waitForWebLoginMock.mockResolvedValueOnce({
      connected: false,
      message: "QR refreshed. Scan the latest code in WhatsApp → Linked Devices.",
      qrDataUrl: "data:image/png;base64,next-qr",
    });

    const tool = createWhatsAppLoginTool();
    const result = await tool.execute("tool-call-1", {
      action: "wait",
      timeoutMs: 5000,
    });

    expect(waitForWebLoginMock).toHaveBeenCalledWith({ timeoutMs: 5000 });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: [
            "QR refreshed. Scan the latest code in WhatsApp → Linked Devices.",
            "",
            "Open WhatsApp → Linked Devices and scan:",
            "",
            "![whatsapp-qr](data:image/png;base64,next-qr)",
          ].join("\n"),
        },
      ],
      details: {
        connected: false,
        qr: true,
      },
    });
  });
});
