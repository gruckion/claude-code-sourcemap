# Claude Code 2.1.0 Feature Implementation Guide

This document explains how each feature in Claude Code 2.1.0 is implemented, with readable code explanations derived from the minified source.

---

## 1. Automatic Skill Hot-Reload

**Feature:** Skills created or modified in `~/.claude/skills` or `.claude/skills` are immediately available without restarting.

**Implementation:** Uses `chokidar` file watcher to monitor skill directories.

```javascript
// Skill watcher initialization
async function initializeSkillWatcher() {
    if (watcherInitialized || watcherDisposed) return;
    watcherInitialized = true;

    const skillDirectories = await getSkillDirectories();
    if (skillDirectories.length === 0) return;

    console.debug(`Watching for changes in skill directories: ${skillDirectories.join(", ")}...`);

    // Create chokidar watcher with debouncing for file stability
    skillFileWatcher = chokidar.watch(skillDirectories, {
        persistent: true,
        ignoreInitial: true,
        depth: 2,
        awaitWriteFinish: {
            stabilityThreshold: 1000,  // Wait 1 second for file to stabilize
            pollInterval: 500
        },
        ignored: (path) => path.split(path.sep).some(part => part === ".git"),
        ignorePermissionErrors: true,
        usePolling: false,
        atomic: true
    });

    // Register event handlers
    skillFileWatcher.on("add", handleSkillChange);
    skillFileWatcher.on("change", handleSkillChange);
    skillFileWatcher.on("unlink", handleSkillChange);
}

function handleSkillChange(filePath) {
    console.debug(`Detected skill change: ${filePath}`);

    // Clear caches and reload
    clearSkillCache();
    refreshSkills();
    refreshPromptIndex();

    // Notify all subscribers
    changeSubscribers.forEach(callback => callback());
}

// Get skill directories to watch
async function getSkillDirectories() {
    const fs = getFileSystem();
    const directories = [];

    // User settings: ~/.claude/skills
    const userSkillsDir = path.join(getHomeDir(), "skills");
    try {
        await fs.stat(userSkillsDir);
        directories.push(userSkillsDir);
    } catch {}

    // Project settings: .claude/skills
    const projectSkillsDir = ".claude/skills";
    try {
        const resolved = path.resolve(projectSkillsDir);
        await fs.stat(resolved);
        directories.push(resolved);
    } catch {}

    return directories;
}
```

---

## 2. Context Fork for Skills and Slash Commands

**Feature:** Run skills/commands in a forked sub-agent context using `context: fork` in frontmatter.

**Implementation:** When `forkContext` is true, the agent receives the full conversation context.

```javascript
// Parse agent file with forkContext support
function parseAgentFromFile(filePath, baseDir) {
    const { frontmatter, content } = parseFrontmatter(fileContent);

    const { color, model, forkContext } = frontmatter;

    // Validate forkContext value
    if (forkContext !== undefined && forkContext !== "true" && forkContext !== "false") {
        console.warn(`Agent file ${filePath} has invalid forkContext value '${forkContext}'`);
    }

    const shouldForkContext = forkContext === "true";

    // Agents with forkContext must use inherit model to avoid context length mismatch
    if (shouldForkContext && model !== "inherit") {
        console.warn(`Agent with forkContext must use model: inherit`);
        model = "inherit";
    }

    return {
        agentType: name,
        whenToUse: description,
        forkContext: shouldForkContext,
        // ... other properties
    };
}

// When executing an agent with forkContext
async function* executeAgent({ agentDefinition, promptMessages, toolUseContext }) {
    // If agent has forkContext, pass the full conversation history
    const forkContextMessages = agentDefinition?.forkContext
        ? toolUseContext.messages
        : undefined;

    // Transform messages for forked context
    const messages = agentDefinition?.forkContext
        ? transformMessagesForFork(prompt, input)
        : [createUserMessage({ content: prompt })];

    yield* runAgentLoop({
        agentDefinition,
        promptMessages: messages,
        forkContextMessages,
        // ...
    });
}
```

---

## 3. Agent Field in Skills

**Feature:** Specify agent type for skill execution using `agent` field in frontmatter.

