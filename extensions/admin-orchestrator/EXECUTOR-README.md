# OpenClaw Executor Node

Welcome to the **OpenClaw Executor** repository! 

This repository allows you to share your local hardware resources (GPU, CPU, Memory) and specific AI skills (STT, TTS, Video processing, local LLM generation) with the central Admin node via a secure Tailscale network.

## Prerequisites
1. **Docker & Docker Compose** installed.
2. An active **Tailscale** account (we will provide an invite to our tailnet).
3. The specific models or resources you want to provide already downloaded (e.g. Ollama models).

## Setup Instructions

### 1. Join the Tailnet
Run the following command to authenticate your machine to our trusted network:
```bash
tailscale up --authkey tskey-auth-executor-XXXX
```

### 2. Configure Your Skills
Copy the example config and edit it to list what your hardware is capable of:
```bash
cp .env.example .env
# Edit .env and declare your tags:
# EXECUTOR_SKILLS="stt, image-generation, ollama-llama3"
```

### 3. Spin up the Executor MCP Server
Start the agent node. This will dynamically report your capabilities to the Admin node and start listening for GitHub tasks assigned to you.
```bash
docker-compose up -d
```

## How It Works
Once running, this node will periodically poll the Tailnet for the Admin Node and perform a Handshake. You will then receive sub-tasks remotely executed via **MCP (Model Context Protocol)** over SSE. All logs and results are synchronized directly to the Team Memory space.
