#!/usr/bin/env node
/**
 * Claude Code Nested Agent MCP Server
 *
 * This MCP server enables sub-sub-agents in Claude Code by spawning isolated
 * Claude Code processes. Each nested agent has its own context window and
 * full access to all tools including the Task tool.
 *
 * Architecture:
 * - Main Claude Code session connects to this MCP server
 * - When run_nested_agent is called, spawns `claude -p "<prompt>"`
 * - The spawned process has full tool access including Task (AgentTool)
 * - Nested agents can call this MCP server again for unlimited depth
 *
 * This creates true process isolation, solving the "sub-agents can't spawn
 * sub-agents" limitation in native Claude Code.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn, ChildProcess } from "child_process";
import { z } from "zod";

// Input schema for the nested agent tool
const NestedAgentInputSchema = z.object({
  prompt: z.string().describe("The complete task description for the nested agent"),
  cwd: z.string().optional().describe("Working directory for the agent (defaults to current)"),
  timeout: z
    .number()
    .optional()
    .describe("Timeout in milliseconds (default: 300000 = 5 minutes)"),
  env: z
    .record(z.string())
    .optional()
    .describe("Additional environment variables to pass to the nested agent"),
});

type NestedAgentInput = z.infer<typeof NestedAgentInputSchema>;

// Track active processes for cleanup
const activeProcesses = new Set<ChildProcess>();

/**
 * Spawns a nested Claude Code agent and returns its response.
 *
 * This function:
 * 1. Spawns `claude -p "<prompt>"` as a subprocess
 * 2. Captures stdout (the agent's response)
 * 3. Handles timeouts and errors
 * 4. Returns the text response
 *
 * The spawned process has full tool access because it's a fresh Claude Code
 * session, not a sub-agent within an existing session.
 */
async function runNestedAgent(input: NestedAgentInput): Promise<string> {
  const { prompt, cwd, timeout = 300000, env: extraEnv } = input;

  return new Promise((resolve, reject) => {
    const args = ["-p", prompt];

    // Add working directory if specified
    if (cwd) {
      args.push("-c", cwd);
    }

    const proc = spawn("claude", args, {
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        ...extraEnv,
        // Ensure the nested agent doesn't try to use interactive features
        CI: "true",
      },
      stdio: ["pipe", "pipe", "pipe"],
      // Detach so we can kill the entire process tree if needed
      detached: false,
    });

    activeProcesses.add(proc);

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      // Give it a moment to clean up, then force kill
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
      reject(
        new Error(
          `Nested agent timed out after ${timeout}ms. Partial output:\n${stdout.slice(-2000)}`
        )
      );
    }, timeout);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      activeProcesses.delete(proc);

      if (code === 0) {
        resolve(stdout.trim());
      } else if (code === null) {
        // Process was killed (e.g., by timeout)
        reject(new Error(`Nested agent was terminated. Output:\n${stdout.slice(-2000)}`));
      } else {
        reject(
          new Error(
            `Nested agent exited with code ${code}.\nStderr: ${stderr.slice(-1000)}\nStdout: ${stdout.slice(-1000)}`
          )
        );
      }
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      activeProcesses.delete(proc);

      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "Claude CLI not found. Ensure 'claude' is installed and in PATH."
          )
        );
      } else {
        reject(new Error(`Failed to spawn nested agent: ${err.message}`));
      }
    });
  });
}

/**
 * The tool definition exposed via MCP.
 *
 * This matches the behavioral contract of Claude Code's native Task tool:
 * - Stateless: single prompt in, single response out
 * - Isolated: runs in separate context (process in our case)
 * - Returns text: final response as text content
 *
 * The key difference is that THIS tool allows the nested agent to use
 * the Task tool itself, enabling unlimited nesting depth.
 */
const NESTED_AGENT_TOOL = {
  name: "run_nested_agent",
  description: `Launch a nested Claude Code agent with full tool access including the Task tool.

This enables true hierarchical agent delegation where:
- The nested agent runs in a SEPARATE PROCESS with its own 200k token context
- It can spawn its own sub-agents via the Task tool
- Only the final result returns to you (context stays isolated)
- Multiple nested agents can run concurrently for parallel processing

When to use this vs the native Task tool:
- Use Task tool: for simple read-only exploration (faster, lower overhead)
- Use run_nested_agent: when the sub-agent needs to spawn its own sub-agents,
  or when you need complete context isolation for a complex multi-stage task

Usage pattern for multi-level delegation:
1. Call run_nested_agent with a "Task Agent" prompt
2. That Task Agent uses the native Task tool to coordinate specialists
3. Each specialist does focused work
4. Task Agent synthesizes results and returns summary

Example prompt structure:
"You are a Task Agent handling issue #123.
 1. Use Task tool to run a Verify Agent that confirms the issue
 2. Use Task tool to run a Plan Agent that creates implementation plan
 3. Use Task tool to run a Code Agent that implements the solution
 4. Use Task tool to run a Test Agent that verifies the fix
 5. Return a summary: {success: boolean, summary: string}"

Usage notes:
- Provide complete context in the prompt (agent is stateless)
- Agent results are NOT visible to the user - you must summarize
- Default timeout is 5 minutes; increase for complex tasks
- Each nested agent is a fresh Claude session with full capabilities`,
  inputSchema: {
    type: "object" as const,
    properties: {
      prompt: {
        type: "string",
        description:
          "Complete task description for the nested agent. Include all necessary context since the agent is stateless.",
      },
      cwd: {
        type: "string",
        description:
          "Working directory for the agent. Defaults to current directory.",
      },
      timeout: {
        type: "number",
        description:
          "Timeout in milliseconds. Default: 300000 (5 minutes). Increase for complex multi-stage tasks.",
      },
      env: {
        type: "object",
        additionalProperties: { type: "string" },
        description:
          "Additional environment variables to pass to the nested agent.",
      },
    },
    required: ["prompt"],
  },
};

/**
 * Main entry point: starts the MCP server.
 */
async function main(): Promise<void> {
  const server = new Server(
    {
      name: "claude-nested-agent",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handle tools/list request
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [NESTED_AGENT_TOOL],
  }));

  // Handle tools/call request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name !== "run_nested_agent") {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      };
    }

    try {
      // Validate input
      const input = NestedAgentInputSchema.parse(args);

      // Run the nested agent
      const result = await runNestedAgent(input);

      return {
        content: [{ type: "text" as const, text: result }],
      };
    } catch (error) {
      const errorMessage =
        error instanceof z.ZodError
          ? `Invalid input: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
          : error instanceof Error
            ? error.message
            : String(error);

      return {
        isError: true,
        content: [{ type: "text" as const, text: `Error: ${errorMessage}` }],
      };
    }
  });

  // Clean up active processes on exit
  const cleanup = () => {
    for (const proc of activeProcesses) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // Ignore errors during cleanup
      }
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run the server
main().catch((error) => {
  console.error("Failed to start nested agent MCP server:", error);
  process.exit(1);
});
