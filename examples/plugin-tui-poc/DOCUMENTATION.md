# Plugin Documentation Changes

This document shows how the official Claude Code plugin documentation at `https://code.claude.com/docs/en/plugins` would be updated to include the TUI feature.

---

## New Section: Interactive UI Commands

### Overview

Claude Code plugins can now define interactive terminal user interfaces (TUIs) for their slash commands. This allows plugins to present rich, navigable interfaces for configuration, wizards, dashboards, and more.

Interactive UIs are built using React and the `@anthropic/claude-code-plugin-sdk`, which provides Ink-based components that match Claude Code's visual style.

### Quick Start

#### 1. Add SDK dependency

```bash
npm install @anthropic/claude-code-plugin-sdk
```

#### 2. Create a UI component

```tsx
// ui/MyPanel.tsx
import React, { useState } from 'react'
import {
  PluginUIProps,
  Panel,
  Select,
  Text,
} from '@anthropic/claude-code-plugin-sdk'

export default function MyPanel({
  onClose,
  theme,
}: PluginUIProps): React.ReactNode {
  const [selected, setSelected] = useState('')

  return (
    <Panel title="My Plugin" onClose={onClose}>
      <Select
        label="Choose an option"
        value={selected}
        options={[
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ]}
        onChange={setSelected}
      />
      <Text color={theme.secondaryText}>
        Selected: {selected || 'None'}
      </Text>
    </Panel>
  )
}
```

#### 3. Register in plugin manifest

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "commands": {
    "config": {
      "description": "Open configuration panel",
      "ui": "./ui/MyPanel.tsx"
    }
  }
}
```

#### 4. Build and test

```bash
npm run build
claude --plugin-dir ./my-plugin
```

Then run `/my-plugin:config` to see your UI.

---

### UI Component Props

Every UI component receives standardized props:

```typescript
interface PluginUIProps {
  // Call to close the UI and return to REPL
  onClose: (message?: string) => void

  // Send data back to Claude for conversation context
  onResult: (data: unknown) => void

  // Execution context
  context: {
    cwd: string              // Current working directory
    pluginDataDir: string    // Plugin's data storage path
    pluginConfig: object     // Plugin configuration
    terminal: {
      columns: number
      rows: number
    }
  }

  // Current theme colors
  theme: Theme

  // Command arguments (text after the slash command)
  args: string
}
```

### Available Components

The SDK provides pre-built components that match Claude Code's visual style:

#### Layout Components

| Component | Description |
|-----------|-------------|
| `Panel` | Container with border, title, and footer |
| `Box` | Flexbox container (re-exported from Ink) |
| `Divider` | Horizontal separator line |
| `Spacer` | Flexible space filler |

#### Form Components

| Component | Description |
|-----------|-------------|
| `TextInput` | Single-line text input |
| `PasswordInput` | Masked text input |
| `Select` | Single-choice dropdown |
| `MultiSelect` | Multi-choice selection |
| `Confirm` | Yes/No toggle |
| `Checkbox` | Boolean checkbox |

#### Navigation Components

| Component | Description |
|-----------|-------------|
| `Tabs` | Tabbed navigation bar |
| `TabPanel` | Content container for tabs |
| `Menu` | Vertical menu with keyboard nav |
| `Breadcrumbs` | Navigation breadcrumbs |

#### Feedback Components

| Component | Description |
|-----------|-------------|
| `Spinner` | Loading indicator |
| `ProgressBar` | Progress visualization |
| `Alert` | Colored alert message |
| `Badge` | Status badge |

#### Complex Components

| Component | Description |
|-----------|-------------|
| `FormWizard` | Multi-step form wizard |
| `DataTable` | Scrollable data table |
| `Tree` | Collapsible tree view |
| `DiffView` | Side-by-side diff display |

---

### Component Examples

#### Tabs with Content

```tsx
import { Tabs, TabPanel, Text } from '@anthropic/claude-code-plugin-sdk'

function MyTabbedUI() {
  const [tab, setTab] = useState('general')

  return (
    <>
      <Tabs
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'advanced', label: 'Advanced' },
        ]}
      />

      <TabPanel id="general" activeTab={tab}>
        <Text>General settings content</Text>
      </TabPanel>

      <TabPanel id="advanced" activeTab={tab}>
        <Text>Advanced settings content</Text>
      </TabPanel>
    </>
  )
}
```

#### Form with Validation

```tsx
import { TextInput, Alert } from '@anthropic/claude-code-plugin-sdk'

function MyForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  const validate = (value: string) => {
    if (!value.includes('@')) {
      setError('Please enter a valid email')
    } else {
      setError('')
    }
  }

  return (
    <>
      <TextInput
        label="Email"
        value={email}
        onChange={(v) => {
          setEmail(v)
          validate(v)
        }}
        placeholder="user@example.com"
      />
      {error && <Alert type="error">{error}</Alert>}
    </>
  )
}
```

#### Multi-Step Wizard

```tsx
import { FormWizard } from '@anthropic/claude-code-plugin-sdk'

function SetupWizard({ onClose }: PluginUIProps) {
  return (
    <FormWizard
      title="Plugin Setup"
      steps={[
        {
          id: 'credentials',
          title: 'Credentials',
          fields: [
            {
              id: 'apiKey',
              type: 'password',
              label: 'API Key',
              required: true,
            },
          ],
        },
        {
          id: 'preferences',
          title: 'Preferences',
          fields: [
            {
              id: 'autoUpdate',
              type: 'confirm',
              label: 'Enable auto-updates',
              defaultValue: true,
            },
          ],
        },
      ]}
      onComplete={(data) => {
        saveConfig(data)
        onClose('Setup complete!')
      }}
      onCancel={() => onClose()}
    />
  )
}
```

---

### Keyboard Navigation

All SDK components support keyboard navigation:

| Key | Action |
|-----|--------|
| `Tab` | Move to next focusable element / switch tabs |
| `Shift+Tab` | Move to previous focusable element |
| `↑` / `↓` | Navigate options within a component |
| `Enter` | Select current option / submit |
| `Escape` | Close UI / cancel operation |
| `Ctrl+C` / `Ctrl+D` | Force close |

Custom keyboard handlers:

```tsx
import { useInput } from 'ink'

