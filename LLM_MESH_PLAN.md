# LLM Mesh Implementation Plan
> **Agent continuity file** — if context runs out, start here.
> Last updated: 2026-04-23

---

## Architecture Summary

OpenClaw Admin Node (this machine) orchestrates a mesh of:
- **Planner LLM**: `minimax/minimax-m2.7` via OpenRouter — decomposes tasks, builds DAGs
- **Local LLMs**: Ollama on this machine (via `host.docker.internal:11434`)
- **2 Windows Executor Nodes** via Tailscale — act as MCP servers exposing GPU capabilities
- **Cloud models** via OpenRouter for vision, fallback, specialized tasks

### Executor Node Capabilities (MCP over SSE via Tailscale)
Each Windows PC exposes these as MCP tools:
- `tts` — Text-to-Speech (local model, e.g. Kokoro/Piper)
- `stt` — Speech-to-Text (Whisper)
- `image_gen` — ComfyUI image generation
- `blender` — Blender MCP (3D scene manipulation)
- `vision` — Image analysis via OpenRouter vision model (e.g. `google/gemini-flash-1.5`)

---

## Current Infrastructure (already deployed)

File: `docker-compose.admin.yml`

| Service | Port | Status | Purpose |
|---------|------|--------|---------|
| `litellm` | 4000 | ✅ Running | LLM API gateway |
| `postgres` | 5432 | ✅ Running | LiteLLM DB |
| `rag-wiki` (AnythingLLM) | 3001 | ✅ Running | RAG / Knowledge Hub |
| `nats` | 4222/8222 | ✅ Running | Swarm message broker |
| `minio` | 9000/9001 | ✅ Running | S3 artifact storage |
| `open-webui` | 4080 | ✅ Running | Human UI |
| `task-tracker` | 8090 | ✅ Running | Markdown Kanban board |

File: `extensions/admin-orchestrator/index.ts` — ✅ exists (prototype tools, needs upgrade)

---

## Phase 1 — Router Intelligence
**Goal**: LiteLLM picks the right model tier automatically. Add semantic cache and tracing.

### 1.1 Update `litellm_config.yaml`

Add these model tiers and routing config:

```yaml
model_list:
  - model_name: "planner"           # For task decomposition
    litellm_params:
      model: openrouter/minimax/minimax-m2.7
      api_key: os.environ/OPENROUTER_API_KEY

  - model_name: "fast"              # Classify, summarize, cheap tasks
    litellm_params:
      model: openrouter/mistralai/mistral-7b-instruct
      api_key: os.environ/OPENROUTER_API_KEY

  - model_name: "work"              # Coding, analysis, reasoning
    litellm_params:
      model: openrouter/qwen/qwen3-235b-a22b
      api_key: os.environ/OPENROUTER_API_KEY

  - model_name: "vision"            # Image analysis
    litellm_params:
      model: openrouter/google/gemini-flash-1.5
      api_key: os.environ/OPENROUTER_API_KEY

  - model_name: "local"             # Local Ollama (no cost, private)
    litellm_params:
      model: ollama/qwen3:14b
      api_base: http://host.docker.internal:11434

router_settings:
  routing_strategy: "latency-based-routing"
  num_retries: 3
  timeout: 60

cache:
  type: "redis"
  host: redis
  port: 6379
  similarity_threshold: 0.92
  ttl: 3600
```

### 1.2 Add Redis to `docker-compose.admin.yml`

```yaml
redis:
  image: redis:7-alpine
  container_name: openclaw-admin-redis
  ports:
    - "6379:6379"
  command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru
  networks:
    - admin-net
  restart: unless-stopped
```

### 1.3 Add Langfuse to `docker-compose.admin.yml`
Langfuse = open-source, self-hosted LLM observability. Best OSS option.

