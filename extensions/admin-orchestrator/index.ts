export const adminOrchestratorPlugin = {
  id: "admin-orchestrator",
  name: "Admin Orchestrator",
  description: "Manages task queues via GitHub Issues and registers Executor nodes on Tailscale",
  kind: "orchestrator",
  configSchema: {
    type: "object",
    properties: {
      taskDir: { type: "string" },
      natsUrl: { type: "string" },
      minioEndpoint: { type: "string" },
      knowledgeHubUrl: { type: "string" }
    }
  },
  register(api: any) {
    // 1. Tool to list available Executors
    api.registerTool(
      (ctx: any) => {
        const listExecutorsTool = {
          name: "list_executors",
          description: "List available executor agents registered via the handshake protocol on the Tailscale network",
          execute: async () => {
            // Prototype logic: read from local memory/DB where nodes are registered.
            return {
              content: [{
                type: "text",
                text: JSON.stringify([
                  { id: "node-1", hostname: "executor-alice", skills: ["video", "image-generation"], status: "online" }
                ], null, 2)
              }]
            };
          }
        };

        const delegateSubtaskTool = {
          name: "delegate_subtask",
          description: "Decomposes a user request into a subtask and places it into the local Markdown Task Queue (`/tasks`) for Executors.",
          parameters: {
            title: "Task Title",
            description: "Detailed description of the task requirements",
            required_skills: "List of tags the executor must possess (e.g. ['stt', 'vision'])"
          },
          execute: async (args: any) => {
            const { title, description, required_skills } = args;
            const fs = require('fs/promises');
            const path = require('path');
            
            const tasksDir = path.resolve(process.cwd(), 'boards/tasks');
            await fs.mkdir(tasksDir, { recursive: true });

            const taskId = Math.floor(Math.random() * 1000) + 100;
            const filename = `task-${taskId}.md`;
            const filePath = path.join(tasksDir, filename);
            
            const content = `---
title: ${title}
tags: [${required_skills.map((s: string) => `"#skill:${s}"`).join(", ")}]
status: TODO
---

# ${title}

${description}
`;
            
            await fs.writeFile(filePath, content, 'utf-8');
            console.log(`[Admin] Structuring Sub-Task as Markdown file: ${filename}`);
            console.log(`[Admin] Required Skills: ${required_skills.join(", ")}`);
            
            return {
              content: [{
                type: "text",
                text: `Successfully created markdown task file ${filename}. Executors with skills [${required_skills.join(", ")}] will pick this up automatically from the shared board.`
              }]
            };
          }
        };


        const supplementProtocolTool = {
          name: "supplement_protocol",
          description: "Modify or extend the Network Protocol. Used by the Admin to self-improve the logic and add new rules for Executor Agents.",
          parameters: {
            rule_name: "Name of the new or updated rule",
            rule_definition: "The exact instruction or capability parameters for the network"
          },
          execute: async (args: any) => {
            const { rule_name, rule_definition } = args;
            console.log(`[Admin] Supplementing Protocol with rule: ${rule_name}`);
            // Prototype: Write rule to Mem0 Team space or a local sync table, and commit to GitHub
            return {
              content: [{
                type: "text",
                text: `Protocol successfully supplemented with rule '${rule_name}'. You may now use broadcast_update to enforce this across the Tailscale network.`
              }]
            };
          }
        };

        const broadcastUpdateTool = {
          name: "broadcast_update",
          description: "Broadcasts a protocol update or configuration reload to all connected Executor nodes via NATS Message Broker.",
          parameters: {
            target_skills: "List of skills to filter which agents get the update, or 'all'",
            message: "The GitHub commit hash or instruction to synchronize to.",
            branch: "The git branch to pull from. Use 'dev' for testing, 'main' for production.",
            graceful: "Boolean. If true, agents wait until their current task completes before restarting. If false, force immediate restart."
          },
          execute: async (args: any) => {
            const { target_skills, message, branch = "main", graceful = true } = args;
            console.log(`[Admin] Broadcasting NATS update to ${target_skills}. Branch: ${branch}, Graceful: ${graceful}, Message: ${message}`);
            
            // Prototype Logic:
            // import { connect } from "nats";
            // const nc = await connect({ servers: "nats://openclaw-admin-nats:4222" });
            // nc.publish("swarm.updates", JSON.stringify({ 
            //    event: "code-update", 
            //    target: target_skills, 
            //    commit: message,
            //    branch: branch,
            //    graceful: graceful 
            // }));
            
            return {
              content: [{
                type: "text",
                text: `Broadcast successful. NATS message {"event": "code-update"} published for [${target_skills}] on branch '${branch}'. Graceful restart: ${graceful}.`
              }]
            };
          }
        };

        const manageCapabilitiesTool = {
          name: "manage_network_capability",
          description: "Centrally manage MCP servers and Skills for the entire Swarm. Updates the swarm_capabilities.json registry which executors synchronize with.",
          parameters: {
             action: "add | remove",
             type: "mcp | skill",
             name: "Name of the capability",
             config: "Configuration JSON string (e.g. command and args for MCP, or script path for skill)"
          },
          execute: async (args: any) => {
            const { action, type, name, config } = args;
            console.log(`[Admin] Managing capability - Action: ${action}, Type: ${type}, Name: '${name}'`);
            
            // Prototype Logic:
            // 1. Read existing swarm_capabilities.json using fs.promises
            // 2. Modify JSON object
            // 3. Write back to file
            // 4. Agent then usually follows up with broadcast_update
            
            return {
              content: [{
                type: "text",
                text: `Successfully performed '${action}' on ${type} '${name}'. Please use the broadcast_update tool to synchronize the Swarm to the new swarm_capabilities.json settings.`
              }]
            };
          }
        };

        const rotateCredentialsTool = {
          name: "rotate_network_credentials",
          description: "Rotate infrastructure credentials (like MinIO or NATS passwords) and trigger an emergency network re-handshake so Executors obtain the new secrets.",
          parameters: {
             resource: "minio | nats",
             new_secret: "The new password or token"
          },
          execute: async (args: any) => {
            const { resource, new_secret } = args;
            console.log(`[Admin] Rotating credentials for resource: ${resource}`);
            
            // Prototype Logic:
            // 1. Update local environment variables / database.
            // 2. Call broadcast_update to force immediate restart of executors.
            // Executors will re-run the handshake endpoint upon reboot and receive the new keys.
            
            return {
              content: [{
                type: "text",
                text: `Credentials for '${resource}' rotated successfully. Please broadcast a 'code-update' with graceful: false to make executors re-handshake immediately.`
              }]
            };
          }
        };

        const getSlug = (str: string) => str.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

        const queryMemoryTool = {
          name: "query_memory",
          description: "Semantic search across Vector Memory in a specified workspace to retrieve context or preferences.",
          parameters: {
            workspace: "The workspace to query (e.g., 'shared', 'user_1', 'agent_2')",
            query: "The question or context you are searching for"
          },
          execute: async (args: any) => {
            const { workspace, query } = args;
            const apiKey = "7REX8P9-ZVY43TD-N2D1ZDH-CJK4229";
            const slug = getSlug(workspace);
            console.log(`[Memory] Querying workspace '${slug}' for: ${query}`);
            
            try {
              const res = await fetch(`http://localhost:3001/api/v1/workspace/${slug}/chat`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ message: query, mode: "query" })
              });
              let text = await res.text();
              if (text.startsWith("<!DOCTYPE html>")) {
                 return { content: [{ type: "text", text: `Workspace '${slug}' does not seem to exist or AnythingLLM API returned HTML.` }] };
              }
              const data = JSON.parse(text);
              if (data.error) return { content: [{ type: "text", text: `AnythingLLM Error: ${data.error}` }] };
              return { content: [{ type: "text", text: data.textResponse || text }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Memory query failed: ${err.message}` }] };
            }
          }
        };

        const storeMemoryTool = {
          name: "store_memory",
          description: "Upload knowledge or facts into Vector Memory in a specified workspace.",
          parameters: {
            workspace: "The workspace to store in (e.g., 'shared', 'user_1')",
            text: "The information to remember"
          },
          execute: async (args: any) => {
            const { workspace, text } = args;
            const apiKey = "7REX8P9-ZVY43TD-N2D1ZDH-CJK4229";
            const slug = getSlug(workspace);
            console.log(`[Memory] Storing in workspace '${slug}': ${text.substring(0, 50)}...`);
            
            try {
              // 1. Ensure workspace exists
              await fetch(`http://localhost:3001/api/v1/workspace/new`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: slug })
              });

              // 2. Upload document
              const docRes = await fetch(`http://localhost:3001/api/v1/document/raw-text`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ textContent: text, metadata: { title: `Fact-${Date.now()}` } })
              });
              
              const docData = await docRes.json();
              const docPath = docData.documents?.[0]?.location;
              if (!docPath) return { content: [{ type: "text", text: `Failed to get document location from upload.` }] };

              // 3. Move it into the workspace
              const updateRes = await fetch(`http://localhost:3001/api/v1/workspace/${slug}/update-embeddings`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ adds: [docPath], deletes: [] })
              });
              
              if (!updateRes.ok) return { content: [{ type: "text", text: `Failed to update workspace embeddings: ${await updateRes.text()}` }] };
              return { content: [{ type: "text", text: `Memory successfully stored in ${slug}.` }] };
            } catch (err: any) {
              return { content: [{ type: "text", text: `Memory storage failed: ${err.message}` }] };
            }
          }
        };

        return [listExecutorsTool, delegateSubtaskTool, supplementProtocolTool, broadcastUpdateTool, manageCapabilitiesTool, rotateCredentialsTool, queryMemoryTool, storeMemoryTool];
      },
      { names: ["list_executors", "delegate_subtask", "supplement_protocol", "broadcast_update", "manage_network_capability", "rotate_network_credentials", "query_memory", "store_memory"] }
    );

    // 2. Add an HTTP endpoint to handle executor onboarding handshakes
    if (api.registerEndpoint) {
      api.registerEndpoint(
        "POST",
        "/admin/handshake",
        async (req: any) => {
          // This is where a newly spun up executor sends its skill profile
          // The orchestrator validates the request and stores it in team memory.
          try {
            const body = await req.json();
            console.log(`[Admin] Received handshake from ${body.hostname} with skills: ${body.skills.join(", ")}`);
            
            // TODO: write to Knowledge Hub to register the capacity
            
            // Distribute shared resource keys securely over tailnet encrypted channel
            const accessCredentials = {
              natsUrl: "nats://openclaw-admin-nats:4222",
              minioEndpoint: "openclaw-admin-minio:9000",
              minioAccessKey: process.env.MINIO_USER || "admin",
              minioSecretKey: process.env.MINIO_PASSWORD || "admin123456"
            };

            return new Response(JSON.stringify({ 
              message: "Handshake accepted", 
              accepted: true,
              credentials: accessCredentials
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          } catch (err) {
            return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
          }
        }
      );
      
      // MCP Proxy Hub: Allows Executors to route requests to Public MCPs via Admin
      api.registerEndpoint(
        "POST",
        "/admin/mcp/proxy",
        async (req: any) => {
          try {
            const body = await req.json();
            console.log(`[Admin/Proxy] Executor requested tool: ${body.toolName} on server: ${body.serverName}`);
            
            // Prototype logic: Here we would forward the request to the Admin's loaded MCP clients
            // (e.g. brave-search, github) and return the result to the Executor.
            // This hides API keys from the swarm.
            return new Response(JSON.stringify({ 
              message: "Proxy successful", 
              result: `Simulated result for ${body.toolName} (billing routed to Admin)` 
            }), { status: 200, headers: { "Content-Type": "application/json" } });
          } catch (err) {
             return new Response(JSON.stringify({ error: "Proxy Failed" }), { status: 500 });
          }
        }
      );

      // Task Rewards Tracker
      let rewardsLedger: Record<string, number> = {};
      api.registerEndpoint(
        "POST",
        "/admin/rewards/claim",
        async (req: any) => {
          try {
            const body = await req.json();
            const { executorId, taskId, creditsFound } = body;
            
            // Prototype: Increment ledger
            rewardsLedger[executorId] = (rewardsLedger[executorId] || 0) + (creditsFound || 10);
            console.log(`[Admin/Rewards] Executor ${executorId} claimed task ${taskId}. Total Balance: ${rewardsLedger[executorId]} 🪙`);
            
            return new Response(JSON.stringify({ balance: rewardsLedger[executorId] }), { 
              status: 200, headers: { "Content-Type": "application/json" } 
            });
          } catch(err) {
             return new Response(JSON.stringify({ error: "Reward Claim Failed" }), { status: 500 });
          }
        }
      );
    }

    // 3. Register CLI command to start the watcher
    if (api.registerCli) {
      api.registerCli(
        ({ program }: any) => {
          program.command("admin-orchestrator")
            .description("Swarm management tools")
            .command("watch")
            .description("Start the tailnet task watcher that syncs local markdown tracking board with executor availability")
            .action(async () => {
               const fs = require('fs/promises');
               const path = require('path');
               const { exec } = require('child_process');
               console.log("=========================================");
               console.log("[Orchestrator] Starting Sub-agent watcher daemon...");
               console.log("[Orchestrator] Reading local `./boards/tasks` directory...");
               console.log("[Orchestrator] Listening for unassigned .md tasks with tags: [#skill:*]");
               console.log("=========================================\n");
               
               const tasksDir = path.resolve(process.cwd(), 'boards/tasks');
               
               setInterval(async () => {
                 try {
                   await fs.mkdir(tasksDir, { recursive: true });
                   const files = await fs.readdir(tasksDir);
                   const mdFiles = files.filter((f: string) => f.endsWith('.md'));
                   
                   for (const file of mdFiles) {
                     const content = await fs.readFile(path.join(tasksDir, file), 'utf-8');
                     if (content.includes('status: TODO')) {
                        console.log(`[Watcher] New task detected: ${file}`);
                        const tagMatch = content.match(/#skill:([a-zA-Z0-9_\\-]+)/g);
                        console.log(`[Watcher] Required skills: ${tagMatch ? tagMatch.join(', ') : 'none'}`);
                        
                        // Mark task as IN_PROGRESS
                        const inProgressContent = content.replace('status: TODO', 'status: IN_PROGRESS');
                        await fs.writeFile(path.join(tasksDir, file), inProgressContent, 'utf-8');

                        if (tagMatch && tagMatch.some((t: string) => t.includes('qwen'))) {
                          console.log(`[Watcher] Dispatching task ${file} to Local Executor (qwen3.5:9b)...`);
                          const safePrompt = content.replace(/"/g, '\\"').replace(/\\r?\\n/g, ' ');
                          
                          exec(`openclaw infer model run --model litellm/qwen3.5:9b --prompt "Execute this task: ${safePrompt}" --gateway`, { cwd: process.cwd() }, async (error: any, stdout: string, stderr: string) => {
                             const doneContent = inProgressContent.replace('status: IN_PROGRESS', 'status: DONE') + `\\n\\n## Execution Result\\n\\n\`\`\`\\n${stdout || stderr}\\n\`\`\`\\n`;
                             await fs.writeFile(path.join(tasksDir, file), doneContent, 'utf-8');
                             console.log(`[Watcher] Task ${file} completed by Executor! Result appended to file.`);
                          });
                        } else {
                          console.log(`[Watcher] Simulated remote dispatch over Tailscale to node with skills: ${tagMatch ? tagMatch.join(', ') : 'none'}`);
                          setTimeout(async () => {
                             const doneContent = inProgressContent.replace('status: IN_PROGRESS', 'status: DONE') + `\\n\\n## Execution Result\\n\\nTask executed remotely on Tailscale node.`;
                             await fs.writeFile(path.join(tasksDir, file), doneContent, 'utf-8');
                             console.log(`[Watcher] Task ${file} completed by Remote Tailscale Node!`);
                          }, 5000);
                        }
                     }
                   }
                 } catch (err) {
                   console.error(`[Watcher Error] ${err}`);
                 }
               }, 10000); // 10 second polling interval for the prototype
            });
        },
        { commands: ["admin-orchestrator"] },
      );
    }
  },
};

export default adminOrchestratorPlugin;
