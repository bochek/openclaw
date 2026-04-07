---
summary: "Infer-first CLI for multimodal discuss, generate, convert, transcribe, and edit workflows"
read_when:
  - Adding or modifying `openclaw infer` commands
  - Designing stable headless capability automation
title: "Inference CLI"
---

# Inference CLI

`openclaw infer` is the canonical headless surface for provider-backed multimodal workflows.

`openclaw capability` remains supported as a fallback alias for compatibility.

It intentionally exposes capability families, not raw gateway RPC names and not raw agent tool ids.

## What infer is for

Think about `infer` as the CLI for three broad jobs:

- Discuss: ask a model, inspect media, transcribe audio, search or fetch web content.
- Generate: create images, video, speech, and embeddings.
- Edit or transform: mutate an existing artifact when the capability supports it.

Today that maps to the current infer surface like this:

| Modality   | Discuss / inspect                       | Generate / convert | Edit / transform |
| ---------- | --------------------------------------- | ------------------ | ---------------- |
| Text       | `model run`                             | -                  | -                |
| Image      | `image describe`, `image describe-many` | `image generate`   | `image edit`     |
| Audio      | `audio transcribe`                      | `tts convert`      | -                |
| Video      | `video describe`                        | `video generate`   | -                |
| Web        | `web search`, `web fetch`               | -                  | -                |
| Embeddings | -                                       | `embedding create` | -                |

Current note:

- `infer` already feels like a multimodal discuss and generate surface.
- First-class edit support is currently image-focused on this CLI.
- Audio and video editing are not exposed as dedicated `infer` commands yet, so docs should not imply they exist.

## Command tree

```text
 openclaw infer
  list
  inspect

  model
    run
    list
    inspect
    providers
    auth login
    auth logout
    auth status

  image
    generate
    edit
    describe
    describe-many
    providers

  audio
    transcribe
    providers

  tts
    convert
    voices
    providers
    status
    enable
    disable
    set-provider

  video
    generate
    describe
    providers

  web
    search
    fetch
    providers

  embedding
    create
    providers
```

## Transport

Supported transport flags:

- `--local`
- `--gateway`

Default transport is implicit auto at the command-family level:

- Stateless execution commands default to local.
- Gateway-managed state commands default to gateway.

Examples:

```bash
openclaw infer model run --prompt "hello" --json
openclaw infer image generate --prompt "friendly lobster" --json
openclaw infer audio transcribe --file ./memo.m4a --language en --prompt "Focus on names and action items" --json
openclaw infer tts convert --text "hello from openclaw" --output ./hello.mp3 --json
openclaw infer video generate --prompt "cinematic sunset over the ocean" --json
openclaw infer web search --query "OpenClaw docs" --limit 5 --json
openclaw infer tts status --json
openclaw infer embedding create --text "hello world" --json
```

## Quick start

These are the primary headless workflows:

```bash
openclaw infer model run --prompt "Reply with exactly: smoke-ok" --json
openclaw infer image generate --prompt "friendly lobster illustration" --output ./lobster.png --json
openclaw infer audio transcribe --file ./memo.m4a --language en --prompt "Focus on names and action items" --json
openclaw infer tts convert --text "hello from openclaw" --output ./hello.mp3 --json
openclaw infer video generate --prompt "cinematic sunset over the ocean" --output ./sunset.mp4 --json
openclaw infer web search --query "OpenClaw docs" --limit 5 --json
openclaw infer embedding create --text "friendly lobster" --json
```

If you want the shortest mental model:

- discuss with `model run`
- inspect media with `image describe`, `video describe`, and `audio transcribe`
- generate media with `image generate`, `video generate`, and `tts convert`
- edit existing images with `image edit`

Use `--model <provider/model>` when you want to pin execution to a specific provider path.

Maintainers can smoke this CLI surface end-to-end with `pnpm test:live:infer`.

For discovery and automation bootstrap:

```bash
openclaw infer list --json
openclaw infer inspect --name image.generate --json
openclaw infer model providers --json
openclaw infer image providers --json
openclaw infer audio providers --json
openclaw infer tts providers --json
openclaw infer video providers --json
openclaw infer web providers --json
openclaw infer embedding providers --json
```

## Command families

### `model`

Use `model run` for one-shot text discussion through the agent runtime.

Common commands:

```bash
openclaw infer model run --prompt "Reply with exactly: smoke-ok" --json
openclaw infer model run --prompt "Summarize this file" --model openai/gpt-5.4 --json
openclaw infer model list --json
openclaw infer model inspect --model openai/gpt-5.4 --json
openclaw infer model providers --json
openclaw infer model auth status --json
```

Notes:

- `model run` supports `--local` and `--gateway`.
- `--model <provider/model>` follows the same provider/model override shape used elsewhere in OpenClaw.
- Output includes normalized `provider`, `model`, and `outputs`.

