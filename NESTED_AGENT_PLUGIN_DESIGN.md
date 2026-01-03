# Claude Code Nested Agent Plugin Design

## Executive Summary

This document describes how to build a Claude Code plugin that enables **sub-sub-agents** (unlimited agent nesting depth) while maintaining behavioral consistency with the native Task tool.

## 1. Problem Analysis

### 1.1 The Blocking Mechanism

In `src/tools/AgentTool/prompt.ts:14-17`, Claude Code explicitly prevents sub-agents from spawning their own sub-agents:

```typescript
export async function getAgentTools(
  dangerouslySkipPermissions: boolean,
): Promise<Tool[]> {
  // No recursive agents, yet..
  return (
    await (dangerouslySkipPermissions ? getTools() : getReadOnlyTools())
  ).filter(_ => _.name !== AgentTool.name)  // <-- AgentTool filtered out
}
```

**Consequence**: Sub-agents cannot call the Task tool. Maximum nesting depth = 1.

### 1.2 Why This Matters for Orchestration

For complex workflows (like issue processing with Verify → Plan → Code → Test → QA stages), you want:
- Main orchestrator with minimal context (~5k tokens per issue)
- Task Agent per issue with full context (~150k tokens, isolated)
- Specialists within Task Agent (each with their own context)

Current architecture forces all specialist context back into the main agent, causing context exhaustion.

## 2. Solution Architecture

### 2.1 Key Insight: Claude Code is Already an MCP Server

From `src/entrypoints/mcp.ts:39-48`:

```typescript
const MCP_TOOLS: Tool[] = [
  AgentTool,  // <-- The Task tool is exposed via MCP!
  BashTool,
  FileEditTool,
  FileReadTool,
  GlobTool,
  GrepTool,
  FileWriteTool,
  LSTool,
]
```

When you run `claude mcp serve`, Claude Code exposes its full toolset including AgentTool as an MCP server.

### 2.2 The Solution: MCP-Based Process Boundary

Create an MCP server that:
1. Exposes a `run_nested_agent` tool
2. Spawns a new Claude Code process per invocation
3. That process has full Task tool access
4. Results return through MCP

```
Main Claude Code Session
  └── MCP Tool: run_nested_agent(prompt)
        └── New Claude Code Process (spawned via `claude -p`)
              └── Task Tool (AgentTool) available
                    └── Sub-agent
                          └── (Can call MCP again for deeper nesting)
```

**This creates true process isolation with unlimited nesting depth.**

## 3. Implementation

### 3.1 Core Mechanism: How It Works

The native Task tool (`AgentTool`) works like this (from `AgentTool.tsx:45-185`):

1. Creates isolated message history via sidechain logs
2. Runs full query loop with filtered tool access
3. Returns only final text content to parent

Our nested agent tool will:

1. Spawn `claude -p "<prompt>"` subprocess
2. Capture stdout (the response)
3. Return response to caller

This preserves the exact same contract as the native Task tool.

### 3.2 MCP Server Implementation