```javascript
// Skill frontmatter parsing with agent support
function parseSkillFrontmatter(frontmatter, skillName) {
    const {
        description,
        "allowed-tools": allowedTools,
        "user-invocable": userInvocable,
        "disable-model-invocation": disableModelInvocation,
        model,
        context,  // "fork" for forked context
        agent,    // Agent type to use for execution
        hooks
    } = frontmatter;

    return {
        name: skillName,
        description: description ?? getDefaultDescription(content, "Skill"),
        allowedTools: parseToolsList(allowedTools),
        userInvocable: userInvocable === undefined ? true : parseBoolean(userInvocable),
        disableModelInvocation: parseBoolean(disableModelInvocation),
        model: model === "inherit" ? undefined : model,
        executionContext: context === "fork" ? "fork" : undefined,
        agent: agent,  // e.g., "Explore", "Plan", or custom agent name
        hooks: parseHooks(frontmatter, skillName)
    };
}
```

---

## 4. Language Setting

**Feature:** Configure Claude's response language (e.g., `language: "japanese"`).

```javascript
// Settings schema with language support
const settingsSchema = z.object({
    // ... other settings
    language: z.string().optional().describe(
        'Preferred language for Claude responses (e.g., "japanese", "spanish")'
    ),
    // ...
});

// Applied in system prompt generation
async function generateSystemPrompt(tools, options) {
    const config = getConfig();
    const language = config.language;

    const languageInstruction = language
        ? `\n\nIMPORTANT: Respond in ${language} unless the user explicitly requests otherwise.`
        : "";

    return [
        baseSystemPrompt,
        languageInstruction,
        // ... other prompt parts
    ].join("\n");
}
```

---

## 5. Shift+Enter Terminal Improvements

**Feature:** Works out of the box in iTerm2, WezTerm, Ghostty, and Kitty without config changes.

```javascript
// Terminal detection and capabilities
const TERMINALS_WITH_NATIVE_SHIFT_ENTER = ["iTerm.app", "kitty", "WezTerm", "ghostty"];

function detectTerminal() {
    if (process.env.TERM === "xterm-ghostty") return "ghostty";
    if (process.env.TERM?.includes("kitty")) return "kitty";
    if (process.env.TERM_PROGRAM) return process.env.TERM_PROGRAM;
    // ... other detection logic
}

// Terminal setup message
function getTerminalSetupMessage() {
    const supportedTerminals = Object.entries({
        ghostty: "Ghostty",
        kitty: "Kitty",
        "iTerm.app": "iTerm2",
        WezTerm: "WezTerm"
    });

    return `Note: iTerm2, WezTerm, Ghostty, and Kitty support Shift+Enter natively.`;
}

// Keyboard mode handling for different terminals
function supportsKeyboardProtocol() {
    if (process.env.TERM?.includes("kitty")) return true;

    const version = parseVersion(process.env.TERM_PROGRAM_VERSION);
    if (!version) return false;

    switch (process.env.TERM_PROGRAM) {
        case "ghostty": return semver.gte(version, "1.2.0");
        case "iTerm.app": return semver.gte(version, "3.6.6");
        default: return false;
    }
}
```

---

## 6. respectGitignore Setting

**Feature:** Per-project control over @-mention file picker behavior.

```javascript
// Default settings with respectGitignore
const defaultSettings = {
    // ... other defaults
    respectGitignore: true
};

// Settings schema
const settingsSchema = z.object({
    respectGitignore: z.boolean().optional().describe(
        "Whether file picker should respect .gitignore files (default: true). " +
        "Note: .ignore files are always respected."
    ),
    // ...
});

// File indexing with gitignore support
async function getProjectFiles(signal, respectGitignore) {
    console.debug(`[FileIndex] getProjectFiles called, respectGitignore=${respectGitignore}`);

    // Try git ls-files first (respects .gitignore by default)
    const gitFiles = await getGitTrackedFiles(signal, respectGitignore);
    if (gitFiles !== null) {
        console.debug(`[FileIndex] using git ls-files result (${gitFiles.length} files)`);
        return gitFiles;
    }

    // Fallback to ripgrep with gitignore awareness
    console.debug("[FileIndex] git ls-files returned null, falling back to ripgrep");
    return await ripgrepFiles(signal, respectGitignore);
}

// Settings menu item
const respectGitignoreMenuItem = {
    id: "respectGitignore",
    label: "Respect .gitignore in file picker",
    value: settings.respectGitignore,
    type: "boolean",
    onChange(value) {
        updateAppState(state => ({ ...state, respectGitignore: value }));
        saveSettings({ ...getSettings(), respectGitignore: value });
        logEvent("tengu_respect_gitignore_setting_changed", { value });
    }
};
```

