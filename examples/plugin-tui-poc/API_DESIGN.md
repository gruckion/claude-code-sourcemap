# Claude Code Plugin TUI API Design

## Overview

This document describes a hypothetical API for enabling Claude Code plugins to render their own interactive terminal UIs using React/Ink, similar to how internal commands like `/plugin`, `/config`, and `/help` work.

## Current Architecture (Internal)

Based on analysis of the Claude Code source code, internal commands use a `local-jsx` command type:

```typescript
// From src/commands.ts
type LocalJSXCommand = {
  type: 'local-jsx'
  call(
    onDone: (result?: string) => void,
    context: ToolUseContext & {
      setForkConvoWithMessagesOnTheNextRender: (
        forkConvoWithMessages: Message[],
      ) => void
    },
  ): Promise<React.ReactNode>
}
```

When a `local-jsx` command is executed:
1. The command's `call()` method returns a React component
2. `setToolJSX()` renders the component in the terminal
3. The prompt input is hidden (`shouldHidePromptInput: true`)
4. When done, `onDone()` is called and UI is cleared

---

## Proposed Plugin TUI API

### 1. Plugin Manifest Extension

Add a new `ui` field to `plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "A plugin with custom TUI",
  "author": { "name": "Developer" },

  "commands": {
    "configure": {
      "description": "Open plugin configuration",
      "ui": "./ui/ConfigPanel.tsx"
    },
    "wizard": {
      "description": "Run setup wizard",
      "ui": "./ui/SetupWizard.tsx"
    }
  }
}
```

### 2. Plugin UI Entry Point

Plugin UI components export a function that receives context and callbacks:

```typescript
// ./ui/ConfigPanel.tsx
import { PluginUIProps } from '@anthropic/claude-code-plugin-sdk'

export default function ConfigPanel({
  onClose,
  onResult,
  context,
  theme,
}: PluginUIProps): React.ReactNode {
  // Your Ink component here
}
```

### 3. SDK Type Definitions

```typescript
// @anthropic/claude-code-plugin-sdk

import { ReactNode } from 'react'

/**
 * Theme colors provided by Claude Code
 */
export interface Theme {
  claude: string
  text: string
  secondaryText: string
  border: string
  secondaryBorder: string
  success: string
  error: string
  warning: string
  suggestion: string
  bashBorder: string
  permission: string
  diff: {
    added: string
    removed: string
    addedDimmed: string
    removedDimmed: string
  }
}

/**
 * Context passed to plugin UI components
 */
export interface PluginUIContext {
  /** Current working directory */
  cwd: string
  /** Plugin's data directory for persistence */
  pluginDataDir: string
  /** Plugin configuration from settings */
  pluginConfig: Record<string, unknown>
  /** Whether running in headless mode */
  isHeadless: boolean
  /** Terminal dimensions */
  terminal: {
    columns: number
    rows: number
  }
}

/**
 * Props passed to every plugin UI component
 */
export interface PluginUIProps {
  /**
   * Call when UI should close and control returns to REPL
   * @param result - Optional message to show after close
   */
  onClose: (result?: string) => void

  /**
   * Return structured data to Claude for conversation context
   * @param data - Data to include in conversation
   */
  onResult: (data: unknown) => void

  /**
   * Execution context
   */
  context: PluginUIContext

  /**
   * Current theme colors
   */
  theme: Theme

  /**
   * Arguments passed to the slash command
   */
  args: string
}

/**
 * Plugin UI component type
 */
export type PluginUIComponent = (props: PluginUIProps) => ReactNode
```

### 4. Pre-built Components Library

The SDK would include commonly-used components matching Claude Code's visual style:

```typescript
// @anthropic/claude-code-plugin-sdk/components

// Layout
export { Box } from './components/Box'
export { Divider } from './components/Divider'
export { Panel } from './components/Panel'

// Typography
export { Text } from './components/Text'
export { Heading } from './components/Heading'
export { Link } from './components/Link'

// Forms
export { TextInput } from './components/TextInput'
export { Select } from './components/Select'
export { MultiSelect } from './components/MultiSelect'
export { Confirm } from './components/Confirm'
export { PasswordInput } from './components/PasswordInput'

// Navigation
export { Tabs } from './components/Tabs'
export { TabPanel } from './components/TabPanel'
export { Menu } from './components/Menu'

// Feedback
export { Spinner } from './components/Spinner'
export { ProgressBar } from './components/ProgressBar'
export { Alert } from './components/Alert'

// Complex
export { FormWizard } from './components/FormWizard'
export { DataTable } from './components/DataTable'
export { Tree } from './components/Tree'
export { DiffView } from './components/DiffView'

// Hooks
export { useTheme } from './hooks/useTheme'
export { useTerminalSize } from './hooks/useTerminalSize'
export { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
export { useExitOnCtrlCD } from './hooks/useExitOnCtrlCD'
```