```typescript
// nested-agent-mcp-server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "child_process";
import { z } from "zod";

const NestedAgentInputSchema = z.object({
  prompt: z.string().describe("The task for the nested agent to perform"),
  cwd: z.string().optional().describe("Working directory for the agent"),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 300000)"),
});

type NestedAgentInput = z.infer<typeof NestedAgentInputSchema>;

async function runNestedAgent(input: NestedAgentInput): Promise<string> {
  const { prompt, cwd, timeout = 300000 } = input;

  return new Promise((resolve, reject) => {
    const args = ["-p", prompt];
    if (cwd) {
      args.push("-c", cwd);
    }

    const proc = spawn("claude", args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Nested agent timed out after ${timeout}ms`));
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Nested agent failed with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  const server = new Server(
    { name: "nested-agent", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler({ method: "tools/list" }, async () => ({
    tools: [
      {
        name: "run_nested_agent",
        description: `Launch a nested Claude Code agent that has full access to all tools including the Task tool.

This enables true hierarchical agent delegation where:
- The nested agent runs in a separate process with its own context
- It can spawn its own sub-agents via the Task tool
- Only the final result returns to you

Use this when you need multi-level agent delegation, such as:
- A Task Agent that needs to coordinate multiple specialists
- Complex workflows requiring isolated context per stage
- Deep agent hierarchies for divide-and-conquer strategies

Usage notes:
1. The nested agent is stateless - provide complete context in the prompt
2. Results are not visible to the user - summarize important findings
3. Multiple nested agents can run concurrently for parallel processing`,
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Complete task description for the nested agent",
            },
            cwd: {
              type: "string",
              description: "Working directory (defaults to current)",
            },
            timeout: {
              type: "number",
              description: "Timeout in ms (default: 300000 = 5 min)",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  }));

  server.setRequestHandler({ method: "tools/call" }, async (request) => {
    const { name, arguments: args } = request.params;

    if (name !== "run_nested_agent") {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      const input = NestedAgentInputSchema.parse(args);
      const result = await runNestedAgent(input);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
```

### 3.3 Plugin Package Structure

```
claude-nested-agent-plugin/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts          # MCP server implementation
├── dist/
│   └── index.js          # Compiled output
└── README.md
```

**package.json:**
```json
{
  "name": "@your-org/claude-nested-agent",
  "version": "1.0.0",
  "description": "MCP server enabling sub-sub-agents in Claude Code",
  "main": "dist/index.js",
  "bin": {
    "claude-nested-agent": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 3.4 Installation

Add to Claude Code config:

```bash
# Project-level
claude mcp add nested-agent npx @your-org/claude-nested-agent

# Or global
claude mcp add -g nested-agent npx @your-org/claude-nested-agent
```

Or in `.claude.json`:
```json
{
  "mcpServers": {
    "nested-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@your-org/claude-nested-agent"]
    }
  }
}
```

## 4. Behavioral Consistency with Native Task Tool

### 4.1 What the Native Task Tool Does

From `AgentTool.tsx`:

| Aspect | Native Behavior |
|--------|-----------------|
| **Context isolation** | Via sidechain message logs |
| **Tool access** | Read-only tools only (unless `dangerouslySkipPermissions`) |
| **Return format** | Text blocks from final assistant message |
| **User visibility** | Results NOT shown to user; parent must summarize |
| **Statefulness** | Stateless - single prompt in, single response out |
| **Progress** | Yields progress messages during execution |

### 4.2 How Our Plugin Matches

| Aspect | Our Implementation |
|--------|-------------------|
| **Context isolation** | ✅ Process boundary = complete isolation |
| **Tool access** | ✅ Full tools (including Task) by design |
| **Return format** | ✅ stdout from `claude -p` = text response |
| **User visibility** | ✅ Subprocess output not shown to parent's user |
| **Statefulness** | ✅ New process per call = stateless |
| **Progress** | ⚠️ No streaming progress (enhancement opportunity) |

### 4.3 Key Difference: Tool Access

The native Task tool restricts sub-agents to read-only tools. Our plugin intentionally provides full tool access because:

1. **That's the point** - enabling true hierarchical delegation
2. **Security model** - each nested process inherits the same permission system
3. **User expectation** - if using this plugin, user wants deep nesting

## 5. Advanced: Streaming Progress

For long-running nested agents, you may want streaming progress. This requires:

1. Using `claude` with a pseudo-TTY to get interactive output
2. Parsing progress markers from output
3. Yielding progress via MCP streaming

```typescript
// Advanced: with progress streaming
import { spawn } from "node-pty"; // npm install node-pty

async function* runNestedAgentWithProgress(input: NestedAgentInput) {
  const pty = spawn("claude", ["-p", input.prompt], {
    cwd: input.cwd || process.cwd(),
  });

  let buffer = "";

  for await (const data of pty) {
    buffer += data;
    // Parse and yield progress
    if (buffer.includes("[Tool:")) {
      yield { type: "progress", content: buffer };
      buffer = "";
    }
  }

  yield { type: "result", content: buffer };
}
```

## 6. Usage Patterns

### 6.1 Two-Level Delegation (Task Agent with Specialists)

```
Main Agent
  └── mcp__nested-agent__run_nested_agent(
        "You are a Task Agent for issue GRU-220.
         Use the Task tool to delegate to specialists:
         1. Call Task with Verify Agent prompt
         2. Call Task with Plan Agent prompt
         3. Call Task with Code Agent prompt
         4. Return summary of all work done"
      )
        └── New Claude Process
              ├── Task(Verify Agent)
              ├── Task(Plan Agent)
              └── Task(Code Agent)
```

### 6.2 Unlimited Depth (Recursive Decomposition)

```
Main Agent
  └── run_nested_agent("Solve complex problem X")
        └── Process 1
              ├── Task("Analyze subproblem A")
              └── run_nested_agent("Solve subproblem B")
                    └── Process 2
                          ├── Task("Handle B.1")
                          └── Task("Handle B.2")
```

### 6.3 Parallel Task Agents

```
Main Agent
  ├── run_nested_agent("Handle issue GRU-220")  ─┐
  ├── run_nested_agent("Handle issue GRU-221")  ─┼── Concurrent
  └── run_nested_agent("Handle issue GRU-222")  ─┘
```

## 7. Comparison with Alternatives

| Approach | Process Isolation | Nesting Depth | Native Feel | Complexity |
|----------|------------------|---------------|-------------|------------|
| **MCP nested agent (this)** | ✅ Full | ∞ Unlimited | ✅ High | Low |
| Hooks + Skills | ❌ Same process | 1 | ✅ High | Medium |
| External Orchestrator | ✅ Full | ∞ Unlimited | ❌ Low | High |
| Agents SDK | ✅ Full | ∞ Unlimited | ❌ Rebuild | Very High |

## 8. Limitations and Considerations

### 8.1 Subprocess Overhead
Each nested agent spawns a new Node.js process. For very frequent/small tasks, this adds latency. Mitigate by:
- Batching small tasks into one nested agent call
- Using native Task tool for simple delegation
- Reserving nested agents for true isolation needs

### 8.2 No Shared State
Nested processes don't share in-memory state. State must flow through:
- File system (JSON state files)
- The prompt/response content
- External services (databases, APIs)

### 8.3 Permission Inheritance
Nested processes inherit environment including API keys and permissions. This is by design but means:
- Same rate limits apply
- Same permission prompts may appear
- Use `--dangerously-skip-permissions` carefully

## 9. Summary

This plugin enables true hierarchical agent delegation in Claude Code by using MCP to spawn isolated Claude Code processes. It:

1. **Solves the sub-sub-agent blocker** - unlimited nesting via process boundaries
2. **Maintains behavioral consistency** - same contract as native Task tool
3. **Enables context isolation** - each nested agent has its own 200k token window
4. **Preserves user experience** - works like native tools, discoverable via `/tools`

The key insight is leveraging Claude Code's existing architecture (MCP server capability + headless mode) rather than fighting against its constraints.
