# Claude Nested Agent Plugin

An MCP server that enables unlimited sub-agent nesting in Claude Code.

## The Problem

Claude Code's native Task tool (`AgentTool`) has a built-in limitation:

```typescript
// From src/tools/AgentTool/prompt.ts
// No recursive agents, yet..
return tools.filter(_ => _.name !== AgentTool.name)
```

Sub-agents cannot spawn their own sub-agents. Maximum nesting depth = 1.

## The Solution

This plugin provides a `run_nested_agent` MCP tool that spawns a **new Claude Code process** for each invocation. Since it's a fresh process:

- It has full access to all tools including the Task tool
- It can spawn its own sub-agents
- It can even call `run_nested_agent` again for unlimited depth

```
Main Agent
  └── run_nested_agent("Task Agent for issue #123")
        └── New Claude Process
              ├── Task("Verify Agent")
              ├── Task("Plan Agent")
              ├── Task("Code Agent")
              └── Returns summary to main agent
```

## Installation

### From npm (when published)

```bash
# Project-level
claude mcp add nested-agent npx @anthropic/claude-nested-agent

# Or global
claude mcp add -g nested-agent npx @anthropic/claude-nested-agent
```

### From source

```bash
cd plugins/nested-agent
npm install
npm run build

# Add to Claude Code
claude mcp add nested-agent node /path/to/plugins/nested-agent/dist/index.js
```

### Manual configuration

Add to `.claude.json`:

```json
{
  "mcpServers": {
    "nested-agent": {
      "type": "stdio",
      "command": "npx",
      "args": ["@anthropic/claude-nested-agent"]
    }
  }
}
```

## Usage

Once installed, you'll have access to `mcp__nested-agent__run_nested_agent` tool.

### Basic Usage

```
Use the run_nested_agent tool to delegate a complex task to an isolated agent.

run_nested_agent({
  prompt: "Search the codebase for all authentication-related code and summarize the auth flow"
})
```

### Multi-Level Delegation

```
run_nested_agent({
  prompt: `You are a Task Agent for implementing feature X.

Your job is to coordinate specialists using the Task tool:

1. Use Task tool with prompt: "You are a Research Agent. Find all files related to [feature area]. Return file paths and brief descriptions."

2. Use Task tool with prompt: "You are a Plan Agent. Given these files: [from step 1], create an implementation plan for [feature]."

3. Use Task tool with prompt: "You are a Code Agent. Implement [specific part] following this plan: [from step 2]."

Return a JSON summary: {
  "success": boolean,
  "filesModified": string[],
  "summary": string
}`
})
```

### Parallel Processing

```
// Launch multiple nested agents concurrently
run_nested_agent({ prompt: "Handle issue GRU-220..." })
run_nested_agent({ prompt: "Handle issue GRU-221..." })
run_nested_agent({ prompt: "Handle issue GRU-222..." })
```

### With Custom Working Directory

```
run_nested_agent({
  prompt: "Analyze the package.json and suggest dependency updates",
  cwd: "/path/to/specific/project"
})
```

### Extended Timeout for Complex Tasks

```
run_nested_agent({
  prompt: "Comprehensive refactoring task...",
  timeout: 600000  // 10 minutes
})
```

## Comparison with Native Task Tool

| Aspect | Native Task Tool | run_nested_agent |
|--------|-----------------|------------------|
| Context isolation | Sidechain logs (same process) | Separate process |
| Tool access | Read-only only | Full (including Task) |
| Nesting depth | 1 level max | Unlimited |
| Overhead | Low | Higher (new process) |
| Use case | Simple exploration | Complex hierarchical delegation |

### When to Use Each

**Use native Task tool when:**
- Simple read-only exploration
- Single-level delegation
- Speed is critical

**Use run_nested_agent when:**
- Nested agents need to spawn sub-agents
- You need complete context isolation
- Complex multi-stage workflows
- Each stage might use >50k tokens

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Main Claude Code Session                │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  MCP Connection to nested-agent server          │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │  run_nested_agent(prompt)                       │    │
│  │                                                 │    │
│  │  → spawns: claude -p "<prompt>"                 │    │
│  │  → waits for completion                         │    │
│  │  → returns stdout                               │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              New Claude Code Process                     │
│                                                          │
│  • Has full 200k token context                          │
│  • Has access to ALL tools including Task               │
│  • Can call run_nested_agent again                      │
│  • Completely isolated from parent                       │
│                                                          │
│  ┌──────────────────┐  ┌──────────────────┐             │
│  │   Task(Agent1)   │  │   Task(Agent2)   │             │
│  └──────────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────┘
```

## Behavioral Consistency

This plugin maintains behavioral consistency with the native Task tool:

- **Stateless**: Single prompt in, single response out
- **Isolated**: Results don't contaminate parent context
- **Text return**: Final response as text content
- **User invisible**: Results not shown to user; parent must summarize

The key difference is intentional: nested agents have full tool access to enable hierarchical delegation.

## Limitations

1. **Process overhead**: Each nested agent spawns a new Node.js process (~100ms startup)
2. **No shared state**: Communication only through prompt/response and filesystem
3. **No streaming progress**: Parent sees only the final result (not intermediate tool calls)
4. **Same rate limits**: Nested processes share API quota with parent

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test locally
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

## License

MIT