---

## 7. IS_DEMO Environment Variable

**Feature:** Hide email and organization from UI for streaming/recording.

```javascript
// Check if demo mode is enabled
function shouldShowOnboarding() {
    if (isHeadless() || getSettings().projectOnboardingSeenCount >= 4 || process.env.IS_DEMO) {
        return false;
    }
    return true;
}

// Hide organization info in demo mode
function renderHeader() {
    const { oauthAccount } = getAppState();

    // Don't show organization in demo mode
    const showOrg = !process.env.IS_DEMO && oauthAccount?.organizationName;

    return (
        <Box>
            {showOrg && (
                <Text dimColor>Message from {oauthAccount.organizationName}:</Text>
            )}
        </Box>
    );
}

// Status display with demo mode filtering
function getStatusItems() {
    const config = getConfig();
    const items = [];

    if (config.apiKeySource) {
        items.push({ label: "API key", value: config.apiKeySource });
    }

    // Hide sensitive info in demo mode
    if (config.organization && !process.env.IS_DEMO) {
        items.push({ label: "Organization", value: config.organization });
    }
    if (config.email && !process.env.IS_DEMO) {
        items.push({ label: "Email", value: config.email });
    }

    return items;
}
```

---

## 8. Wildcard Pattern Matching for Bash Permissions

**Feature:** Use `*` at any position in Bash permission rules (e.g., `Bash(npm *)`, `Bash(* install)`).

```javascript
// Permission rule validation with wildcard support
function validatePermissionRule(rule) {
    if (isBashTool(rule.toolName) && rule.ruleContent !== undefined) {
        const content = rule.ruleContent;

        // Legacy :* prefix matching must be at end
        if (content.includes(":*") && !content.endsWith(":*")) {
            return {
                valid: false,
                error: "The :* pattern must be at the end",
                suggestion: "Move :* to the end for prefix matching, or use * for wildcard matching",
                examples: [
                    "Bash(npm run:*) - prefix matching (legacy)",
                    "Bash(npm run *) - wildcard matching"
                ]
            };
        }

        // Empty prefix not allowed
        if (content === ":*") {
            return {
                valid: false,
                error: "Prefix cannot be empty before :*",
                suggestion: "Specify a command prefix before :*",
                examples: ["Bash(npm:*)", "Bash(git:*)"]
            };
        }

        // Bare * requires removing parentheses
        if (content === "*") {
            return {
                valid: false,
                error: 'Use "Bash" without parentheses to allow all commands',
                suggestion: "Remove the parentheses or specify a command pattern",
                examples: ["Bash", "Bash(npm:*)", "Bash(npm *)"]
            };
        }
    }

    return { valid: true };
}

// Pattern matching for wildcard rules
function matchesWildcardPattern(command, pattern) {
    // Convert pattern with * to regex
    // e.g., "npm *" becomes /^npm .*$/
    // e.g., "* install" becomes /^.* install$/
    const regexPattern = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape special chars
        .replace(/\\\*/g, '.*');                   // Convert * to .*

    return new RegExp(`^${regexPattern}$`).test(command);
}
```

---

## 9. Unified Ctrl+B Backgrounding

**Feature:** Ctrl+B backgrounds all running foreground tasks (bash commands and agents) simultaneously.

