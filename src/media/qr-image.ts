let qrCodeTuiRuntimePromise: Promise<typeof import("@vincentkoc/qrcode-tui")> | null = null;

async function loadQrCodeTuiRuntime() {
  if (!qrCodeTuiRuntimePromise) {
    qrCodeTuiRuntimePromise = import("@vincentkoc/qrcode-tui");
  }
  return await qrCodeTuiRuntimePromise;
}

export async function renderQrPngBase64(
  input: string,
  opts: { scale?: number; marginModules?: number } = {},
): Promise<string> {
  const { scale = 6, marginModules = 4 } = opts;
  const { renderPngBase64 } = await loadQrCodeTuiRuntime();
  return await renderPngBase64(input, {
    margin: marginModules,
    scale,
  });
}
