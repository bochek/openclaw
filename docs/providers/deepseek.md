---
summary: "DeepSeek setup (auth + model selection)"
read_when:
  - You want to use DeepSeek with OpenClaw
  - You need the API key env var or CLI auth choice
---

# DeepSeek

[DeepSeek](https://www.deepseek.com) provides powerful AI models with an OpenAI-compatible API.

- Provider: `deepseek`
- Auth: `DEEPSEEK_API_KEY`
- API: OpenAI-compatible

## Quick start

1. Set the API key (recommended: store it for the Gateway):

```bash
openclaw setup --wizard --auth-choice deepseek-api-key
```

2. Set a default model:

```json5
{
  agents: {
    defaults: {
      model: { primary: "deepseek/deepseek-chat" },
    },
  },
}
```

## Non-interactive example

```bash
openclaw setup --wizard --non-interactive \
  --mode local \
  --auth-choice deepseek-api-key \
  --deepseek-api-key "$DEEPSEEK_API_KEY"
```

This will set `deepseek/deepseek-chat` as the default model.

## Environment note

If the Gateway runs as a daemon (launchd/systemd), make sure `DEEPSEEK_API_KEY`
is available to that process (for example, in `~/.openclaw/.env` or via
`env.shellEnv`).

## Available models

| Model ID            | Name                     | Type      | Context |
| ------------------- | ------------------------ | --------- | ------- |
| `deepseek-chat`     | DeepSeek Chat (V3.2)     | General   | 128K    |
| `deepseek-reasoner` | DeepSeek Reasoner (V3.2) | Reasoning | 128K    |

- **deepseek-chat** corresponds to DeepSeek-V3.2 in non-thinking mode.
- **deepseek-reasoner** corresponds to DeepSeek-V3.2 in thinking mode with chain-of-thought reasoning.

Get your API key at [platform.deepseek.com](https://platform.deepseek.com/api_keys).
