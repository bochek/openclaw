import { connect, StringCodec } from "nats";
import { resolve } from "path";

const sc = StringCodec();
const EXECUTOR_ID = process.env.EXECUTOR_ID || `node-${Math.random().toString(36).substring(7)}`;
const SKILLS = (process.env.EXECUTOR_SKILLS || "general").split(",");
const ADMIN_NATS = process.env.ADMIN_NATS_URL || "nats://localhost:4222";
const ADMIN_HANDSHAKE = process.env.ADMIN_HANDSHAKE_URL;

console.log(`[Executor:${EXECUTOR_ID}] Starting with skills: ${SKILLS.join(", ")}`);

async function start() {
  try {
    // 1. Handshake with Admin (get credentials/config)
    if (ADMIN_HANDSHAKE) {
      console.log(`[Handshake] Connecting to ${ADMIN_HANDSHAKE}...`);
      const res = await fetch(ADMIN_HANDSHAKE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executorId: EXECUTOR_ID,
          hostname: process.env.HOSTNAME || "windows-host",
          skills: SKILLS
        })
      });
      if (res.ok) {
        const config = await res.json();
        console.log(`[Handshake] Success! Admin mesh config received.`);
      }
    }

    // 2. Connect to Mesh NATS
    const nc = await connect({ servers: ADMIN_NATS });
    console.log(`[NATS] Connected to ${ADMIN_NATS}`);

    // 3. Subscribe to skills subjects
    SKILLS.forEach(skill => {
      const subject = `swarm.task.${skill.trim()}`;
      const sub = nc.subscribe(subject, { queue: "executor-group" });
      console.log(`[NATS] Subscribed to ${subject}`);

      (async () => {
        for await (const m of sub) {
          const task = JSON.parse(sc.decode(m.data));
          console.log(`[Task] Received: ${task.title || "Untitled"}`);

          try {
            // Simulated execution logic (can call ComfyUI/Whisper here)
            const result = await executeTask(skill, task);
            
            if (m.reply) {
              nc.publish(m.reply, sc.encode(JSON.stringify({
                status: "success",
                result: result,
                executor: EXECUTOR_ID
              })));
            }
          } catch (err) {
            console.error(`[Error] Task failed: ${err.message}`);
            if (m.reply) {
              nc.publish(m.reply, sc.encode(JSON.stringify({ status: "error", error: err.message })));
            }
          }
        }
      })();
    });

    // 4. Heartbeat
    setInterval(() => {
      nc.publish("swarm.heartbeat", sc.encode(JSON.stringify({
        id: EXECUTOR_ID,
        timestamp: new Date().toISOString(),
        load: 0.1 // placeholder
      })));
    }, 10000);

  } catch (err) {
    console.error(`[Fatal] ${err.message}`);
    process.exit(1);
  }
}

async function executeTask(skill, task) {
  // Logic to route to specific containers (ComfyUI, Whisper, etc.)
  console.log(`[Exec] Running ${skill} logic...`);
  
  if (skill === "tts") {
    // Call Piper TTS
    return "Audio generated (simulated)";
  }
  
  if (skill === "stt") {
    // Call Whisper
    return "Text transcribed (simulated)";
  }

  return `Task '${task.title}' processed by skill '${skill}'`;
}

start();
