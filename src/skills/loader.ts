/**
 * Skill Loader
 *
 * Loads and parses skill files from various directories:
 * - ~/.claude/skills/ (user settings)
 * - .claude/skills/ (project settings)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve, basename, extname } from 'path'
import { homedir } from 'os'
import matter from 'gray-matter'
import { memoize } from 'lodash-es'
import type { Skill, SkillSource, SkillFrontmatter } from './types.js'

// Cache for loaded skills
let skillsCache: Map<string, Skill> | null = null

/**
 * Get the directory path for a skill source
 */
export function getSkillsDirectory(source: SkillSource): string {
  switch (source) {
    case 'userSettings':
      return join(homedir(), '.claude', 'skills')
    case 'projectSettings':
      return resolve('.claude', 'skills')
    case 'policySettings':
      return join(process.cwd(), '.claude', 'skills')
    case 'plugin':
      return 'plugin'
    default:
      return ''
  }
}

/**
 * Parse a boolean value from frontmatter (handles string 'true'/'false')
 */
function parseBoolean(value: boolean | string | undefined): boolean {
  if (value === undefined) return false
  if (typeof value === 'boolean') return value
  return value.toLowerCase() === 'true'
}

/**
 * Parse allowed-tools from frontmatter (handles both array and comma-separated string)
 */
function parseAllowedTools(
  tools: string[] | string | undefined,
): string[] | undefined {
  if (tools === undefined) return undefined
  if (Array.isArray(tools)) return tools.map(t => t.trim())
  if (typeof tools === 'string') {
    return tools.split(',').map(t => t.trim())
  }
  return undefined
}

/**
 * Get default description from content if not in frontmatter
 */
function getDefaultDescription(content: string, fallback: string): string {
  // Try to get first non-empty line after frontmatter as description
  const lines = content.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
      // Limit to first 100 chars
      return trimmed.length > 100 ? trimmed.slice(0, 100) + '...' : trimmed
    }
  }
  return fallback
}

/**
 * Parse a single skill file
 */
export function parseSkillFile(
  filePath: string,
  source: SkillSource,
): Skill | null {
  try {
    const fileContent = readFileSync(filePath, 'utf-8')
    const { data: frontmatter, content } = matter(fileContent)
    const fm = frontmatter as SkillFrontmatter

    const name = basename(filePath, extname(filePath))
    const baseDir = resolve(filePath, '..')

    // user-invocable defaults to true for skills
    const userInvocable =
      fm['user-invocable'] === undefined
        ? true
        : parseBoolean(fm['user-invocable'])

    const skill: Skill = {
      name,
      description: fm.description ?? getDefaultDescription(content, `Skill: ${name}`),
      content: fileContent,
      frontmatter: fm,
      source,
      baseDir,
      filePath,
      allowedTools: parseAllowedTools(fm['allowed-tools']),
      userInvocable,
      disableModelInvocation: parseBoolean(fm['disable-model-invocation']),
      model: fm.model === 'inherit' ? undefined : fm.model,
      executionContext: fm.context === 'fork' ? 'fork' : undefined,
      agent: fm.agent,
      contentLength: fileContent.length,
      isEnabled: () => true,
      isHidden: !userInvocable,
    }

    return skill
  } catch (error) {
    console.error(`Failed to parse skill file ${filePath}:`, error)
    return null
  }
}

/**
 * Load all skills from a directory
 */
function loadSkillsFromDirectory(
  directory: string,
  source: SkillSource,
): Skill[] {
  const skills: Skill[] = []

  if (!existsSync(directory)) {
    return skills
  }

  try {
    const entries = readdirSync(directory)

    for (const entry of entries) {
      const filePath = join(directory, entry)

      try {
        const stat = statSync(filePath)

        // Skip directories and non-markdown files
        if (stat.isDirectory()) continue
        if (!entry.endsWith('.md')) continue

        const skill = parseSkillFile(filePath, source)
        if (skill) {
          skills.push(skill)
        }
      } catch {
        // Skip files we can't read
        continue
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return skills
}

/**
 * Load all skills from all sources
 */
export function loadAllSkills(): Skill[] {
  // Check cache first
  if (skillsCache !== null) {
    return Array.from(skillsCache.values())
  }

  const allSkills: Skill[] = []
  const seenNames = new Map<string, Skill>()

  // Load from user settings (~/.claude/skills/)
  const userSkillsDir = getSkillsDirectory('userSettings')
  const userSkills = loadSkillsFromDirectory(userSkillsDir, 'userSettings')
  allSkills.push(...userSkills)

  // Load from project settings (.claude/skills/)
  const projectSkillsDir = getSkillsDirectory('projectSettings')
  const projectSkills = loadSkillsFromDirectory(
    projectSkillsDir,
    'projectSettings',
  )
  allSkills.push(...projectSkills)

  // Deduplicate by name (project skills override user skills)
  for (const skill of allSkills) {
    const existing = seenNames.get(skill.name)
    if (existing) {
      // Project settings take priority over user settings
      if (
        skill.source === 'projectSettings' &&
        existing.source === 'userSettings'
      ) {
        seenNames.set(skill.name, skill)
      }
    } else {
      seenNames.set(skill.name, skill)
    }
  }

  // Update cache
  skillsCache = seenNames

  console.debug(
    `Loaded ${seenNames.size} unique skills (user: ${userSkills.length}, project: ${projectSkills.length})`,
  )

  return Array.from(seenNames.values())
}

/**
 * Get a skill by name
 */
export function getSkill(name: string): Skill | undefined {
  const skills = loadAllSkills()
  return skills.find(s => s.name === name)
}

/**
 * Get all user-invocable skills (visible in slash menu)
 */
export function getUserInvocableSkills(): Skill[] {
  return loadAllSkills().filter(s => s.userInvocable)
}

/**
 * Clear the skills cache (called when files change)
 */
export function clearSkillsCache(): void {
  skillsCache = null
}

/**
 * Check if a skill exists
 */
export function hasSkill(name: string): boolean {
  return getSkill(name) !== undefined
}

/**
 * Get memoized skills (for performance)
 */
export const getSkillsMemoized = memoize(loadAllSkills)

/**
 * Refresh skills by clearing cache and reloading
 */
export function refreshSkills(): Skill[] {
  clearSkillsCache()
  getSkillsMemoized.cache.clear?.()
  return loadAllSkills()
}
