let qrCodeTuiRuntimePromise: Promise<typeof import("@vincentkoc/qrcode-tui")> | null = null;

async function loadQrCodeTuiRuntime() {
  if (!qrCodeTuiRuntimePromise) {
    qrCodeTuiRuntimePromise = import("@vincentkoc/qrcode-tui");
  }
  return await qrCodeTuiRuntimePromise;
}

export async function renderQrTerminal(
  input: string,
  opts: { small?: boolean } = {},
): Promise<string> {
  const { renderTerminal } = await loadQrCodeTuiRuntime();
  return await renderTerminal(input, {
    small: opts.small ?? true,
  });
}
