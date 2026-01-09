/**
 * Skills Type Definitions
 *
 * Skills are markdown files with frontmatter that define custom prompts
 * and commands that can be invoked by users or Claude.
 */

export type SkillSource =
  | 'userSettings'      // ~/.claude/skills/
  | 'projectSettings'   // .claude/skills/
  | 'policySettings'    // Enterprise managed skills
  | 'plugin'            // From plugins

export interface SkillFrontmatter {
  /** Human-readable description of what this skill does */
  description?: string

  /** Tools this skill is allowed to use */
  'allowed-tools'?: string[] | string

  /** Whether users can invoke this skill directly (default: true) */
  'user-invocable'?: boolean | string

  /** Whether to disable model invocation of this skill */
  'disable-model-invocation'?: boolean | string

  /** Model to use for this skill (e.g., 'sonnet', 'opus', 'haiku', 'inherit') */
  model?: string

  /** Hint for arguments this skill accepts */
  'argument-hint'?: string

  /** Description of when to use this skill (for model suggestions) */
  when_to_use?: string

  /** Version of this skill */
  version?: string

  /** Execution context: 'fork' to run with full conversation context */
  context?: 'fork'

  /** Agent type to use for execution */
  agent?: string

  /** Hooks configuration */
  hooks?: Record<string, unknown>
}

export interface Skill {
  /** Unique name of the skill (filename without extension) */
  name: string

  /** Human-readable description */
  description: string

  /** The full markdown content (including frontmatter) */
  content: string

  /** Parsed frontmatter */
  frontmatter: SkillFrontmatter

  /** Where this skill was loaded from */
  source: SkillSource

  /** Base directory of the skill file */
  baseDir: string

  /** Full path to the skill file */
  filePath: string

  /** Tools this skill is allowed to use */
  allowedTools?: string[]

  /** Whether users can invoke this skill directly */
  userInvocable: boolean

  /** Whether to disable model invocation */
  disableModelInvocation: boolean

  /** Model override for this skill */
  model?: string

  /** Execution context */
  executionContext?: 'fork'

  /** Agent to use for execution */
  agent?: string

  /** Content length for token estimation */
  contentLength: number

  /** Whether this skill is currently enabled */
  isEnabled: () => boolean

  /** Whether this skill should be hidden from menus */
  isHidden: boolean
}

export interface SkillWatcherOptions {
  /** Stability threshold in ms before triggering reload (default: 1000) */
  stabilityThreshold?: number

  /** Poll interval in ms for file stability check (default: 500) */
  pollInterval?: number
}

export type SkillChangeCallback = () => void