### 5. Example Plugin UI Implementation

```tsx
// my-plugin/ui/ConfigPanel.tsx
import React, { useState } from 'react'
import {
  PluginUIProps,
  Panel,
  Tabs,
  TabPanel,
  Select,
  Confirm,
  Text,
  useKeyboardNavigation,
} from '@anthropic/claude-code-plugin-sdk'

interface Config {
  autoUpdate: boolean
  logLevel: string
  maxRetries: number
}

export default function ConfigPanel({
  onClose,
  onResult,
  context,
  theme,
}: PluginUIProps): React.ReactNode {
  const [config, setConfig] = useState<Config>({
    autoUpdate: true,
    logLevel: 'info',
    maxRetries: 3,
  })
  const [activeTab, setActiveTab] = useState('general')

  const handleSave = () => {
    // Save config logic here
    onResult({ saved: true, config })
    onClose('Configuration saved successfully')
  }

  return (
    <Panel
      title="My Plugin Configuration"
      subtitle="Configure plugin behavior"
      borderColor={theme.secondaryBorder}
      onClose={onClose}
    >
      <Tabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'advanced', label: 'Advanced' },
          { id: 'about', label: 'About' },
        ]}
      />

      <TabPanel id="general" activeTab={activeTab}>
        <Confirm
          label="Enable auto-updates"
          value={config.autoUpdate}
          onChange={(v) => setConfig({ ...config, autoUpdate: v })}
        />
        <Select
          label="Log level"
          value={config.logLevel}
          options={[
            { label: 'Debug', value: 'debug' },
            { label: 'Info', value: 'info' },
            { label: 'Warning', value: 'warning' },
            { label: 'Error', value: 'error' },
          ]}
          onChange={(v) => setConfig({ ...config, logLevel: v })}
        />
      </TabPanel>

      <TabPanel id="advanced" activeTab={activeTab}>
        <Select
          label="Max retries"
          value={String(config.maxRetries)}
          options={[
            { label: '1', value: '1' },
            { label: '3', value: '3' },
            { label: '5', value: '5' },
            { label: '10', value: '10' },
          ]}
          onChange={(v) => setConfig({ ...config, maxRetries: Number(v) })}
        />
      </TabPanel>

      <TabPanel id="about" activeTab={activeTab}>
        <Text>Version: 1.0.0</Text>
        <Text color={theme.secondaryText}>
          Plugin data directory: {context.pluginDataDir}
        </Text>
      </TabPanel>
    </Panel>
  )
}
```

---

## Security Considerations

### Sandboxing

Plugin UIs would run in a sandboxed environment:

1. **No direct file system access** - Must use provided APIs
2. **No network access** - Must use MCP tools for external communication
3. **No process spawning** - Cannot execute arbitrary commands
4. **Memory limits** - Prevent resource exhaustion
5. **Execution timeout** - Kill long-running UI after configurable timeout

### Permission Model

```json
{
  "name": "my-plugin",
  "permissions": {
    "ui": {
      "enabled": true,
      "allowFullscreen": false,
      "maxExecutionTime": 300000
    }
  }
}
```

### User Approval

First time a plugin renders UI, user must approve:

```
╭─────────────────────────────────────────────────╮
│ Plugin UI Request                               │
│                                                 │
│ "my-plugin" wants to display an interactive UI  │
│                                                 │
│ ○ Allow once                                    │
│ ○ Always allow for this plugin                  │
│ ○ Deny                                          │
╰─────────────────────────────────────────────────╯
```

---

## Build System Integration

### Plugin Build Configuration

```json
// package.json
{
  "name": "my-plugin",
  "scripts": {
    "build": "claude-plugin-build",
    "dev": "claude-plugin-build --watch"
  },
  "devDependencies": {
    "@anthropic/claude-code-plugin-sdk": "^1.0.0"
  }
}
```

### Build Output

The build process would:

1. Compile TypeScript/TSX to JavaScript
2. Bundle with dependencies (except SDK which is provided by runtime)
3. Tree-shake unused code
4. Generate source maps for debugging
5. Validate component exports

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json
├── dist/
│   ├── ui/
│   │   ├── ConfigPanel.js
│   │   └── SetupWizard.js
│   └── manifest.json
├── ui/
│   ├── ConfigPanel.tsx
│   └── SetupWizard.tsx
└── package.json
```

---

## Runtime Execution Flow

```
1. User types: /my-plugin:configure

2. Claude Code:
   ├── Loads plugin manifest
   ├── Finds command "configure" has ui: "./ui/ConfigPanel.tsx"
   ├── Loads bundled component from dist/ui/ConfigPanel.js
   ├── Checks UI permissions (prompts if first time)
   ├── Creates sandboxed execution context
   └── Calls setToolJSX with component

3. Plugin UI renders:
   ├── Receives props: { onClose, onResult, context, theme, args }
   ├── Renders Ink components
   ├── Handles user input via useInput
   └── User interacts with UI

4. On completion:
   ├── Plugin calls onClose("result message")
   ├── Optional: calls onResult(data) for Claude context
   ├── Claude Code clears UI
   └── Returns to REPL
```

---

## Compatibility with Existing Plugin Features

The TUI API would complement existing plugin capabilities:

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Markdown Commands** | Text-based slash commands | Simple prompts, documentation |
| **Agents** | Custom Claude agents | Complex reasoning tasks |
| **Skills** | Capability definitions | Tool-like behaviors |
| **Hooks** | Event handlers | Automation, pre/post processing |
| **MCP Servers** | External tool integration | Data sources, services |
| **LSP Servers** | Language intelligence | Code completion, diagnostics |
| **TUI Components** | Interactive UI (NEW) | Configuration, wizards, dashboards |

---

## Migration Path

For plugins that currently use subprocess workarounds:

### Before (Subprocess approach)
```typescript
// hooks.json
{
  "PreToolUse": [{
    "matcher": "mcp__myplugin__show_ui",
    "hooks": ["node ./my-ink-app.js"]
  }]
}
```

### After (Native TUI)
```json
// plugin.json
{
  "commands": {
    "show": {
      "description": "Show interactive UI",
      "ui": "./ui/MyApp.tsx"
    }
  }
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- Plugin manifest `ui` field support
- Component bundling and loading
- Basic sandboxing
- SDK with core components

### Phase 2: Component Library
- Full component set matching internal components
- Theming integration
- Keyboard navigation utilities
- Form validation helpers

### Phase 3: Developer Experience
- CLI tools for scaffolding
- Hot reload during development
- Component preview mode
- Testing utilities

### Phase 4: Ecosystem
- Component marketplace
- Community component sharing
- Visual UI builder (optional)
- Documentation and examples

---

## Appendix: Component API Examples

### Tabs Component

```tsx
<Tabs
  activeTab={activeTab}
  onTabChange={setActiveTab}
  tabs={[
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'advanced', label: 'Advanced' },
  ]}
  keyboardNavigation="tab"  // 'tab' | 'arrows' | 'both'
/>
```

### Select Component

```tsx
<Select
  label="Choose option"
  description="Select the best option for your use case"
  value={selected}
  options={[
    { label: 'Option A', value: 'a', description: 'First option' },
    { label: 'Option B', value: 'b', description: 'Second option' },
  ]}
  onChange={setSelected}
  visibleCount={5}
  highlightText={searchQuery}
/>
```

### FormWizard Component

```tsx
<FormWizard
  title="Setup Wizard"
  steps={[
    {
      id: 'auth',
      title: 'Authentication',
      fields: [
        { id: 'apiKey', type: 'password', label: 'API Key', required: true },
      ],
    },
    {
      id: 'config',
      title: 'Configuration',
      fields: [
        { id: 'region', type: 'select', label: 'Region', options: [...] },
        { id: 'autoSync', type: 'confirm', label: 'Enable auto-sync' },
      ],
    },
  ]}
  onComplete={(data) => console.log(data)}
  onCancel={onClose}
/>
```

### Panel Component

```tsx
<Panel
  title="My Panel"
  subtitle="Description text"
  borderStyle="round"
  borderColor={theme.claude}
  padding={2}
  width={80}
  footer={<Text dimColor>Press Esc to close</Text>}
>
  {children}
</Panel>
```
