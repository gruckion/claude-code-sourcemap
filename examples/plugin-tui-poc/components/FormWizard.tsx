/**
 * Multi-step Form Wizard Component for Claude Code Plugins
 *
 * This demonstrates a wizard-style form that guides users through
 * multiple steps, similar to onboarding flows.
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import figures from 'figures'

// ============================================================================
// Types
// ============================================================================

export type FieldType = 'text' | 'select' | 'confirm' | 'multiselect'

export interface SelectOption {
  label: string
  value: string
}

export interface FormField {
  id: string
  type: FieldType
  label: string
  description?: string
  placeholder?: string
  options?: SelectOption[]  // For select/multiselect
  required?: boolean
  defaultValue?: string | boolean | string[]
}

export interface WizardStep {
  id: string
  title: string
  description?: string
  fields: FormField[]
}

export interface FormWizardProps {
  title: string
  steps: WizardStep[]
  onComplete: (data: Record<string, unknown>) => void
  onCancel: () => void
  theme?: {
    primary: string
    secondary: string
    border: string
    text: string
    dimText: string
    success: string
    error: string
  }
}

// ============================================================================
// Default Theme
// ============================================================================

const defaultTheme = {
  primary: '#D97757',
  secondary: '#b1b9f9',
  border: '#888',
  text: '#fff',
  dimText: '#999',
  success: '#4eba65',
  error: '#ff6b80',
}

// ============================================================================
// Progress Indicator Component
// ============================================================================

interface ProgressIndicatorProps {
  steps: WizardStep[]
  currentStepIndex: number
  theme: typeof defaultTheme
}

function ProgressIndicator({
  steps,
  currentStepIndex,
  theme,
}: ProgressIndicatorProps): React.ReactNode {
  return (
    <Box flexDirection="row" gap={1} marginBottom={1}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex
        const isCurrent = index === currentStepIndex
        const isPending = index > currentStepIndex

        let indicator: string
        let color: string

        if (isCompleted) {
          indicator = figures.tick
          color = theme.success
        } else if (isCurrent) {
          indicator = figures.pointer
          color = theme.primary
        } else {
          indicator = figures.circle
          color = theme.dimText
        }

        return (
          <Box key={step.id} flexDirection="row" gap={1}>
            <Text color={color}>{indicator}</Text>
            <Text color={isCurrent ? theme.text : theme.dimText}>
              {step.title}
            </Text>
            {index < steps.length - 1 && (
              <Text color={theme.dimText}>{'─'}</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

// ============================================================================
// Select Field Component
// ============================================================================

interface SelectFieldProps {
  field: FormField
  value: string
  selectedIndex: number
  isFocused: boolean
  theme: typeof defaultTheme
}

function SelectField({
  field,
  selectedIndex,
  isFocused,
  theme,
}: SelectFieldProps): React.ReactNode {
  const options = field.options ?? []

  return (
    <Box flexDirection="column">
      <Text color={isFocused ? theme.secondary : theme.text} bold>
        {field.label}
        {field.required && <Text color={theme.error}> *</Text>}
      </Text>
      {field.description && (
        <Text color={theme.dimText}>{field.description}</Text>
      )}
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {options.map((option, index) => {
          const isSelected = index === selectedIndex
          return (
            <Box key={option.value} flexDirection="row" gap={1}>
              <Text color={isSelected ? theme.secondary : theme.dimText}>
                {isSelected ? figures.radioOn : figures.radioOff}
              </Text>
              <Text color={isSelected ? theme.secondary : theme.text}>
                {option.label}
              </Text>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ============================================================================
// Confirm Field Component
// ============================================================================

interface ConfirmFieldProps {
  field: FormField
  value: boolean
  isFocused: boolean
  theme: typeof defaultTheme
}

function ConfirmField({
  field,
  value,
  isFocused,
  theme,
}: ConfirmFieldProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text color={isFocused ? theme.secondary : theme.text} bold>
        {field.label}
      </Text>
      {field.description && (
        <Text color={theme.dimText}>{field.description}</Text>
      )}
      <Box flexDirection="row" gap={2} marginTop={1} marginLeft={2}>
        <Text
          color={value ? theme.success : theme.dimText}
          bold={value}
        >
          {value ? figures.radioOn : figures.radioOff} Yes
        </Text>
        <Text
          color={!value ? theme.error : theme.dimText}
          bold={!value}
        >
          {!value ? figures.radioOn : figures.radioOff} No
        </Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// Text Field Component (simplified - shows current value)
// ============================================================================

interface TextFieldProps {
  field: FormField
  value: string
  isFocused: boolean
  theme: typeof defaultTheme
}

function TextField({
  field,
  value,
  isFocused,
  theme,
}: TextFieldProps): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text color={isFocused ? theme.secondary : theme.text} bold>
        {field.label}
        {field.required && <Text color={theme.error}> *</Text>}
      </Text>
      {field.description && (
        <Text color={theme.dimText}>{field.description}</Text>
      )}
      <Box marginTop={1} marginLeft={2}>
        <Text color={theme.dimText}>[</Text>
        <Text color={value ? theme.text : theme.dimText}>
          {value || field.placeholder || 'Enter value...'}
        </Text>
        <Text color={theme.dimText}>]</Text>
        {isFocused && <Text color={theme.secondary}> {figures.pointer}</Text>}
      </Box>
    </Box>
  )
}

// ============================================================================
// Main Form Wizard Component
// ============================================================================

export function FormWizard({
  title,
  steps,
  onComplete,
  onCancel,
  theme: customTheme,
}: FormWizardProps): React.ReactNode {
  const theme = { ...defaultTheme, ...customTheme }

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0)
  const [formData, setFormData] = useState<Record<string, unknown>>({})
  const [selectIndices, setSelectIndices] = useState<Record<string, number>>({})

  const currentStep = steps[currentStepIndex]
  const currentField = currentStep?.fields[currentFieldIndex]

  // Initialize default values
  React.useEffect(() => {
    const defaults: Record<string, unknown> = {}
    steps.forEach(step => {
      step.fields.forEach(field => {
        if (field.defaultValue !== undefined) {
          defaults[field.id] = field.defaultValue
        }
      })
    })
    setFormData(prev => ({ ...defaults, ...prev }))
  }, [steps])

  useInput((input, key) => {
    if (!currentStep || !currentField) return

    // Escape to cancel
    if (key.escape) {
      onCancel()
      return
    }

    // Tab to move between fields
    if (key.tab) {
      const fields = currentStep.fields
      if (key.shift) {
        setCurrentFieldIndex(prev => Math.max(0, prev - 1))
      } else {
        setCurrentFieldIndex(prev => Math.min(fields.length - 1, prev + 1))
      }
      return
    }

    // Handle field-specific input
    switch (currentField.type) {
      case 'select': {
        const options = currentField.options ?? []
        const currentSelectIndex = selectIndices[currentField.id] ?? 0

        if (key.upArrow) {
          setSelectIndices(prev => ({
            ...prev,
            [currentField.id]: Math.max(0, currentSelectIndex - 1),
          }))
        } else if (key.downArrow) {
          setSelectIndices(prev => ({
            ...prev,
            [currentField.id]: Math.min(options.length - 1, currentSelectIndex + 1),
          }))
        } else if (key.return) {
          const selectedOption = options[currentSelectIndex]
          if (selectedOption) {
            setFormData(prev => ({
              ...prev,
              [currentField.id]: selectedOption.value,
            }))
            // Move to next field or step
            if (currentFieldIndex < currentStep.fields.length - 1) {
              setCurrentFieldIndex(prev => prev + 1)
            } else if (currentStepIndex < steps.length - 1) {
              setCurrentStepIndex(prev => prev + 1)
              setCurrentFieldIndex(0)
            } else {
              onComplete(formData)
            }
          }
        }
        break
      }

      case 'confirm': {
        if (key.leftArrow || key.rightArrow || input === 'y' || input === 'n') {
          const currentValue = formData[currentField.id] as boolean ?? true
          let newValue: boolean

          if (input === 'y') newValue = true
          else if (input === 'n') newValue = false
          else newValue = !currentValue

          setFormData(prev => ({
            ...prev,
            [currentField.id]: newValue,
          }))
        } else if (key.return) {
          // Move to next field or step
          if (currentFieldIndex < currentStep.fields.length - 1) {
            setCurrentFieldIndex(prev => prev + 1)
          } else if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(prev => prev + 1)
            setCurrentFieldIndex(0)
          } else {
            onComplete(formData)
          }
        }
        break
      }

      case 'text': {
        // Simplified: In real implementation, would use TextInput component
        if (key.return) {
          if (currentFieldIndex < currentStep.fields.length - 1) {
            setCurrentFieldIndex(prev => prev + 1)
          } else if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(prev => prev + 1)
            setCurrentFieldIndex(0)
          } else {
            onComplete(formData)
          }
        }
        break
      }
    }
  })

  if (!currentStep || !currentField) {
    return <Text color={theme.error}>No steps configured</Text>
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border}
        paddingX={2}
        paddingY={1}
      >
        {/* Title */}
        <Text bold color={theme.primary}>{title}</Text>

        {/* Progress Indicator */}
        <Box marginY={1}>
          <ProgressIndicator
            steps={steps}
            currentStepIndex={currentStepIndex}
            theme={theme}
          />
        </Box>

        {/* Current Step Header */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color={theme.text}>{currentStep.title}</Text>
          {currentStep.description && (
            <Text color={theme.dimText}>{currentStep.description}</Text>
          )}
        </Box>

        {/* Current Step Fields */}
        <Box flexDirection="column" gap={1}>
          {currentStep.fields.map((field, index) => {
            const isFocused = index === currentFieldIndex
            const value = formData[field.id]

            switch (field.type) {
              case 'select':
                return (
                  <SelectField
                    key={field.id}
                    field={field}
                    value={value as string}
                    selectedIndex={selectIndices[field.id] ?? 0}
                    isFocused={isFocused}
                    theme={theme}
                  />
                )
              case 'confirm':
                return (
                  <ConfirmField
                    key={field.id}
                    field={field}
                    value={(value as boolean) ?? true}
                    isFocused={isFocused}
                    theme={theme}
                  />
                )
              case 'text':
              default:
                return (
                  <TextField
                    key={field.id}
                    field={field}
                    value={(value as string) ?? ''}
                    isFocused={isFocused}
                    theme={theme}
                  />
                )
            }
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color={theme.dimText}>
          Tab to switch fields · ↑/↓ to select · Enter to confirm · Esc to cancel
        </Text>
      </Box>
    </Box>
  )
}

export default FormWizard