```yaml
langfuse-server:
  image: langfuse/langfuse:2
  container_name: openclaw-admin-langfuse
  ports:
    - "3100:3000"
  environment:
    - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/langfuse
    - NEXTAUTH_SECRET=changeme-langfuse-secret
    - SALT=changeme-langfuse-salt
    - NEXTAUTH_URL=http://localhost:3100
    - LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES=true
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - admin-net
  restart: unless-stopped

langfuse-worker:
  image: langfuse/langfuse-worker:2
  container_name: openclaw-admin-langfuse-worker
  environment:
    - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/langfuse
    - SALT=changeme-langfuse-salt
  depends_on:
    - langfuse-server
  networks:
    - admin-net
  restart: unless-stopped
```

Also add to LiteLLM environment in `docker-compose.admin.yml`:
```yaml
- LANGFUSE_PUBLIC_KEY=${LANGFUSE_PUBLIC_KEY:-placeholder}
- LANGFUSE_SECRET_KEY=${LANGFUSE_SECRET_KEY:-placeholder}
- LANGFUSE_HOST=http://langfuse-server:3000
```

Also add `langfuse` to postgres `POSTGRES_DB` (or create second DB — see note below).

> **Note**: Postgres needs a second DB for Langfuse. Add init script or use separate DB env:
> `POSTGRES_MULTIPLE_DATABASES=litellm,langfuse`
> Use image `postgresql-multiple-databases` or run `CREATE DATABASE langfuse;` manually once.

**Status**: [ ] TODO

---

## Phase 2 — Orchestration Patterns
**Goal**: Upgrade `admin-orchestrator` plugin with real mesh patterns.

### 2.1 New tools in `extensions/admin-orchestrator/index.ts`

#### Tool: `fan_out_tasks`
Splits one task into N subtasks, runs them in parallel via Promise.allSettled,
collects results via NATS reply subjects.

```typescript
// Signature
fan_out_tasks(args: {
  parent_task: string,       // The main goal
  subtasks: Array<{
    title: string,
    required_skills: string[],  // e.g. ["tts"], ["image_gen"], ["blender"]
    model_tier: string,         // "fast"|"work"|"planner"|"local"|"vision"
  }>,
  aggregation_strategy: "concat" | "vote" | "merge"
}) => Promise<{ results: any[], summary: string }>
```

Implementation:
1. For each subtask: if `required_skills` matches an executor node → publish to NATS `swarm.task.{node_id}`, wait for reply
2. If no executor skill needed → call LiteLLM directly with `model_tier`
3. Await `Promise.allSettled` on all
4. Apply aggregation strategy
5. Return merged result

#### Tool: `debate_round`
Two models critique each other's answer, third acts as referee.

```typescript
debate_round(args: {
  question: string,
  rounds: number,           // default 1
  contestant_a: string,     // model tier, e.g. "work"
  contestant_b: string,     // model tier, e.g. "local"
  referee: string           // model tier, e.g. "planner"
}) => Promise<{ winner_answer: string, reasoning: string }>
```

Use case: fact checking, code review, important decisions.

#### Tool: `plan_and_delegate`
Uses `planner` model (minimax-m2.7) to decompose a complex task into a DAG,
then delegates each node to the right executor or model.

```typescript
plan_and_delegate(args: {
  goal: string,
  available_executors: string[]   // from list_executors()
}) => Promise<{ plan: TaskDAG, execution_log: string[] }>
```

Implementation:
1. Call `planner` model with structured prompt → get JSON DAG
2. Validate DAG (no cycles)
3. Execute in topological order, respecting dependencies
4. Return final aggregated output

### 2.2 Fix NATS integration (currently prototype comments)

Replace commented NATS code in `broadcast_update` with real implementation:

```typescript
import { connect, StringCodec } from "nats";

const nc = await connect({ servers: process.env.NATS_URL || "nats://openclaw-admin-nats:4222" });
const sc = StringCodec();
nc.publish("swarm.updates", sc.encode(JSON.stringify({
  event: "code-update",
  target: target_skills,
  commit: message,
  branch,
  graceful
})));
await nc.drain();
```

Also implement real NATS task dispatch in `delegate_subtask` (replace 10s polling):
- Admin publishes to `swarm.task.{skill}` with `reply: swarm.task.reply.{uuid}`
- Executor subscribes, executes, publishes result to reply subject
- Admin awaits reply with timeout