```javascript
// Ctrl+B handler for unified backgrounding
function BackgroundHint({ onBackground } = {}) {
    const [appState, setAppState] = useState();
    const appStateRef = useRef(appState);
    appStateRef.current = appState;

    // Register Ctrl+B key handler
    useKeyHandler((key, modifiers) => {
        if (key === "b" && modifiers.ctrl) {
            backgroundAllTasks(() => appStateRef.current, setAppState);
            onBackground?.();
        }
    });

    // Show appropriate hint based on terminal
    const shortcut = terminal === "tmux" ? "ctrl+b ctrl+b (twice)" : "ctrl+b";

    return (
        <Box paddingLeft={5}>
            <Text dimColor>
                <Shortcut shortcut={shortcut} action="run in background" />
            </Text>
        </Box>
    );
}

// Background all running tasks
function backgroundAllTasks(getState, setState) {
    const state = getState();

    // Background running bash commands
    if (state.runningBashCommand) {
        state.runningBashCommand.moveToBackground();
    }

    // Background running agents
    if (state.runningAgent) {
        state.runningAgent.moveToBackground();
    }

    setState(prev => ({
        ...prev,
        backgroundedByUser: true
    }));
}

// Bash tool output schema includes backgrounding info
const bashOutputSchema = z.object({
    stdout: z.string(),
    stderr: z.string(),
    backgroundTaskId: z.string().optional(),
    backgroundedByUser: z.boolean().optional().describe(
        "True if the user manually backgrounded the command with Ctrl+B"
    ),
    // ...
});
```

---

## 10. MCP list_changed Notifications

**Feature:** MCP servers can dynamically update tools, prompts, and resources without reconnection.

```javascript
// MCP notification schemas
const toolsListChangedNotification = z.object({
    method: z.literal("notifications/tools/list_changed")
});

const promptsListChangedNotification = z.object({
    method: z.literal("notifications/prompts/list_changed")
});

const resourcesListChangedNotification = z.object({
    method: z.literal("notifications/resources/list_changed")
});

// Register notification handlers when connecting to MCP server
function setupMCPConnection(server) {
    const { client, capabilities } = server;

    // Handle tools list changes
    if (capabilities?.tools?.listChanged) {
        client.setNotificationHandler(toolsListChangedNotification, async () => {
            console.debug(server.name, "Received tools/list_changed notification, refreshing tools");
            logEvent("tengu_mcp_list_changed", { type: "tools" });

            try {
                // Clear cache and refresh
                toolsCache.delete(server);
                const newTools = await fetchMCPTools(server);
                updateServerTools(server, newTools);
            } catch (error) {
                console.error(server.name,
                    `Failed to refresh tools after list_changed notification: ${error.message}`);
            }
        });
    }

    // Handle prompts list changes
    if (capabilities?.prompts?.listChanged) {
        client.setNotificationHandler(promptsListChangedNotification, async () => {
            console.debug(server.name, "Received prompts/list_changed notification, refreshing prompts");
            logEvent("tengu_mcp_list_changed", { type: "prompts" });

            try {
                promptsCache.delete(server);
                const newPrompts = await fetchMCPPrompts(server);
                updateServerPrompts(server, newPrompts);
            } catch (error) {
                console.error(server.name,
                    `Failed to refresh prompts after list_changed notification: ${error.message}`);
            }
        });
    }

    // Handle resources list changes
    if (capabilities?.resources?.listChanged) {
        client.setNotificationHandler(resourcesListChangedNotification, async () => {
            console.debug(server.name, "Received resources/list_changed notification, refreshing resources");
            logEvent("tengu_mcp_list_changed", { type: "resources" });

            try {
                resourcesCache.delete(server);
                const newResources = await fetchMCPResources(server);
                updateServerResources(server, newResources);
            } catch (error) {
                console.error(server.name,
                    `Failed to refresh resources after list_changed notification: ${error.message}`);
            }
        });
    }
}
```

---

## 11. Disabling Specific Agents with Task(AgentName)

**Feature:** Disable specific agents using `Task(AgentName)` syntax in settings or CLI.

