/**
 * Proof of Concept: Tabbed TUI Component for Claude Code Plugins
 *
 * This demonstrates how a custom plugin could render an interactive
 * tabbed interface similar to the internal /plugin command.
 *
 * Features:
 * - Tab key switches between top tabs
 * - Up/Down arrows navigate within tab content
 * - Enter selects an option
 * - Escape closes the TUI
 */

import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import figures from 'figures'

// ============================================================================
// Types
// ============================================================================

export interface TabOption {
  label: string
  value: string
  description?: string
}

export interface Tab {
  id: string
  label: string
  options: TabOption[]
}

export interface PluginTUIProps {
  /** Title displayed at the top of the TUI */
  title: string
  /** Subtitle/description under the title */
  subtitle?: string
  /** Array of tabs with their options */
  tabs: Tab[]
  /** Called when user selects an option */
  onSelect: (tabId: string, optionValue: string) => void
  /** Called when user closes the TUI (Escape) */
  onClose: () => void
  /** Theme colors - would typically come from getTheme() */
  theme?: {
    primary: string
    secondary: string
    border: string
    text: string
    dimText: string
  }
}

// ============================================================================
// Default Theme (matches Claude Code's dark theme)
// ============================================================================

const defaultTheme = {
  primary: '#D97757',    // Claude orange
  secondary: '#b1b9f9',  // Suggestion purple
  border: '#888',        // Secondary border
  text: '#fff',          // Primary text
  dimText: '#999',       // Secondary text
}

// ============================================================================
// Tab Bar Component
// ============================================================================

interface TabBarProps {
  tabs: Tab[]
  activeTabIndex: number
  theme: typeof defaultTheme
}

function TabBar({ tabs, activeTabIndex, theme }: TabBarProps): React.ReactNode {
  return (
    <Box flexDirection="row" gap={2} marginBottom={1}>
      {tabs.map((tab, index) => {
        const isActive = index === activeTabIndex
        return (
          <Box key={tab.id}>
            <Text
              color={isActive ? theme.primary : theme.dimText}
              bold={isActive}
              underline={isActive}
            >
              {tab.label}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// ============================================================================
// Option List Component
// ============================================================================

interface OptionListProps {
  options: TabOption[]
  selectedIndex: number
  theme: typeof defaultTheme
}

function OptionList({ options, selectedIndex, theme }: OptionListProps): React.ReactNode {
  return (
    <Box flexDirection="column" gap={0}>
      {options.map((option, index) => {
        const isSelected = index === selectedIndex
        return (
          <Box key={option.value} flexDirection="row" gap={1}>
            <Text color={isSelected ? theme.secondary : theme.dimText}>
              {isSelected ? figures.pointer : ' '}
            </Text>
            <Box flexDirection="column">
              <Text color={isSelected ? theme.secondary : theme.text}>
                {option.label}
              </Text>
              {option.description && (
                <Text color={theme.dimText} wrap="wrap">
                  {option.description}
                </Text>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

// ============================================================================
// Footer/Help Text Component
// ============================================================================

interface FooterProps {
  theme: typeof defaultTheme
}

function Footer({ theme }: FooterProps): React.ReactNode {
  return (
    <Box marginTop={1}>
      <Text color={theme.dimText}>
        Tab to switch tabs · ↑/↓ to navigate · Enter to select · Esc to close
      </Text>
    </Box>
  )
}

// ============================================================================
// Main Plugin TUI Component
// ============================================================================

export function PluginTUI({
  title,
  subtitle,
  tabs,
  onSelect,
  onClose,
  theme: customTheme,
}: PluginTUIProps): React.ReactNode {
  const theme = useMemo(() => ({ ...defaultTheme, ...customTheme }), [customTheme])

  // State for tab and option selection
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0)

  // Get current tab's options
  const currentTab = tabs[activeTabIndex]
  const currentOptions = currentTab?.options ?? []

  // Handle keyboard input
  useInput((input, key) => {
    // Escape to close
    if (key.escape) {
      onClose()
      return
    }

    // Tab to switch between tabs
    if (key.tab) {
      if (key.shift) {
        // Shift+Tab goes to previous tab
        setActiveTabIndex(prev => (prev - 1 + tabs.length) % tabs.length)
      } else {
        // Tab goes to next tab
        setActiveTabIndex(prev => (prev + 1) % tabs.length)
      }
      // Reset option selection when switching tabs
      setSelectedOptionIndex(0)
      return
    }

    // Up/Down arrows to navigate options
    if (key.upArrow) {
      setSelectedOptionIndex(prev => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedOptionIndex(prev => Math.min(currentOptions.length - 1, prev + 1))
      return
    }

    // Enter to select current option
    if (key.return && currentTab && currentOptions[selectedOptionIndex]) {
      onSelect(currentTab.id, currentOptions[selectedOptionIndex].value)
      return
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Main container with border */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
      >
        {/* Header */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.primary}>{title}</Text>
          {subtitle && (
            <Text color={theme.dimText}>{subtitle}</Text>
          )}
        </Box>

        {/* Tab Bar */}
        <TabBar
          tabs={tabs}
          activeTabIndex={activeTabIndex}
          theme={theme}
        />

        {/* Divider */}
        <Box marginY={1}>
          <Text color={theme.border}>{'─'.repeat(50)}</Text>
        </Box>

        {/* Tab Content */}
        <OptionList
          options={currentOptions}
          selectedIndex={selectedOptionIndex}
          theme={theme}
        />
      </Box>

      {/* Footer with keyboard hints */}
      <Footer theme={theme} />
    </Box>
  )
}

// ============================================================================
// Example Usage / Demo
// ============================================================================

export function PluginTUIDemo({ onClose }: { onClose: () => void }): React.ReactNode {
  const tabs: Tab[] = [
    {
      id: 'install',
      label: 'Install',
      options: [
        {
          label: '@anthropic/code-review',
          value: 'code-review',
          description: 'Automated code review with Claude'
        },
        {
          label: '@anthropic/test-generator',
          value: 'test-generator',
          description: 'Generate unit tests for your code'
        },
        {
          label: '@community/git-hooks',
          value: 'git-hooks',
          description: 'Pre-commit hooks powered by Claude'
        },
      ]
    },
    {
      id: 'installed',
      label: 'Installed',
      options: [
        {
          label: 'my-custom-plugin (v1.0.0)',
          value: 'my-custom-plugin',
          description: 'Your locally installed plugin'
        },
      ]
    },
    {
      id: 'settings',
      label: 'Settings',
      options: [
        {
          label: 'Auto-update plugins',
          value: 'auto-update',
          description: 'Automatically update plugins when new versions are available'
        },
        {
          label: 'Plugin directory',
          value: 'plugin-dir',
          description: 'Configure where plugins are installed'
        },
        {
          label: 'Marketplace URL',
          value: 'marketplace-url',
          description: 'Set custom plugin marketplace'
        },
      ]
    },
  ]

  const handleSelect = (tabId: string, optionValue: string) => {
    console.log(`Selected: ${tabId} -> ${optionValue}`)
    // In a real plugin, this would trigger installation, navigation, etc.
  }

  return (
    <PluginTUI
      title="Plugin Manager"
      subtitle="Install and manage Claude Code plugins"
      tabs={tabs}
      onSelect={handleSelect}
      onClose={onClose}
    />
  )
}

export default PluginTUI