**Status**: [ ] TODO

---

## Phase 3 — Executor Node MCP Bridge
**Goal**: Each Windows Executor PC exposes its GPU capabilities as an MCP SSE server over Tailscale.

### 3.1 Executor Node Setup (per Windows PC)

Each node runs a Docker Compose stack that bridges local tools to MCP SSE:

File to create: `docker-compose.executor.yml` (deploy on each Windows executor PC)

```yaml
# Run on each Windows executor node
# Access via: http://{tailscale-ip}:8020/sse

services:
  mcp-bridge:
    image: node:22-slim
    container_name: executor-mcp-bridge
    working_dir: /app
    command: >
      sh -c "npx -y mcp-proxy --port 8020
             npx -y @modelcontextprotocol/server-filesystem /workspace"
    ports:
      - "8020:8020"
    volumes:
      - ./workspace:/workspace
    restart: unless-stopped

  # ComfyUI for image generation
  comfyui:
    image: yanwk/comfyui-boot:latest  # or custom image
    container_name: executor-comfyui
    ports:
      - "8188:8188"
    volumes:
      - comfyui_models:/root/comfy/ComfyUI/models
      - comfyui_output:/root/comfy/ComfyUI/output
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]

  # Whisper STT
  whisper-stt:
    image: onerahmet/openai-whisper-asr-webservice:latest
    container_name: executor-whisper
    ports:
      - "9000:9000"
    environment:
      - ASR_MODEL=medium

  # Piper TTS
  piper-tts:
    image: rhasspy/wyoming-piper:latest
    container_name: executor-piper
    ports:
      - "10200:10200"
    command: --voice en_US-lessac-medium

volumes:
  comfyui_models:
  comfyui_output:
```

### 3.2 Register Executor MCPs in `swarm_capabilities.json`

Update `extensions/admin-orchestrator/swarm_capabilities.json`:

```json
{
  "executor_nodes": {
    "node-win-1": {
      "tailscale_ip": "100.x.x.x",
      "mcp_endpoint": "http://100.x.x.x:8020/sse",
      "skills": ["tts", "stt", "image_gen", "blender", "vision"],
      "status": "unknown"
    },
    "node-win-2": {
      "tailscale_ip": "100.x.x.y",
      "mcp_endpoint": "http://100.x.x.y:8020/sse",
      "skills": ["tts", "stt", "image_gen"],
      "status": "unknown"
    }
  },
  "mcps": {
    "github-admin": {
      "description": "Centralized GitHub MCP managed by Admin",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "hosted_by": "admin",
      "access": "global"
    }
  },
  "skills": {
    "local-docker": {
      "description": "Docker container management",
      "type": "docker",
      "enabled": true
    },
    "memory-hub": {
      "description": "Shared Vector Memory (AnythingLLM) + Postgres",
      "type": "memory",
      "workspace": "shared",
      "enabled": true
    },
    "tts": {
      "description": "Text-to-Speech via Piper on executor nodes",
      "type": "remote-mcp",
      "routed_via": "executor_nodes"
    },
    "stt": {
      "description": "Speech-to-Text via Whisper on executor nodes",
      "type": "remote-mcp",
      "routed_via": "executor_nodes"
    },
    "image_gen": {
      "description": "Image generation via ComfyUI on executor nodes",
      "type": "remote-mcp",
      "routed_via": "executor_nodes"
    },
    "blender": {
      "description": "3D scene manipulation via Blender MCP",
      "type": "remote-mcp",
      "routed_via": "executor_nodes"
    },
    "vision": {
      "description": "Image analysis via OpenRouter vision model (gemini-flash)",
      "type": "cloud-model",
      "model": "openrouter/google/gemini-flash-1.5"
    }
  }
}
```

### 3.3 Upgrade `list_executors` tool

Replace the hardcoded mock in `admin-orchestrator/index.ts` with real health-check logic:
- Read `swarm_capabilities.json`
- For each executor node: `fetch(mcp_endpoint + "/health")` with 3s timeout
- Update `status` field: `"online"` | `"offline"` | `"busy"`
- Return live list