function MyComponent({ onClose }: PluginUIProps) {
  useInput((input, key) => {
    if (input === 'q') {
      onClose()
    }
    if (key.ctrl && input === 's') {
      saveSettings()
    }
  })

  return <Text>Press 'q' to quit, Ctrl+S to save</Text>
}
```

---

### Theming

UI components automatically use Claude Code's current theme. Access theme colors via props:

```tsx
function ThemedComponent({ theme }: PluginUIProps) {
  return (
    <Box borderColor={theme.secondaryBorder}>
      <Text color={theme.claude}>Claude Orange</Text>
      <Text color={theme.success}>Success Green</Text>
      <Text color={theme.error}>Error Red</Text>
      <Text color={theme.warning}>Warning Yellow</Text>
      <Text color={theme.secondaryText}>Dim Text</Text>
    </Box>
  )
}
```

Theme adapts automatically to user's preference (light/dark/daltonized).

---

### Returning Data to Claude

Use `onResult()` to pass structured data back to the conversation:

```tsx
function DataCollector({ onClose, onResult }: PluginUIProps) {
  const handleSubmit = (formData: FormData) => {
    // This data will be available in the conversation context
    onResult({
      action: 'configuration_updated',
      settings: formData,
      timestamp: new Date().toISOString(),
    })

    // This message appears in the chat
    onClose('Configuration updated successfully')
  }

  return <MyForm onSubmit={handleSubmit} />
}
```

Claude can then reference this data in subsequent responses.

---

### Best Practices

#### 1. Respect Terminal Size

```tsx
function ResponsiveUI({ context }: PluginUIProps) {
  const { columns, rows } = context.terminal

  // Adapt layout based on terminal size
  const isCompact = columns < 80 || rows < 24

  return (
    <Panel width={isCompact ? columns - 4 : 80}>
      {isCompact ? <CompactView /> : <FullView />}
    </Panel>
  )
}
```

#### 2. Provide Clear Exit Instructions

Always show users how to close the UI:

```tsx
<Box marginTop={1}>
  <Text dimColor>
    ↑/↓ to navigate · Enter to select · Esc to close
  </Text>
</Box>
```

#### 3. Handle Errors Gracefully

```tsx
function SafeUI({ onClose }: PluginUIProps) {
  const [error, setError] = useState<Error | null>(null)

  if (error) {
    return (
      <Panel title="Error" borderColor={theme.error}>
        <Text color={theme.error}>{error.message}</Text>
        <Text dimColor>Press any key to close</Text>
      </Panel>
    )
  }

  return <MainUI onError={setError} />
}
```

#### 4. Keep UIs Focused

- Single purpose per UI
- Limit to 3-5 tabs maximum
- Provide keyboard shortcuts for power users
- Show loading states for async operations

---

### Testing UI Components

```tsx
// my-plugin/ui/__tests__/ConfigPanel.test.tsx
import { render } from '@anthropic/claude-code-plugin-sdk/testing'
import ConfigPanel from '../ConfigPanel'

describe('ConfigPanel', () => {
  it('renders without crashing', () => {
    const { lastFrame } = render(
      <ConfigPanel
        onClose={jest.fn()}
        onResult={jest.fn()}
        context={mockContext}
        theme={mockTheme}
        args=""
      />
    )
    expect(lastFrame()).toContain('Configuration')
  })

  it('navigates with arrow keys', () => {
    const { stdin, lastFrame } = render(<ConfigPanel {...mockProps} />)

    stdin.write('\u001B[B') // Down arrow
    expect(lastFrame()).toContain('❯') // Selection indicator
  })
})
```

---

### Security

Plugin UIs run in a sandboxed environment:

- **No file system access** - Use `context.pluginDataDir` for storage
- **No network access** - Use MCP tools for external APIs
- **No shell execution** - Cannot spawn processes
- **Execution timeout** - UIs killed after 5 minutes of inactivity

First-time UI display requires user approval.

---

### Migration from Subprocess Approach

If you were previously spawning Ink processes from hooks:

**Before:**
```json
// hooks.json
{
  "PreToolUse": [{
    "matcher": "mcp__myplugin__show_ui",
    "hooks": ["node ./my-ink-app.js"]
  }]
}
```

**After:**
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

Benefits of native UI:
- Integrated with Claude Code's rendering
- Automatic theming
- Consistent keyboard navigation
- No subprocess overhead
- Better error handling

---

### Troubleshooting

#### UI doesn't appear
- Check that `ui` path in manifest points to valid TSX file
- Verify build completed successfully
- Check console for error messages

#### Keyboard not responding
- Ensure component uses `useInput` hook correctly
- Check that focus is on your component
- Verify no other input handlers are blocking

#### Theme colors wrong
- Use `theme` prop instead of hardcoded colors
- Test with both light and dark themes
- Verify using theme colors from SDK types

#### Performance issues
- Minimize re-renders with `useMemo`/`useCallback`
- Keep option lists under 100 items
- Use virtualization for long lists

---

### API Reference

Full API documentation available at:
- Component Props: `/docs/plugin-ui/components`
- Hooks: `/docs/plugin-ui/hooks`
- Types: `/docs/plugin-ui/types`
- Examples: `/docs/plugin-ui/examples`