```javascript
// Built-in agents with disallowedTools
const exploreAgent = {
    agentType: "Explore",
    whenToUse: "Fast agent specialized for exploring codebases...",
    // These tools are NOT available to the Explore agent
    disallowedTools: [TASK_TOOL, WRITE_TOOL, EDIT_TOOL, NOTEBOOK_EDIT_TOOL, MULTI_EDIT_TOOL],
    source: "built-in",
    baseDir: "built-in",
    model: "haiku",
    getSystemPrompt: () => exploreSystemPrompt,
    criticalSystemReminder_EXPERIMENTAL: "CRITICAL: This is a READ-ONLY task."
};

// Parse agent definition with disallowedTools
function parseAgentDefinition(name, frontmatter, source = "flagSettings") {
    const parsed = agentSchema.parse(frontmatter);

    return {
        agentType: name,
        whenToUse: parsed.description,
        tools: parseToolsList(parsed.tools),
        disallowedTools: parsed.disallowedTools !== undefined
            ? parseToolsList(parsed.disallowedTools)
            : undefined,
        getSystemPrompt: () => parsed.prompt,
        source,
        model: parsed.model,
        permissionMode: parsed.permissionMode
    };
}

// Agent schema with disallowedTools
const agentSchema = z.object({
    description: z.string().min(1, "Description cannot be empty"),
    tools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    prompt: z.string().min(1, "Prompt cannot be empty"),
    model: z.enum(["sonnet", "opus", "haiku", "inherit"]).optional(),
    permissionMode: z.enum(["default", "plan", "bypassPermissions"]).optional(),
    mcpServers: z.array(mcpServerSchema).optional(),
    hooks: z.lazy(() => hooksSchema).optional()
});

// Filter available agents based on disallowed list
function getAvailableAgents(allAgents, disallowedAgentPatterns) {
    const disallowed = new Set(
        disallowedAgentPatterns?.map(pattern => {
            const { toolName } = parseToolPattern(pattern);
            return toolName;
        })
    );

    return allAgents.filter(agent => !disallowed.has(agent.agentType));
}
```

---

## 12. Hooks Support in Agent/Skill Frontmatter

**Feature:** Define PreToolUse, PostToolUse, and Stop hooks scoped to agent/skill lifecycle.

```javascript
// Hook types supported in frontmatter
const HOOK_TYPES = [
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "Notification",
    "UserPromptSubmit",
    "SessionStart",
    "SessionEnd",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
    "PermissionRequest"
];

// Hook definition schemas
const commandHookSchema = z.object({
    type: z.literal("command").describe("Bash command hook type"),
    command: z.string().describe("Shell command to execute"),
    timeout: z.number().positive().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional().describe("If true, hook runs once and is removed after execution")
});

const promptHookSchema = z.object({
    type: z.literal("prompt").describe("LLM prompt hook type"),
    prompt: z.string().describe("Prompt to evaluate with LLM. Use $ARGUMENTS placeholder for hook input."),
    timeout: z.number().positive().optional(),
    model: z.string().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional()
});

const agentHookSchema = z.object({
    type: z.literal("agent").describe("Agentic verifier hook type"),
    prompt: z.string().describe("Prompt describing what to verify"),
    timeout: z.number().positive().optional(),
    model: z.string().optional(),
    statusMessage: z.string().optional(),
    once: z.boolean().optional()
});

// Parse hooks from skill/agent frontmatter
function parseHooksFromFrontmatter(frontmatter, sourceName) {
    if (!frontmatter.hooks) return undefined;

    const hooks = {};

    for (const [hookType, hookDefinitions] of Object.entries(frontmatter.hooks)) {
        if (!HOOK_TYPES.includes(hookType)) {
            console.warn(`Unknown hook type '${hookType}' in ${sourceName}`);
            continue;
        }

        hooks[hookType] = hookDefinitions.map(def => ({
            matcher: def.matcher,
            hooks: def.hooks.map(hook => {
                switch (hook.type) {
                    case "command": return commandHookSchema.parse(hook);
                    case "prompt": return promptHookSchema.parse(hook);
                    case "agent": return agentHookSchema.parse(hook);
                }
            })
        }));
    }

    return hooks;
}

// Register hooks from agent definition
function registerAgentHooks(agentDefinition) {
    if (!agentDefinition.hooks) return;

    for (const [hookType, matchers] of Object.entries(agentDefinition.hooks)) {
        for (const { matcher, hooks } of matchers) {
            for (const hook of hooks) {
                registerHook(hookType, {
                    ...hook,
                    matcher,
                    source: agentDefinition.agentType,
                    isAgentScoped: true
                });
            }
        }
    }
}
```