**Status**: [ ] TODO

---

## Phase 4 — Context & Memory Management
**Goal**: Auto-select the right context strategy based on conversation size.

### 4.1 Create `extensions/mesh-memory/index.ts`

New plugin with these tools:

#### `compress_context(messages, strategy?)`
- If `strategy` = `"auto"`: use token count to decide
  - < 8k tokens → `"passthrough"` (no change)
  - 8k–50k → `"summarize"` (call `fast` model)
  - > 50k → `"rag"` (store in AnythingLLM, retrieve relevant chunks)
- Returns compressed messages array + stats

#### `save_agent_state(task_id, state_object)`
- Serialize state to JSON
- Upload to MinIO: `s3://mesh-states/{task_id}/{timestamp}.json`
- Returns MinIO URL

#### `load_agent_state(task_id)`
- List MinIO objects at `s3://mesh-states/{task_id}/`
- Download latest
- Returns parsed state object

#### `semantic_recall(query, workspace?)`
- Calls AnythingLLM workspace query (existing `query_memory` logic, refactored here)
- Default workspace: `"shared"`

**Status**: [ ] TODO

---

## Phase 5 — Observability Dashboard
**Goal**: See cost, latency, cache hits in one place.

### 5.1 Add Grafana + Prometheus to `docker-compose.admin.yml`

```yaml
prometheus:
  image: prom/prometheus:latest
  container_name: openclaw-admin-prometheus
  ports:
    - "9090:9090"
  volumes:
    - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    - prometheus_data:/prometheus
  networks:
    - admin-net
  restart: unless-stopped

grafana:
  image: grafana/grafana-oss:latest
  container_name: openclaw-admin-grafana
  ports:
    - "3200:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    - GF_USERS_ALLOW_SIGN_UP=false
  volumes:
    - grafana_data:/var/lib/grafana
    - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards
    - ./monitoring/datasources:/etc/grafana/provisioning/datasources
  networks:
    - admin-net
  restart: unless-stopped
```

### 5.2 Create `monitoring/prometheus.yml`

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'litellm'
    static_configs:
      - targets: ['litellm:4000']
    metrics_path: '/metrics'

  - job_name: 'nats'
    static_configs:
      - targets: ['nats:8222']
    metrics_path: '/metrics'
```

### 5.3 Create `monitoring/datasources/prometheus.yml`

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

Key dashboards to build (or import from grafana.com):
- **LiteLLM Overview** — import ID `18539` from Grafana dashboard library
- **NATS Monitoring** — import ID `2279`
- **Custom Mesh Cost** — manual: tokens/day per tier, cost savings from cache

**Status**: [ ] TODO

---

## Full Service Port Map (after all phases)

| Service | Port | URL |
|---------|------|-----|
| LiteLLM API | 4000 | http://localhost:4000 |
| AnythingLLM (RAG) | 3001 | http://localhost:3001 |
| Open WebUI | 4080 | http://localhost:4080 |
| Task Tracker | 8090 | http://localhost:8090 |
| MinIO API | 9000 | http://localhost:9000 |
| MinIO Console | 9001 | http://localhost:9001 |
| NATS Client | 4222 | nats://localhost:4222 |
| NATS Monitor | 8222 | http://localhost:8222 |
| **Langfuse** | **3100** | **http://localhost:3100** |
| **Redis** | **6379** | internal only |
| **Prometheus** | **9090** | **http://localhost:9090** |
| **Grafana** | **3200** | **http://localhost:3200** |
| Executor Node 1 MCP | 8020 | http://{tailscale-ip-1}:8020/sse |
| Executor Node 2 MCP | 8020 | http://{tailscale-ip-2}:8020/sse |

---

## Task Checklist (for agent continuity)

### Phase 1 — Router Intelligence
- [ ] Create/update `litellm_config.yaml` with 5 model tiers (planner, fast, work, vision, local)
- [ ] Add `redis` service to `docker-compose.admin.yml`
- [ ] Add `langfuse-server` + `langfuse-worker` to `docker-compose.admin.yml`
- [ ] Add Langfuse env vars to `litellm` service
- [ ] Create second Postgres DB `langfuse` (SQL init script or manual)
- [ ] Add `volumes: langfuse_data, prometheus_data, grafana_data, redis_data` to docker-compose

### Phase 2 — Orchestration Upgrade
- [ ] Add `nats` npm package to `extensions/admin-orchestrator/package.json`
- [ ] Replace prototype NATS comments with real `nats.js` implementation
- [ ] Add `fan_out_tasks` tool to `extensions/admin-orchestrator/index.ts`
- [ ] Add `debate_round` tool to `extensions/admin-orchestrator/index.ts`
- [ ] Add `plan_and_delegate` tool to `extensions/admin-orchestrator/index.ts`
- [ ] Upgrade `list_executors` to live health-check (reads `swarm_capabilities.json`)
- [ ] Replace 10s polling in `delegate_subtask` with NATS request-reply

### Phase 3 — Executor Nodes
- [ ] Update `swarm_capabilities.json` with real executor node Tailscale IPs and skill registry
- [ ] Create `docker-compose.executor.yml` for deployment on Windows PCs
- [ ] Update actual Tailscale IPs in `swarm_capabilities.json` after nodes are connected
- [ ] Verify MCP SSE endpoint on each node: `curl http://{tailscale-ip}:8020/sse`

