/**
 * Skill Hot-Reload Watcher
 *
 * Watches skill directories for changes and automatically reloads skills
 * without requiring a session restart.
 *
 * Based on Claude Code 2.1.0 implementation using chokidar.
 */

import chokidar, { FSWatcher } from 'chokidar'
import { existsSync, statSync } from 'fs'
import { join, resolve, sep } from 'path'
import { homedir } from 'os'
import { clearSkillsCache, loadAllSkills } from './loader.js'
import type { SkillWatcherOptions, SkillChangeCallback } from './types.js'

// Default configuration
const DEFAULT_STABILITY_THRESHOLD = 1000 // Wait 1 second for file to stabilize
const DEFAULT_POLL_INTERVAL = 500

// Module state
let fileWatcher: FSWatcher | null = null
let isWatcherInitialized = false
let isWatcherDisposed = false
let watcherOptions: SkillWatcherOptions | null = null

// Subscribers to skill change events
const changeSubscribers = new Set<SkillChangeCallback>()

/**
 * Get the directories to watch for skill changes
 */
async function getSkillDirectoriesToWatch(): Promise<string[]> {
  const directories: string[] = []

  // User settings: ~/.claude/skills
  const userSkillsDir = join(homedir(), '.claude', 'skills')
  try {
    if (existsSync(userSkillsDir) && statSync(userSkillsDir).isDirectory()) {
      directories.push(userSkillsDir)
    }
  } catch {
    // Directory doesn't exist or can't be accessed
  }

  // Project settings: .claude/skills
  const projectSkillsDir = resolve('.claude', 'skills')
  try {
    if (
      existsSync(projectSkillsDir) &&
      statSync(projectSkillsDir).isDirectory()
    ) {
      directories.push(projectSkillsDir)
    }
  } catch {
    // Directory doesn't exist or can't be accessed
  }

  return directories
}

/**
 * Handle a skill file change event
 */
function handleSkillChange(filePath: string): void {
  console.debug(`[SkillWatcher] Detected skill change: ${filePath}`)

  // Clear the cache so skills are reloaded on next access
  clearSkillsCache()

  // Reload skills immediately
  try {
    const skills = loadAllSkills()
    console.debug(`[SkillWatcher] Reloaded ${skills.length} skills`)
  } catch (error) {
    console.error('[SkillWatcher] Error reloading skills:', error)
  }

  // Notify all subscribers
  changeSubscribers.forEach(callback => {
    try {
      callback()
    } catch (error) {
      console.error('[SkillWatcher] Error in change subscriber:', error)
    }
  })
}

/**
 * Initialize the skill watcher
 *
 * This starts watching the skill directories for changes.
 * When a skill file is added, modified, or deleted, the skills
 * are automatically reloaded without requiring a session restart.
 */
export async function initializeSkillWatcher(
  options?: SkillWatcherOptions,
): Promise<void> {
  // Prevent double initialization
  if (isWatcherInitialized || isWatcherDisposed) {
    return
  }

  isWatcherInitialized = true
  watcherOptions = options ?? null

  const directories = await getSkillDirectoriesToWatch()

  if (directories.length === 0) {
    console.debug('[SkillWatcher] No skill directories found to watch')
    return
  }

  console.debug(
    `[SkillWatcher] Watching for changes in: ${directories.join(', ')}`,
  )

  // Create the chokidar watcher
  fileWatcher = chokidar.watch(directories, {
    // Keep watching even when Node process is idle
    persistent: true,

    // Don't trigger for files that exist when watcher starts
    ignoreInitial: true,

    // Watch up to 2 levels deep (skills directory + subdirectories)
    depth: 2,

    // Wait for files to finish being written before triggering
    awaitWriteFinish: {
      stabilityThreshold:
        watcherOptions?.stabilityThreshold ?? DEFAULT_STABILITY_THRESHOLD,
      pollInterval: watcherOptions?.pollInterval ?? DEFAULT_POLL_INTERVAL,
    },

    // Ignore .git directories
    ignored: (path: string) => path.split(sep).some(part => part === '.git'),

    // Don't fail on permission errors
    ignorePermissionErrors: true,

    // Don't use polling (more efficient)
    usePolling: false,

    // Handle atomic writes (common with text editors)
    atomic: true,
  })

  // Register event handlers
  fileWatcher.on('add', handleSkillChange)
  fileWatcher.on('change', handleSkillChange)
  fileWatcher.on('unlink', handleSkillChange)

  // Handle errors
  fileWatcher.on('error', error => {
    console.error('[SkillWatcher] Watcher error:', error)
  })

  // Log when ready
  fileWatcher.on('ready', () => {
    console.debug('[SkillWatcher] Initial scan complete. Ready for changes.')
  })
}

/**
 * Dispose of the skill watcher
 *
 * Stops watching for skill changes and cleans up resources.
 */
export function disposeSkillWatcher(): void {
  isWatcherDisposed = true

  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }

  changeSubscribers.clear()
}

/**
 * Subscribe to skill change events
 *
 * Returns an unsubscribe function.
 */
export function subscribeToSkillChanges(
  callback: SkillChangeCallback,
): () => void {
  changeSubscribers.add(callback)

  return () => {
    changeSubscribers.delete(callback)
  }
}

/**
 * Check if the watcher is currently active
 */
export function isWatcherActive(): boolean {
  return isWatcherInitialized && !isWatcherDisposed && fileWatcher !== null
}

/**
 * Reset the watcher for testing purposes
 */
export function resetSkillWatcherForTesting(
  options?: SkillWatcherOptions,
): void {
  if (fileWatcher) {
    fileWatcher.close()
    fileWatcher = null
  }

  changeSubscribers.clear()
  isWatcherInitialized = false
  isWatcherDisposed = false
  watcherOptions = options ?? null
}

/**
 * Get the number of active subscribers
 */
export function getSubscriberCount(): number {
  return changeSubscribers.size
}

// Export the watcher instance for advanced usage
export const skillWatcher = {
  initialize: initializeSkillWatcher,
  dispose: disposeSkillWatcher,
  subscribe: subscribeToSkillChanges,
  isActive: isWatcherActive,
  resetForTesting: resetSkillWatcherForTesting,
  getSubscriberCount,
}