---

## 13. once: true Config for Hooks

**Feature:** Hooks can run once and be automatically removed after execution.

```javascript
// Hook schema with once support
const hookSchema = z.object({
    type: z.enum(["command", "prompt", "agent"]),
    // ... other fields
    once: z.boolean().optional().describe("If true, hook runs once and is removed after execution")
});

// Execute hook with once handling
async function executeHook(hook, hookType, context) {
    try {
        const result = await runHookCommand(hook, context);

        // If hook has once: true, unregister it after successful execution
        if (hook.once) {
            unregisterHook(hookType, hook);
            console.debug(`Hook with once:true executed and removed`);
        }

        return result;
    } catch (error) {
        // Don't remove hook on failure
        throw error;
    }
}

// Unregister a specific hook
function unregisterHook(hookType, hookToRemove) {
    const registeredHooks = getRegisteredHooks();
    if (!registeredHooks || !registeredHooks[hookType]) return;

    registeredHooks[hookType] = registeredHooks[hookType].filter(
        hook => hook !== hookToRemove
    );

    if (registeredHooks[hookType].length === 0) {
        delete registeredHooks[hookType];
    }
}
```

---

## 14. CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS

**Feature:** Environment variable to override default file read token limit.

```javascript
// Default token limit for file reads
const DEFAULT_FILE_READ_MAX_TOKENS = 30000;  // hn8 in minified code

function getFileReadMaxOutputTokens() {
    const envValue = process.env.CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS;

    if (envValue) {
        const parsed = parseInt(envValue, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return DEFAULT_FILE_READ_MAX_TOKENS;
}

// Used in file read tool
async function readFile(filePath, options) {
    const maxTokens = getFileReadMaxOutputTokens();
    const content = await fs.readFile(filePath, 'utf-8');

    // Truncate if exceeds max tokens
    const tokens = countTokens(content);
    if (tokens > maxTokens) {
        return truncateToTokenLimit(content, maxTokens);
    }

    return content;
}
```

---

## 15. /plan Command Shortcut

**Feature:** Enable plan mode directly from the prompt.

```javascript
// Plan mode can be entered via command or Shift+Tab
const planModeFeature = {
    id: "plan-mode",
    name: "Plan Mode",
    description: "Think before you code",
    categoryId: "speed",
    tryItPrompt: "Press Shift+Tab twice for Plan Mode",
    hasBeenUsed: async () => {
        return getSettings().lastPlanModeUse !== undefined;
    }
};

// EnterPlanMode tool
const enterPlanModeTool = {
    name: "EnterPlanMode",
    async description() {
        return "Requests permission to enter plan mode for complex tasks requiring exploration and design";
    },
    async prompt() {
        return enterPlanModePrompt;  // Detailed prompt about when/how to use plan mode
    },
    inputSchema: z.strictObject({}),
    outputSchema: z.object({
        message: z.string().describe("Confirmation that plan mode was entered")
    }),
    async run(input, context) {
        // Request permission from user
        await context.askPermission({
            message: "Enter plan mode?",
            type: "setMode",
            mode: "plan",
            destination: "session"
        });

        return {
            data: {
                message: "Entered plan mode. Focus on exploring and designing an implementation approach."
            }
        };
    }
};

// ExitPlanMode tool for when planning is complete
const exitPlanModeTool = {
    name: "ExitPlanMode",
    async description() {
        return "Prompts the user to exit plan mode and start coding";
    },
    async checkPermissions(input) {
        return {
            behavior: "ask",
            message: "Exit plan mode?",
            updatedInput: input
        };
    }
};
```

---

## 16. /teleport and /remote-env Slash Commands

**Feature:** Resume and configure remote sessions for claude.ai subscribers.