### Phase 4 — Memory Plugin
- [ ] Create `extensions/mesh-memory/` directory
- [ ] Create `extensions/mesh-memory/package.json`
- [ ] Create `extensions/mesh-memory/openclaw.plugin.json`
- [ ] Create `extensions/mesh-memory/index.ts` with 4 tools (compress_context, save_agent_state, load_agent_state, semantic_recall)
- [ ] Add MinIO client (`minio` npm package) as dependency

### Phase 5 — Observability
- [ ] Add `prometheus` + `grafana` to `docker-compose.admin.yml`
- [ ] Create `monitoring/prometheus.yml`
- [ ] Create `monitoring/datasources/prometheus.yml`
- [ ] Import Grafana dashboard ID `18539` (LiteLLM) via provisioning JSON

---

## Key Design Decisions (locked)

1. **Planner model**: `minimax/minimax-m2.7` via OpenRouter — used exclusively for `plan_and_delegate` and `debate_round` referee role
2. **Executor transport**: NATS request-reply pattern (not HTTP polling) — subject pattern: `swarm.task.{skill}` / reply `swarm.reply.{uuid}`
3. **Observability**: Langfuse (self-hosted, open-source) for LLM tracing + Grafana/Prometheus for infra metrics
4. **Context strategy**: auto-selected by token count (passthrough / summarize / RAG)
5. **Executor MCP**: Each Windows node runs `mcp-proxy` wrapping local GPU tools, accessible via Tailscale IP on port 8020
6. **Semantic cache**: Redis via LiteLLM's built-in cache, threshold 0.92 similarity
7. **Scale**: Start with 2 Windows executors, `swarm_capabilities.json` is the single source of truth for node registry

---

## Files Changed / To Be Changed

| File | Status | Notes |
|------|--------|-------|
| `docker-compose.admin.yml` | 🔄 Modify | Add Redis, Langfuse, Prometheus, Grafana |
| `litellm_config.yaml` | 🔄 Modify | 5 tiers + router + cache config |
| `extensions/admin-orchestrator/index.ts` | 🔄 Modify | Real NATS + 3 new tools |
| `extensions/admin-orchestrator/package.json` | 🔄 Modify | Add `nats` dependency |
| `extensions/admin-orchestrator/swarm_capabilities.json` | 🔄 Modify | Add executor nodes + skills |
| `extensions/mesh-memory/index.ts` | 🆕 Create | Context management plugin |
| `extensions/mesh-memory/package.json` | 🆕 Create | |
| `extensions/mesh-memory/openclaw.plugin.json` | 🆕 Create | |
| `docker-compose.executor.yml` | 🆕 Create | For Windows executor nodes |
| `monitoring/prometheus.yml` | 🆕 Create | |
| `monitoring/datasources/prometheus.yml` | 🆕 Create | |
