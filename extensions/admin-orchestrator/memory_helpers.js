const getSlug = (str) => str.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

export async function storeMemoryWithAnything(workspaceName, text, apiKey) {
  try {
    const slug = getSlug(workspaceName);
    // 1. Create workspace if it doesn't exist (ignores error if exists)
    await fetch(`http://localhost:3001/api/v1/workspace/new`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: slug }) // name will be converted to slug
    });

    // 2. Upload document
    const docRes = await fetch(`http://localhost:3001/api/v1/document/raw-text`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ textContent: text, metadata: { title: `Fact-${Date.now()}` } })
    });
    
    if (!docRes.ok) return `Document upload failed: ${await docRes.text()}`;
    const docData = await docRes.json();
    const docPath = docData.documents?.[0]?.location;
    if (!docPath) return `Failed to get document location. response: ${JSON.stringify(docData)}`;

    // 3. Add to workspace
    const updateRes = await fetch(`http://localhost:3001/api/v1/workspace/${slug}/update-embeddings`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ adds: [docPath], deletes: [] })
    });
    
    return updateRes.ok ? `Successfully stored in workspace ${slug}` : `Failed to update workspace embeddings: ${await updateRes.text()}`;
  } catch (e) {
    return e.toString();
  }
}

export async function queryMemoryWithAnything(workspaceName, query, apiKey) {
  try {
    const slug = getSlug(workspaceName);
    const res = await fetch(`http://localhost:3001/api/v1/workspace/${slug}/chat`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: query, mode: "query" })
    });
    
    let text = await res.text();
    if (text.startsWith("<!DOCTYPE html>")) {
      return `Workspace '${slug}' does not seem to exist or AnythingLLM API is returning an HTML error.`;
    }
    
    try {
      const data = JSON.parse(text);
      if (data.error) return `AnythingLLM Error: ${data.error}`;
      return data.textResponse || text;
    } catch (e) {
      return `Non-JSON response: ${text.substring(0,200)}`;
    }
  } catch (e) {
    return e.toString();
  }
}