```javascript
// Teleport session state
let teleportedSessionInfo = null;

function setTeleportedSession(sessionInfo) {
    teleportedSessionInfo = {
        isTeleported: true,
        hasLoggedFirstMessage: false,
        sessionId: sessionInfo.sessionId
    };
}

function getTeleportedSession() {
    return teleportedSessionInfo;
}

// Teleport error handling
class TeleportOperationError extends Error {
    formattedMessage;
    constructor(message, formattedMessage) {
        super(message);
        this.formattedMessage = formattedMessage;
        this.name = "TeleportOperationError";
    }
}

// Resume a remote session
async function resumeSession(sessionId, statusCallback) {
    console.debug(`Resuming code session ID: ${sessionId}`);

    const accessToken = getOAuthAccount()?.accessToken;
    if (!accessToken) {
        throw new TeleportOperationError(
            "Claude Code web sessions require authentication with a Claude.ai account.",
            chalk.red("Error: Please run /login to authenticate.")
        );
    }

    const orgUuid = await getOrganizationUuid();
    if (!orgUuid) {
        throw new TeleportOperationError(
            "Unable to get organization UUID",
            chalk.red("Error: Unable to get organization UUID for constructing session URL")
        );
    }

    statusCallback?.("validating");

    // Validate session and repository
    const sessionDetails = await fetchSessionDetails(sessionId);
    const repoValidation = await validateSessionRepository(sessionDetails);

    switch (repoValidation.status) {
        case "match":
        case "no_repo_required":
            break;
        case "mismatch":
            throw new TeleportOperationError(
                `You must run claude --teleport ${sessionId} from a checkout of ${repoValidation.sessionRepo}`,
                chalk.red(`This repo is ${repoValidation.currentRepo}.`)
            );
        // ... other cases
    }

    return await teleportFromSessionsAPI(sessionId, orgUuid, accessToken, statusCallback, sessionDetails);
}

// Feature discovery
const teleportFeature = {
    id: "teleport",
    name: "Teleport",
    description: "Jump to any GitHub repo instantly",
    categoryId: "speed",
    tryItPrompt: "Type /teleport owner/repo to jump there",
    hasBeenUsed: async () => hasUsedCommand("teleport")
};
```

---

## 17. YAML-style Lists in Frontmatter allowed-tools

**Feature:** Cleaner skill declarations using YAML-style lists.

```javascript
// Parse allowed-tools from frontmatter - supports both formats
function parseAllowedTools(allowedTools) {
    if (allowedTools === undefined) return undefined;

    // Support YAML-style array
    // allowed-tools:
    //   - Read
    //   - Glob
    //   - Grep
    if (Array.isArray(allowedTools)) {
        return allowedTools.map(tool => tool.trim());
    }

    // Support comma-separated string (legacy)
    // allowed-tools: Read, Glob, Grep
    if (typeof allowedTools === "string") {
        return allowedTools.split(",").map(tool => tool.trim());
    }

    return undefined;
}

// Example skill frontmatter with YAML-style list:
/*
---
description: My custom skill
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash(git status:*)
---
*/
```

---

## 18. Skill Visibility in Slash Command Menu

**Feature:** Skills from `/skills/` directories are visible in slash command menu by default.

```javascript
// Skill parsing with userInvocable default
function parseSkill(frontmatter, skillName, content) {
    // user-invocable defaults to true for skills in skills/ directories
    const userInvocable = frontmatter["user-invocable"] === undefined
        ? true
        : parseBoolean(frontmatter["user-invocable"]);

    return {
        name: skillName,
        description: frontmatter.description ?? getDefaultDescription(content, "Skill"),
        userInvocable,  // Controls visibility in slash menu
        isHidden: !userInvocable,
        // ...
    };
}

// When displaying slash command menu, include user-invocable skills
function getSlashCommandSuggestions(input, commands, skills) {
    const suggestions = [];

    // Add commands
    for (const command of commands) {
        suggestions.push({
            type: "command",
            name: command.name,
            description: command.description
        });
    }

    // Add user-invocable skills
    for (const skill of skills) {
        if (skill.userInvocable !== false) {
            suggestions.push({
                type: "skill",
                name: skill.name,
                description: skill.description
            });
        }
    }

    return suggestions;
}

// Skill execution tracking for prioritization
function onSkillInvoked(skillName) {
    const stats = getSkillStats(skillName);
    stats.useCount++;
    stats.lastUsed = Date.now();
    saveSkillStats(skillName, stats);
}

// Prioritize recently and frequently used skills
function sortSkillsByUsage(skills) {
    return skills.sort((a, b) => {
        const statsA = getSkillStats(a.name);
        const statsB = getSkillStats(b.name);

        // Prioritize recent usage
        const recencyScore = (statsB.lastUsed || 0) - (statsA.lastUsed || 0);
        if (recencyScore !== 0) return recencyScore;

        // Then frequency
        return (statsB.useCount || 0) - (statsA.useCount || 0);
    });
}
```

