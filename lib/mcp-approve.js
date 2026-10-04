#!/usr/bin/env node
// Minimal stdio MCP server used as Claude Code's --permission-prompt-tool for dashboard runs.
// Any tool call outside the run's allowlist lands here; we forward it to the Agentic OS
// server, which shows an approval card in the HUD and holds the request until the user decides.
import http from "node:http";
import readline from "node:readline";

const RUN = process.env.AOS_RUN || "";
const PORT = Number(process.env.AOS_PORT || 3217);

const send = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

// node:http instead of fetch: undici's 5-minute headers timeout would cut long waits short.
function askDashboard(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: "127.0.0.1",
        port: PORT,
        path: "/api/approvals",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "X-Agentic-OS": "1", Host: `127.0.0.1:${PORT}` },
        timeout: 0,
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve({ behavior: "deny", message: "Approval service returned an invalid response." });
          }
        });
      },
    );
    req.on("error", () => resolve({ behavior: "deny", message: "Agentic OS dashboard is not reachable, so this action was not approved." }));
    req.end(body);
  });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "agentic-os-approvals", version: "1.0.0" },
      },
    });
  }
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") {
    return send({
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "approve",
            description: "Ask the user in the Agentic OS dashboard whether a tool call may run.",
            inputSchema: {
              type: "object",
              properties: { tool_name: { type: "string" }, input: { type: "object" }, tool_use_id: { type: "string" } },
              required: ["tool_name", "input"],
            },
          },
        ],
      },
    });
  }
  if (method === "tools/call" && params?.name === "approve") {
    const { tool_name, input } = params.arguments || {};
    const decision = await askDashboard({ run: RUN, tool_name, input });
    const out = decision.behavior === "allow"
      ? { behavior: "allow", updatedInput: input }
      : { behavior: "deny", message: decision.message || "The user denied this action in the dashboard." };
    return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out) }] } });
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method ${method}` } });
});
