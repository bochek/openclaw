# Rich Output Protocol

Assistant output can carry a small set of delivery/render directives:

- `MEDIA:` for attachment delivery
- `[[audio_as_voice]]` for audio presentation hints
- `[[reply_to_current]]` / `[[reply_to:<id>]]` for reply metadata
- `[embed ...]` for Control UI rich rendering

These directives are separate. `MEDIA:` and reply/voice tags remain delivery metadata; `[embed ...]` is the web-only rich render path.

Inbound harness annotations are different. Markers such as `[media attached: ...]`,
`[media attached 1/2: ...]`, `[Image: source: ...]`, and `<media:image>` describe
attachments that are already present in the prompt/context. They are read-only
context for the model, not assistant output syntax to echo back.

## Harness Syntax

The harness may inject special syntax into context and may also interpret
certain assistant-output markers. Treat these as parser contracts, not stylistic
suggestions.

## `MEDIA:`

`MEDIA:` is outbound-only assistant metadata for attachment delivery.

Rules:

- Put each `MEDIA:<path-or-url>` directive on its own line.
- It must be the first non-whitespace token on that line, with no prose before or after it.
- Use one `MEDIA:` line per attachment.
- If a path contains spaces, quote the entire path.
- Only use real `http(s)` URLs or safe file paths; do not use `..` traversal segments or `~` home-directory paths.
- Use it only when you want the harness/channel to attach media to the assistant reply.
- Indented `MEDIA:` lines are valid; mid-line prose like `Here is it MEDIA:...` is not.
- Do not use bare `MEDIA:` in explanatory prose or examples unless you intend delivery.
- If you need to discuss the syntax literally, wrap it in quotes or a fenced code block.

## Reply And Audio Tags

`[[reply_to_current]]`, `[[reply_to:<id>]]`, and `[[audio_as_voice]]` are
assistant-output metadata tags.

Rules:

- Put reply tags at the very start of the message for deterministic delivery.
- Place at most one reply tag in a reply.
- Prefer `[[reply_to_current]]`; use `[[reply_to:<id>]]` only when an explicit id is available.
- `[[audio_as_voice]]` only affects attached audio; it does nothing by itself.
- Keep reply/audio tags out of code samples and literal examples unless quoted or fenced.
- These tags are stripped before normal user-visible rendering.

## Special Tokens

- `NO_REPLY` is an exact-token silence mechanism. Use only the bare token with
  optional surrounding whitespace when you want silence; never combine it with
  visible text, punctuation, markdown, or explanations.
- `HEARTBEAT_OK` is a heartbeat-only ack token. Use it only for a real
  heartbeat OK response; do not include it inside ordinary prose, alerts, or
  status updates.

## Reasoning And Final Wrappers

- Do not casually emit `<think>...</think>`, `<thinking>...</thinking>`,
  `<thought>...</thought>`, `<antthinking>...</antthinking>`, or
  `<final>...</final>` in ordinary replies.
- If the runtime explicitly asks for reasoning/final tags, follow that contract
  exactly. Otherwise those wrappers are stripped or sanitized by the runtime and
  may hide or discard content.
- When final-tag enforcement is enabled, only text that appeared inside
  `<final>...</final>` is shown to the user; content outside `<final>` can be
  suppressed.
- If you need to mention these wrappers literally, quote or fence them as
  examples instead of using them as live markup.

## `[embed ...]`

`[embed ...]` is the only agent-facing rich render syntax for the Control UI.

Self-closing example:

```text
[embed ref="cv_123" title="Status" /]
```

Rules:

- `[view ...]` is no longer valid for new output.
- Embed shortcodes render in the assistant message surface only.
- Only URL-backed embeds are rendered. Use `ref="..."` or `url="..."`.
- Quote every attribute value; unquoted attributes are ignored.
- Block-form inline HTML embed shortcodes are not rendered.
- Use embed shortcodes outside fenced code blocks; fenced examples are treated as literal text.
- The web UI strips the shortcode from visible text and renders the embed inline.
- `MEDIA:` is not an embed alias and should not be used for rich embed rendering.

## Stored Rendering Shape

The normalized/stored assistant content block is a structured `canvas` item:

```json
{
  "type": "canvas",
  "preview": {
    "kind": "canvas",
    "surface": "assistant_message",
    "render": "url",
    "viewId": "cv_123",
    "url": "/__openclaw__/canvas/documents/cv_123/index.html",
    "title": "Status",
    "preferredHeight": 320
  }
}
```

Stored/rendered rich blocks use this `canvas` shape directly. `present_view` is not recognized.