---

## 19. Left/Right Arrow Key Navigation in Dialogs

**Feature:** Cycle through tabs in dialogs using arrow keys.

```javascript
// Tab navigation hook
function useTabNavigation(tabs, currentTab, setCurrentTab) {
    useKeyHandler((key, modifiers) => {
        if (key === "left" || key === "right") {
            const currentIndex = tabs.findIndex(t => t.id === currentTab);

            let newIndex;
            if (key === "left") {
                newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
            } else {
                newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
            }

            setCurrentTab(tabs[newIndex].id);
        }
    });
}

// Dialog with tab navigation
function TabbedDialog({ tabs, children }) {
    const [activeTab, setActiveTab] = useState(tabs[0].id);

    useTabNavigation(tabs, activeTab, setActiveTab);

    return (
        <Box flexDirection="column">
            <Box>
                {tabs.map((tab, index) => (
                    <Text
                        key={tab.id}
                        bold={tab.id === activeTab}
                        dimColor={tab.id !== activeTab}
                    >
                        {tab.label}
                        {index < tabs.length - 1 && " | "}
                    </Text>
                ))}
            </Box>
            {children}
        </Box>
    );
}
```

---

## 20. Real-time Thinking Block Display in Ctrl+O Transcript Mode

**Feature:** See thinking blocks as they stream in transcript view.

```javascript
// Transcript mode with real-time thinking
function TranscriptView({ messages, showThinking }) {
    const [streamingThinking, setStreamingThinking] = useState(null);

    // Subscribe to streaming thinking updates
    useEffect(() => {
        if (!showThinking) return;

        const unsubscribe = subscribeToThinkingStream((thinking) => {
            setStreamingThinking(thinking);
        });

        return unsubscribe;
    }, [showThinking]);

    return (
        <Box flexDirection="column">
            {messages.map((message, index) => (
                <MessageBlock key={index} message={message} />
            ))}

            {/* Show streaming thinking block */}
            {streamingThinking && (
                <ThinkingBlock
                    content={streamingThinking.content}
                    isStreaming={true}
                />
            )}
        </Box>
    );
}

// Thinking block component
function ThinkingBlock({ content, isStreaming }) {
    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="gray"
            paddingX={1}
        >
            <Text dimColor italic>
                {isStreaming ? "Thinking..." : "Thought"}
            </Text>
            <Text>{content}</Text>
        </Box>
    );
}
```

---

## Summary

Claude Code 2.1.0 introduces significant improvements across several areas:

1. **Developer Experience**: Hot-reload for skills, YAML frontmatter, better slash command visibility
2. **Flexibility**: Fork context, agent specification, language settings, custom token limits
3. **Terminal Support**: Native Shift+Enter in modern terminals, improved keyboard handling
4. **MCP Integration**: Dynamic tool/prompt/resource updates via notifications
5. **Privacy**: IS_DEMO mode for streaming/recording
6. **Permissions**: Wildcard patterns for Bash rules, agent disabling
7. **Hooks**: Comprehensive hook system with once-only execution
8. **UI/UX**: Unified backgrounding, tab navigation, real-time thinking display
9. **Remote**: Teleport functionality for claude.ai subscribers

Each feature is implemented with careful attention to backwards compatibility and user experience, leveraging modern JavaScript patterns and the reactive architecture of the CLI.
