---
summary: "Use Cohere models with OpenClaw"
read_when:
  - You want to use Cohere models in OpenClaw
  - You need Cohere API key onboarding and model refs
title: "Cohere"
---

# Cohere

OpenClaw supports Cohere through Cohere's OpenAI-compatible API (`cohere/...` model refs).

## Quick setup

```bash
openclaw onboard --auth-choice cohere-api-key
# or
openclaw onboard --cohere-api-key "$COHERE_API_KEY"
```

## Example config

```json5
{
  env: { COHERE_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "cohere/command-a-03-2025" } } },
}
```

## Notes

- Cohere auth uses `COHERE_API_KEY`.
- Provider base URL defaults to `https://api.cohere.ai/compatibility/v1`.
- Onboarding default model is `cohere/command-a-03-2025`.
