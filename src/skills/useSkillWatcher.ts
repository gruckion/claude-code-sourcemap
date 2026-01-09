/**
 * React Hook for Skill Hot-Reload
 *
 * Provides a React hook that automatically re-renders components
 * when skills change on disk.
 */

import { useCallback, useEffect, useState } from 'react'
import { loadAllSkills, subscribeToSkillChanges } from './loader.js'
import { skillWatcher } from './watcher.js'
import type { Skill } from './types.js'

/**
 * Hook that returns skills and re-renders when they change
 *
 * @param filter - Optional filter function to limit which skills are returned
 * @returns Array of skills that match the filter
 *
 * @example
 * ```tsx
 * function SkillList() {
 *   const skills = useSkills()
 *   return (
 *     <ul>
 *       {skills.map(skill => (
 *         <li key={skill.name}>{skill.name}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useSkills(filter?: (skill: Skill) => boolean): Skill[] {
  const [skills, setSkills] = useState<Skill[]>(() => {
    const allSkills = loadAllSkills()
    return filter ? allSkills.filter(filter) : allSkills
  })

  const refreshCallback = useCallback(async () => {
    try {
      // Clear any memoization and reload
      const allSkills = loadAllSkills()
      setSkills(filter ? allSkills.filter(filter) : allSkills)
    } catch (error) {
      if (error instanceof Error) {
        console.error('[useSkills] Error refreshing skills:', error.message)
      }
    }
  }, [filter])

  useEffect(() => {
    // Subscribe to skill changes
    const unsubscribe = skillWatcher.subscribe(refreshCallback)

    return unsubscribe
  }, [refreshCallback])

  return skills
}

/**
 * Hook that returns user-invocable skills only
 *
 * These are the skills that appear in the slash command menu.
 */
export function useUserInvocableSkills(): Skill[] {
  return useSkills(skill => skill.userInvocable)
}

/**
 * Hook that returns a single skill by name
 *
 * Re-renders when the skill changes on disk.
 */
export function useSkill(name: string): Skill | undefined {
  const skills = useSkills(skill => skill.name === name)
  return skills[0]
}

/**
 * Hook that returns whether a skill exists
 */
export function useHasSkill(name: string): boolean {
  const skill = useSkill(name)
  return skill !== undefined
}

/**
 * Hook that tracks skill watcher status
 */
export function useSkillWatcherStatus(): {
  isActive: boolean
  subscriberCount: number
} {
  const [status, setStatus] = useState({
    isActive: skillWatcher.isActive(),
    subscriberCount: skillWatcher.getSubscriberCount(),
  })

  useEffect(() => {
    // Update status when skills change (proxy for watcher activity)
    const unsubscribe = skillWatcher.subscribe(() => {
      setStatus({
        isActive: skillWatcher.isActive(),
        subscriberCount: skillWatcher.getSubscriberCount(),
      })
    })

    return unsubscribe
  }, [])

  return status
}