### `image`

Use `image generate` and `image edit` for raster creation and editing. Use `describe` for image discussion and analysis of local files.

Common commands:

```bash
openclaw infer image generate --prompt "friendly lobster illustration" --output ./lobster.png --json
openclaw infer image generate --prompt "poster art" --model openai/gpt-image-1 --size 1024x1024 --json
openclaw infer image edit --file ./input.png --prompt "remove the background" --output ./edited.png --json
openclaw infer image describe --file ./photo.jpg --json
openclaw infer image describe-many --file ./a.jpg --file ./b.jpg --json
openclaw infer image providers --json
```

Notes:

- `generate` supports `--count`, `--size`, `--aspect-ratio`, `--resolution`, and `--output`.
- Saved output paths follow the returned bytes, not just the requested extension.

### `audio`

Use `audio transcribe` for speech-to-text discussion of local audio files.

Common commands:

```bash
openclaw infer audio transcribe --file ./memo.m4a --json
openclaw infer audio transcribe --file ./memo.m4a --language en --prompt "Focus on names and action items" --json
openclaw infer audio transcribe --file ./memo.m4a --model openai/gpt-4o-transcribe --json
openclaw infer audio providers --json
```

Notes:

- `--language` and `--prompt` are request-scoped hints.
- `--model <provider/model>` is the safest way to force a provider-backed transcription path.
- When a local transcription path returns empty output, `infer audio transcribe` retries on provider-backed auto-detect before failing.
- `infer` does not expose first-class audio editing commands today. Audio output generation lives under `tts convert`.

### `tts`

Use `tts convert` for speech generation from text, and the other commands to inspect or mutate TTS state.

Common commands:

```bash
openclaw infer tts convert --text "hello from openclaw" --output ./hello.mp3 --json
openclaw infer tts convert --text "hello from openclaw" --model openai/gpt-4o-mini-tts --voice alloy --json
openclaw infer tts voices --provider openai --json
openclaw infer tts providers --json
openclaw infer tts status --json
openclaw infer tts set-provider --provider openai --json
```

Notes:

- `convert`, `providers`, `enable`, `disable`, and `set-provider` support `--local` and `--gateway`.
- `status` is gateway-only because it reflects gateway-managed prefs state.
- `--output` writes the synthesized media to disk and still returns JSON metadata when `--json` is set.

### `video`

Use `video generate` for creation and `video describe` for local discussion and analysis.

Common commands:

```bash
openclaw infer video generate --prompt "cinematic sunset over the ocean" --output ./sunset.mp4 --json
openclaw infer video generate --prompt "city timelapse" --model openai/sora-2 --json
openclaw infer video describe --file ./clip.mp4 --json
openclaw infer video providers --json
```

Notes:

- Generated video jobs may take materially longer than text, image, audio, or embedding commands.
- `providers` exposes both generation providers and local description providers.
- `infer` does not expose first-class video editing commands today.

### `web`

Use `web search` for provider-backed search and `web fetch` for direct URL retrieval.

Common commands:

```bash
openclaw infer web search --query "OpenClaw docs" --limit 5 --json
openclaw infer web search --query "OpenClaw docs" --provider brave --json
openclaw infer web fetch --url https://docs.openclaw.ai/ --json
openclaw infer web providers --json
```

Notes:

- `search` supports `--provider` and `--limit`.
- `fetch` supports `--provider` and `--format`.
- `providers` returns search and fetch provider lists separately.

### `embedding`

Use `embedding create` for one or more input strings and `providers` for discovery.

Common commands:

```bash
openclaw infer embedding create --text "friendly lobster" --json
openclaw infer embedding create --text "friendly lobster" --text "friendly crab" --json
openclaw infer embedding create --text "friendly lobster" --provider openai --model openai/text-embedding-3-small --json
openclaw infer embedding providers --json
```

Notes:

- Repeat `--text` to embed multiple strings in one call.
- Output returns one embedding object per input string.

## JSON output

Capability commands normalize JSON output under a shared envelope:

```json
{
  "ok": true,
  "capability": "image.generate",
  "transport": "local",
  "provider": "openai",
  "model": "gpt-image-1",
  "attempts": [],
  "outputs": []
}
```

Top-level fields are stable:

- `ok`
- `capability`
- `transport`
- `provider`
- `model`
- `attempts`
- `outputs`
- `error`

## Notes

- `model run` reuses the agent runtime so provider/model overrides behave like normal agent execution.
- `tts status` defaults to gateway because it reflects gateway-managed TTS state.
- `openclaw capability ...` is still accepted as a compatibility alias, but `openclaw infer ...` is the canonical surface for docs, scripts, and examples.
