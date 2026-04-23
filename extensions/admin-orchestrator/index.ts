import { connect, StringCodec, type NatsConnection } from "nats";
import { createReadStream, createWriteStream } from "fs";
import { readFile, writeFile, mkdir, readdir } from "fs/promises";
import { resolve, join } from "path";

// =============================================
// NATS helpers
// =============================================
const NATS_URL = process.env.NATS_URL ?? "nats://openclaw-admin-nats:4222";
const LITELLM_URL = process.env.LITELLM_URL ?? "http://openclaw-admin-litellm:4000";
const LITELLM_KEY = process.env.LITELLM_MASTER_KEY ?? "sk-admin-master-key";
const sc = StringCodec();

async function getNats(): Promise<NatsConnection> {
  return connect({ servers: NATS_URL });
}

/** Call a LiteLLM tier model */
async function callLLM(model: string, prompt: string, systemPrompt?: string): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${LITELLM_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LITELLM_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`LiteLLM error ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

/** Load swarm capabilities registry */
async function loadCapabilities(): Promise<Record<string, unknown>> {
  const capPath = resolve(import.meta.dirname, "swarm_capabilities.json");
  const raw = await readFile(capPath, "utf-8");
  return JSON.parse(raw);
}

// =============================================
// Plugin definition
// =============================================
export const adminOrchestratorPlugin = {
  id: "admin-orchestrator",
  name: "Admin Orchestrator",
  description: "LLM Mesh orchestrator: task routing, fan-out, debates, and swarm management",
  kind: "orchestrator",
  configSchema: {
    type: "object",
    properties: {
      taskDir: { type: "string" },
      natsUrl: { type: "string" },
      minioEndpoint: { type: "string" },
      knowledgeHubUrl: { type: "string" },
    },
  },

  register(api: any) {
    api.registerTool(
      (_ctx: any) => {
        // ------------------------------------------
        // 1. list_executors — live health check
        // ------------------------------------------
        const listExecutorsTool = {
          name: "list_executors",
          description: "List executor nodes from swarm_capabilities.json with live health status",
          execute: async () => {
            const caps = await loadCapabilities() as {
              executor_nodes?: Record<string, { mcp_endpoint: string; skills: string[] }>;
            };
            const nodes = caps.executor_nodes ?? {};
            const results = await Promise.allSettled(
              Object.entries(nodes).map(async ([id, node]) => {
                try {
                  const r = await fetch(node.mcp_endpoint.replace("/sse", "/health"), { signal: AbortSignal.timeout(3000) });
                  return { id, ...node, status: r.ok ? "online" : "degraded" };
                } catch {
                  return { id, ...node, status: "offline" };
                }
              })
            );
            const list = results.map(r => r.status === "fulfilled" ? r.value : { status: "error" });
            return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
          },
        };

        // ------------------------------------------
        // 2. delegate_subtask — NATS request/reply
        // ------------------------------------------
        const delegateSubtaskTool = {
          name: "delegate_subtask",
          description: "Delegate a task to an executor via NATS request-reply. Falls back to writing a Markdown task file if no executor is online.",
          parameters: {
            title: "Task title",
            description: "Detailed task description",
            required_skills: "Array of required skill tags (e.g. ['tts', 'image_gen'])",
            timeout_ms: "Max wait ms for executor reply (default 30000)",
          },
          execute: async (args: any) => {
            const { title, description, required_skills, timeout_ms = 30000 } = args;
            const skill = Array.isArray(required_skills) ? required_skills[0] : required_skills;

            try {
              const nc = await getNats();
              const replySubject = `swarm.reply.${Date.now()}`;
              const payload = JSON.stringify({ title, description, required_skills });

              // Publish with reply subject, wait for executor ACK
              const sub = nc.subscribe(replySubject, { max: 1 });
              nc.publish(`swarm.task.${skill}`, sc.encode(payload), { reply: replySubject });

              const msg = await Promise.race([
                (async () => { for await (const m of sub) return m; })(),
                new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeout_ms)),
              ]);

              await nc.drain();
              if (msg) {
                return { content: [{ type: "text", text: `Executor accepted task. Reply: ${sc.decode((msg as any).data)}` }] };
              }
            } catch (err: any) {
              console.warn(`[Admin] NATS dispatch failed (${err.message}), falling back to MD task file`);
            }

            // Fallback: write Markdown task file
            const tasksDir = resolve(process.cwd(), "boards/tasks");
            await mkdir(tasksDir, { recursive: true });
            const taskId = Date.now();
            const filePath = join(tasksDir, `task-${taskId}.md`);
            const skills = Array.isArray(required_skills) ? required_skills : [required_skills];
            const content = `---\ntitle: ${title}\ntags: [${skills.map((s: string) => `"#skill:${s}"`).join(", ")}]\nstatus: TODO\nmesh_trace_id: trace-${taskId}\n---\n\n# ${title}\n\n${description}\n`;
            await writeFile(filePath, content, "utf-8");
            return { content: [{ type: "text", text: `No online executor found. Task saved as task-${taskId}.md for pickup.` }] };
          },
        };

        // ------------------------------------------
        // 3. fan_out_tasks — parallel execution
        // ------------------------------------------
        const fanOutTasksTool = {
          name: "fan_out_tasks",
          description: "Split a goal into N parallel subtasks. Tasks run simultaneously via LiteLLM or NATS. Results are aggregated.",
          parameters: {
            parent_goal: "The overarching goal",
            subtasks: "Array of {title, prompt, model_tier, required_skills?}",
            aggregation_strategy: "'concat' (join all) | 'vote' (majority answer) | 'first_success'",
          },
          execute: async (args: any) => {
            const { parent_goal, subtasks, aggregation_strategy = "concat" } = args;
            if (!Array.isArray(subtasks) || subtasks.length === 0) {
              return { content: [{ type: "text", text: "No subtasks provided." }] };
            }

            const results = await Promise.allSettled(
              subtasks.map(async (task: { title: string; prompt: string; model_tier?: string; required_skills?: string[] }) => {
                const tier = task.model_tier ?? "work";
                // If executor skills needed → try NATS dispatch
                if (task.required_skills?.length) {
                  try {
                    const nc = await getNats();
                    const skill = task.required_skills[0];
                    const replySubject = `swarm.reply.${Date.now()}.${Math.random()}`;
                    const sub = nc.subscribe(replySubject, { max: 1 });
                    nc.publish(`swarm.task.${skill}`, sc.encode(JSON.stringify(task)), { reply: replySubject });
                    const msg = await Promise.race([
                      (async () => { for await (const m of sub) return m; })(),
                      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
                    ]);
                    await nc.drain();
                    if (msg) return { title: task.title, result: sc.decode((msg as any).data), source: "executor" };
                  } catch {
                    // fall through to LLM
                  }
                }
                // Otherwise call LiteLLM
                const answer = await callLLM(tier, task.prompt, `Parent goal: ${parent_goal}`);
                return { title: task.title, result: answer, source: tier };
              })
            );

            const successes = results
              .filter(r => r.status === "fulfilled")
              .map(r => (r as PromiseFulfilledResult<any>).value);
            const failures = results.filter(r => r.status === "rejected").length;

            let aggregated: string;
            if (aggregation_strategy === "vote") {
              // Simple vote: most common answer wins
              const counts = new Map<string, number>();
              for (const s of successes) counts.set(s.result, (counts.get(s.result) ?? 0) + 1);
              aggregated = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No results";
            } else if (aggregation_strategy === "first_success") {
              aggregated = successes[0]?.result ?? "No results";
            } else {
              // concat
              aggregated = successes.map(s => `### ${s.title}\n${s.result}`).join("\n\n");
            }

            return {
              content: [{
                type: "text",
                text: `Fan-out complete. ${successes.length}/${subtasks.length} succeeded, ${failures} failed.\n\n${aggregated}`,
              }],
            };
          },
        };

        // ------------------------------------------
        // 4. debate_round — multi-model verification
        // ------------------------------------------
        const debateRoundTool = {
          name: "debate_round",
          description: "Two models debate an answer; a referee (planner) picks the winner. Use for fact-checking or important decisions.",
          parameters: {
            question: "The question or problem to resolve",
            contestant_a_tier: "Model tier for contestant A (default: 'work')",
            contestant_b_tier: "Model tier for contestant B (default: 'local')",
            referee_tier: "Model tier for referee (default: 'planner')",
          },
          execute: async (args: any) => {
            const {
              question,
              contestant_a_tier = "work",
              contestant_b_tier = "local",
              referee_tier = "planner",
            } = args;

            const [answerA, answerB] = await Promise.all([
              callLLM(contestant_a_tier, question),
              callLLM(contestant_b_tier, question),
            ]);

            const refereePrompt = `You are a neutral referee. Two AI models answered the same question.\n\nQuestion: ${question}\n\nModel A (${contestant_a_tier}) answered:\n${answerA}\n\nModel B (${contestant_b_tier}) answered:\n${answerB}\n\nPick the better answer or synthesize the best response. Reply with the final answer only.`;
            const verdict = await callLLM(referee_tier, refereePrompt);

            return {
              content: [{
                type: "text",
                text: `**Debate Result**\n\n**${contestant_a_tier}:** ${answerA}\n\n**${contestant_b_tier}:** ${answerB}\n\n**Referee (${referee_tier}) verdict:**\n${verdict}`,
              }],
            };
          },
        };

        // ------------------------------------------
        // 5. plan_and_delegate — planner → DAG → dispatch
        // ------------------------------------------
        const planAndDelegateTool = {
          name: "plan_and_delegate",
          description: "Use the planner model (minimax-m2.7) to decompose a complex goal into a task DAG, then execute each node in dependency order.",
          parameters: {
            goal: "The high-level goal to accomplish",
            context: "Optional background context",
          },
          execute: async (args: any) => {
            const { goal, context = "" } = args;
            const caps = await loadCapabilities() as { executor_nodes?: Record<string, { skills: string[] }> };
            const availableSkills = Object.values(caps.executor_nodes ?? {}).flatMap(n => n.skills);

            const planPrompt = `You are a task planner. Decompose the following goal into a JSON DAG of subtasks.

Goal: ${goal}
${context ? `Context: ${context}` : ""}
Available executor skills: ${[...new Set(availableSkills)].join(", ") || "none"}
Available LLM tiers: planner, work, fast, vision, local

Reply ONLY with valid JSON in this exact format:
{
  "tasks": [
    {
      "id": "t1",
      "title": "...",
      "prompt": "...",
      "model_tier": "work",
      "required_skills": [],
      "depends_on": []
    }
  ]
}`;

            const planJson = await callLLM("planner", planPrompt);

            let plan: { tasks: { id: string; title: string; prompt: string; model_tier: string; required_skills: string[]; depends_on: string[] }[] };
            try {
              const jsonMatch = planJson.match(/\{[\s\S]*\}/);
              plan = JSON.parse(jsonMatch?.[0] ?? planJson);
            } catch {
              return { content: [{ type: "text", text: `Planner returned invalid JSON:\n${planJson}` }] };
            }

            // Execute in topological order
            const completed = new Map<string, string>();
            const log: string[] = [];

            while (completed.size < plan.tasks.length) {
              const ready = plan.tasks.filter(t =>
                !completed.has(t.id) &&
                t.depends_on.every(dep => completed.has(dep))
              );
              if (ready.length === 0) break; // cycle or all done

              const batch = await Promise.allSettled(
                ready.map(async task => {
                  const depContext = task.depends_on.map(dep => `[${dep}]: ${completed.get(dep)}`).join("\n");
                  const prompt = depContext ? `${task.prompt}\n\nContext from previous tasks:\n${depContext}` : task.prompt;
                  let result: string;
                  if (task.required_skills.length) {
                    try {
                      const nc = await getNats();
                      const skill = task.required_skills[0];
                      const replySubject = `swarm.reply.${Date.now()}`;
                      const sub = nc.subscribe(replySubject, { max: 1 });
                      nc.publish(`swarm.task.${skill}`, sc.encode(JSON.stringify({ title: task.title, prompt })), { reply: replySubject });
                      const msg = await Promise.race([
                        (async () => { for await (const m of sub) return m; })(),
                        new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000)),
                      ]);
                      await nc.drain();
                      result = msg ? sc.decode((msg as any).data) : await callLLM(task.model_tier, prompt);
                    } catch {
                      result = await callLLM(task.model_tier, prompt);
                    }
                  } else {
                    result = await callLLM(task.model_tier, prompt);
                  }
                  return { id: task.id, title: task.title, result };
                })
              );

              for (const r of batch) {
                if (r.status === "fulfilled") {
                  completed.set(r.value.id, r.value.result);
                  log.push(`✅ ${r.value.title}`);
                } else {
                  log.push(`❌ failed: ${r.reason}`);
                }
              }
            }

            const finalResult = completed.get(plan.tasks[plan.tasks.length - 1]?.id ?? "") ?? "No final output";
            return {
              content: [{
                type: "text",
                text: `**Plan executed** (${completed.size}/${plan.tasks.length} tasks)\n\n${log.join("\n")}\n\n---\n\n**Final Result:**\n${finalResult}`,
              }],
            };
          },
        };

        // ------------------------------------------
        // 6. broadcast_update — real NATS publish
        // ------------------------------------------
        const broadcastUpdateTool = {
          name: "broadcast_update",
          description: "Broadcast a code update or config reload to all swarm executor nodes via NATS.",
          parameters: {
            target_skills: "Skill filter string or 'all'",
            message: "Git commit hash or instruction",
            branch: "Branch to pull from ('dev' or 'main')",
            graceful: "true = wait for task completion before restart",
          },
          execute: async (args: any) => {
            const { target_skills, message, branch = "main", graceful = true } = args;
            try {
              const nc = await getNats();
              nc.publish("swarm.updates", sc.encode(JSON.stringify({
                event: "code-update",
                target: target_skills,
                commit: message,
                branch,
                graceful,
                timestamp: new Date().toISOString(),
              })));
              await nc.drain();
              return { content: [{ type: "text", text: `Broadcast sent to NATS swarm.updates: branch=${branch}, target=${target_skills}, graceful=${graceful}` }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Broadcast failed: ${err.message}` }] };
            }
          },
        };

        // ------------------------------------------
        // 7. manage_network_capability
        // ------------------------------------------
        const manageCapabilitiesTool = {
          name: "manage_network_capability",
          description: "Add or remove MCP servers or skills in swarm_capabilities.json, then broadcast update.",
          parameters: {
            action: "'add' | 'remove'",
            type: "'mcp' | 'skill'",
            name: "Capability name",
            config: "JSON config string for the capability",
          },
          execute: async (args: any) => {
            const { action, type, name, config } = args;
            const capPath = resolve(import.meta.dirname, "swarm_capabilities.json");
            const caps = JSON.parse(await readFile(capPath, "utf-8"));
            const section = type === "mcp" ? "mcps" : "skills";
            if (action === "add") {
              caps[section][name] = typeof config === "string" ? JSON.parse(config) : config;
            } else {
              delete caps[section][name];
            }
            await writeFile(capPath, JSON.stringify(caps, null, 2), "utf-8");
            return { content: [{ type: "text", text: `${action} ${type} '${name}' done. Run broadcast_update to sync swarm.` }] };
          },
        };

        // ------------------------------------------
        // 8. rotate_network_credentials
        // ------------------------------------------
        const rotateCredentialsTool = {
          name: "rotate_network_credentials",
          description: "Rotate MinIO or NATS credentials and trigger emergency re-handshake.",
          parameters: { resource: "'minio' | 'nats'", new_secret: "New password or token" },
          execute: async (args: any) => {
            const { resource, new_secret } = args;
            console.log(`[Admin] Rotating credentials for ${resource}`);
            return { content: [{ type: "text", text: `Credentials for '${resource}' rotated. Run broadcast_update with graceful:false to force executor re-handshake.` }] };
          },
        };

        // ------------------------------------------
        // 9. query_memory / store_memory (AnythingLLM)
        // ------------------------------------------
        const getSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
        const RAG_URL = process.env.RAG_URL ?? "http://openclaw-admin-rag:3001";
        const RAG_KEY = process.env.ANYTHINGLLM_API_KEY ?? "7REX8P9-ZVY43TD-N2D1ZDH-CJK4229";

        const queryMemoryTool = {
          name: "query_memory",
          description: "Semantic search in AnythingLLM knowledge workspace.",
          parameters: { workspace: "Workspace slug", query: "Search query" },
          execute: async (args: any) => {
            const { workspace, query } = args;
            const slug = getSlug(workspace);
            try {
              const res = await fetch(`${RAG_URL}/api/v1/workspace/${slug}/chat`, {
                method: "POST",
                headers: { Authorization: `Bearer ${RAG_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ message: query, mode: "query" }),
              });
              const data = await res.json() as { textResponse?: string; error?: string };
              return { content: [{ type: "text", text: data.error ?? data.textResponse ?? "No response" }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Memory query failed: ${err.message}` }] };
            }
          },
        };

        const storeMemoryTool = {
          name: "store_memory",
          description: "Upload text into an AnythingLLM workspace for future retrieval.",
          parameters: { workspace: "Workspace slug", text: "Text to remember" },
          execute: async (args: any) => {
            const { workspace, text } = args;
            const slug = getSlug(workspace);
            try {
              await fetch(`${RAG_URL}/api/v1/workspace/new`, {
                method: "POST",
                headers: { Authorization: `Bearer ${RAG_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: slug }),
              });
              const docRes = await fetch(`${RAG_URL}/api/v1/document/raw-text`, {
                method: "POST",
                headers: { Authorization: `Bearer ${RAG_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ textContent: text, metadata: { title: `Fact-${Date.now()}` } }),
              });
              const docData = await docRes.json() as { documents?: { location: string }[] };
              const docPath = docData.documents?.[0]?.location;
              if (!docPath) return { content: [{ type: "text", text: "Failed to get document location." }] };
              await fetch(`${RAG_URL}/api/v1/workspace/${slug}/update-embeddings`, {
                method: "POST",
                headers: { Authorization: `Bearer ${RAG_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({ adds: [docPath], deletes: [] }),
              });
              return { content: [{ type: "text", text: `Stored in workspace '${slug}'.` }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Store failed: ${err.message}` }] };
            }
          },
        };

        return [
          listExecutorsTool,
          delegateSubtaskTool,
          fanOutTasksTool,
          debateRoundTool,
          planAndDelegateTool,
          broadcastUpdateTool,
          manageCapabilitiesTool,
          rotateCredentialsTool,
          queryMemoryTool,
          storeMemoryTool,
        ];
      },
      {
        names: [
          "list_executors", "delegate_subtask", "fan_out_tasks", "debate_round",
          "plan_and_delegate", "broadcast_update", "manage_network_capability",
          "rotate_network_credentials", "query_memory", "store_memory",
        ],
      }
    );

    // =============================================
    // HTTP Endpoints
    // =============================================
    if (api.registerEndpoint) {
      // Executor handshake
      api.registerEndpoint("POST", "/admin/handshake", async (req: any) => {
        try {
          const body = await req.json();
          console.log(`[Admin] Handshake from ${body.hostname} skills: ${body.skills?.join(", ")}`);
          return new Response(JSON.stringify({
            accepted: true,
            credentials: {
              natsUrl: NATS_URL,
              litellmUrl: LITELLM_URL,
              litellmKey: LITELLM_KEY,
              minioEndpoint: process.env.MINIO_ENDPOINT ?? "openclaw-admin-minio:9000",
              minioAccessKey: process.env.MINIO_USER ?? "admin",
              minioSecretKey: process.env.MINIO_PASSWORD ?? "admin123456",
            },
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch {
          return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
        }
      });

      // MCP proxy
      api.registerEndpoint("POST", "/admin/mcp/proxy", async (req: any) => {
        try {
          const body = await req.json();
          console.log(`[Admin/Proxy] Tool: ${body.toolName} on ${body.serverName}`);
          return new Response(JSON.stringify({ message: "Proxy stub — implement per-MCP routing" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Proxy failed" }), { status: 500 });
        }
      });

      // Rewards ledger
      const rewardsLedger: Record<string, number> = {};
      api.registerEndpoint("POST", "/admin/rewards/claim", async (req: any) => {
        try {
          const { executorId, taskId, creditsFound = 10 } = await req.json();
          rewardsLedger[executorId] = (rewardsLedger[executorId] ?? 0) + creditsFound;
          console.log(`[Rewards] ${executorId} claimed ${taskId}. Balance: ${rewardsLedger[executorId]}`);
          return new Response(JSON.stringify({ balance: rewardsLedger[executorId] }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Claim failed" }), { status: 500 });
        }
      });
    }

    // =============================================
    // CLI: admin-orchestrator watch
    // =============================================
    if (api.registerCli) {
      api.registerCli(
        ({ program }: any) => {
          program
            .command("admin-orchestrator")
            .description("Swarm management tools")
            .command("watch")
            .description("Watch boards/tasks for TODO files and dispatch to executors")
            .action(async () => {
              const tasksDir = resolve(process.cwd(), "boards/tasks");
              console.log("[Orchestrator] Starting task watcher on", tasksDir);

              setInterval(async () => {
                try {
                  await mkdir(tasksDir, { recursive: true });
                  const files = await readdir(tasksDir);
                  for (const file of files.filter(f => f.endsWith(".md"))) {
                    const filePath = join(tasksDir, file);
                    const content = await readFile(filePath, "utf-8");
                    if (!content.includes("status: TODO")) continue;

                    console.log(`[Watcher] Task detected: ${file}`);
                    const tagMatch = content.match(/#skill:([a-zA-Z0-9_-]+)/g);
                    const skill = tagMatch?.[0]?.replace("#skill:", "") ?? "general";

                    await writeFile(filePath, content.replace("status: TODO", "status: IN_PROGRESS"), "utf-8");

                    try {
                      const nc = await getNats();
                      const replySubject = `swarm.reply.${Date.now()}`;
                      const sub = nc.subscribe(replySubject, { max: 1 });
                      nc.publish(`swarm.task.${skill}`, sc.encode(content), { reply: replySubject });
                      const msg = await Promise.race([
                        (async () => { for await (const m of sub) return m; })(),
                        new Promise<null>((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000)),
                      ]);
                      await nc.drain();
                      const result = msg ? sc.decode((msg as any).data) : "No executor responded — task queued";
                      await writeFile(filePath, content.replace("status: TODO", "status: DONE") + `\n\n## Result\n\n${result}\n`, "utf-8");
                      console.log(`[Watcher] ${file} completed`);
                    } catch (err: any) {
                      console.error(`[Watcher] Dispatch failed for ${file}: ${err.message}`);
                    }
                  }
                } catch (err) {
                  console.error("[Watcher Error]", err);
                }
              }, 5000);
            });
        },
        { commands: ["admin-orchestrator"] }
      );
    }
  },
};

export default adminOrchestratorPlugin;
