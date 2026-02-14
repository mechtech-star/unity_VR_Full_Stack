import { apiClient } from './api'
import type { Step, Task, UpdateStepRequest } from '../types'

/**
 * Shared step operations service
 * Centralizes logic for step management
 */

/** Delete a step */
export async function deleteStepAndRefresh(stepId: string): Promise<void> {
  await apiClient.deleteStep(stepId)
}

/** Add a new step to a task. If insertAfterOrder is given, inserts after that position; otherwise appends at end. */
export async function addStep(moduleId: string, taskId: string, title?: string, insertAfterOrder?: number): Promise<Step | null> {
  return apiClient.createStep(moduleId, taskId, title, insertAfterOrder)
}

/** Update a step with the given patch data */
export async function updateStep(stepId: string, patch: UpdateStepRequest): Promise<Step | null> {
  return apiClient.updateStep(stepId, patch)
}

/** Fetch the current module to get updated data after changes */
export async function fetchUpdatedModule(moduleId: string): Promise<any> {
  return apiClient.getModule(moduleId)
}

/** Fetch the current task to get updated step ordering */
export async function fetchUpdatedTask(taskId: string): Promise<any> {
  return apiClient.getTask(taskId)
}

export type { Step, Task }
