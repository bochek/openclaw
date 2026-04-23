/**
 * Setup Mesh Memory workspace in AnythingLLM
 * Run this after AnythingLLM is healthy
 */
const RAG_URL = "http://localhost:3001";
const API_KEY = "7REX8P9-ZVY43TD-N2D1ZDH-CJK4229"; // Sync with orchestrator

async function setup() {
  console.log("Waiting for AnythingLLM...");
  
  // Create workspace
  try {
    const res = await fetch(`${RAG_URL}/api/v1/workspace/new`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: "mesh-memory" })
    });
    const data = await res.json();
    console.log("Workspace 'mesh-memory' status:", data);
  } catch (err) {
    console.error("Setup failed (maybe service not ready yet):", err.message);
  }
}

setup();
