/**
 * Skills Module
 *
 * Provides functionality for loading, managing, and hot-reloading skills.
 *
 * Skills are markdown files with frontmatter that define custom prompts
 * and commands. They can be placed in:
 * - ~/.claude/skills/ (user-level)
 * - .claude/skills/ (project-level)
 *
 * Key features:
 * - Automatic hot-reload: Skills are reloaded when files change
 * - No restart required: Changes are immediately available
 * - Priority: Project skills override user skills with same name
 *
 * @example
 * ```typescript
 * import { initializeSkillWatcher, loadAllSkills, subscribeToSkillChanges } from './skills'
 *
 * // Initialize the watcher at startup
 * await initializeSkillWatcher()
 *
 * // Get all loaded skills
 * const skills = loadAllSkills()
 *
 * // Subscribe to changes
 * const unsubscribe = subscribeToSkillChanges(() => {
 *   console.log('Skills changed!')
 * })
 * ```
 */

// Type exports
export type {
  Skill,
  SkillSource,
  SkillFrontmatter,
  SkillWatcherOptions,
  SkillChangeCallback,
} from './types.js'

// Loader exports
export {
  loadAllSkills,
  getSkill,
  getUserInvocableSkills,
  hasSkill,
  clearSkillsCache,
  refreshSkills,
  parseSkillFile,
  getSkillsDirectory,
  getSkillsMemoized,
} from './loader.js'

// Watcher exports
export {
  initializeSkillWatcher,
  disposeSkillWatcher,
  subscribeToSkillChanges,
  isWatcherActive,
  resetSkillWatcherForTesting,
  getSubscriberCount,
  skillWatcher,
} from './watcher.js'

// React hook exports
export {
  useSkills,
  useUserInvocableSkills,
  useSkill,
  useHasSkill,
  useSkillWatcherStatus,
} from './useSkillWatcher.js'
