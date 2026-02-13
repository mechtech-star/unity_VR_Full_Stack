/**
 * API client for backend communication
 * Centralized service for all authoring backend endpoints
 */

import type { Module, Task, Step, Asset, CreateModuleRequest, UpdateStepRequest } from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

interface ApiResponse<T> {
  data?: T
  error?: string
  detail?: string
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T | null> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let errorData: any = {}
      try {
        errorData = text ? JSON.parse(text) : {}
      } catch (e) {
        // ignore non-json error body
      }
      throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`)
    }

    if (response.status === 204) return null

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      return response.json()
    }

    const text = await response.text().catch(() => '')
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (e) {
      return (text as unknown) as T
    }
  }

  // ── Module API ───────────────────────────────────────────────────
  async createModule(data: CreateModuleRequest): Promise<Module | null> {
    return this.request<Module>('/modules', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getModule(moduleId: string): Promise<Module | null> {
    return this.request<Module>(`/modules/${moduleId}`)
  }

  async getModules(): Promise<Module[] | null> {
    return this.request<Module[]>('/modules')
  }

  async updateModule(moduleId: string, updates: Partial<Module>): Promise<Module | null> {
    return this.request<Module>(`/modules/${moduleId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteModule(moduleId: string): Promise<null> {
    return this.request(`/modules/${moduleId}`, {
      method: 'DELETE',
    })
  }

  async publishModule(moduleId: string): Promise<Module | null> {
    return this.request<Module>(`/modules/${moduleId}/publish`, {
      method: 'POST',
    })
  }

  // ── Task API ─────────────────────────────────────────────────────
  async createTask(moduleId: string, title: string, description?: string, orderIndex?: number): Promise<Task | null> {
    return this.request<Task>('/tasks/', {
      method: 'POST',
      body: JSON.stringify({
        module: moduleId,
        title,
        description: description || '',
        order_index: orderIndex || 1,
      }),
    })
  }

  async getTask(taskId: string): Promise<Task | null> {
    return this.request<Task>(`/tasks/${taskId}/`)
  }

  async getTasks(moduleId?: string): Promise<Task[] | null> {
    const url = moduleId ? `/tasks/?module_id=${moduleId}` : '/tasks/'
    return this.request<Task[]>(url)
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    return this.request<Task>(`/tasks/${taskId}/`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteTask(taskId: string): Promise<null> {
    return this.request(`/tasks/${taskId}/`, {
      method: 'DELETE',
    })
  }

  async reorderTasks(taskIds: string[]): Promise<null> {
    return this.request('/tasks/reorder/', {
      method: 'POST',
      body: JSON.stringify({ task_ids: taskIds }),
    })
  }

  async getTaskSteps(taskId: string): Promise<Step[] | null> {
    return this.request<Step[]>(`/tasks/${taskId}/steps/`)
  }

  // ── Step API ─────────────────────────────────────────────────────
  async createStep(moduleId: string, taskId: string, title: string, orderIndex?: number): Promise<Step | null> {
    return this.request<Step>(`/modules/${moduleId}/steps`, {
      method: 'POST',
      body: JSON.stringify({
        task: taskId,
        title,
        description: '',
        instruction_type: 'info',
        order_index: orderIndex ?? 0,
      }),
    })
  }

  async updateStep(stepId: string, updates: UpdateStepRequest): Promise<Step | null> {
    return this.request<Step>(`/steps/${stepId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  async deleteStep(stepId: string): Promise<null> {
    return this.request(`/steps/${stepId}`, {
      method: 'DELETE',
    })
  }

  async reorderSteps(moduleId: string, orderedStepIds: string[]): Promise<null> {
    return this.request(`/modules/${moduleId}/steps/reorder`, {
      method: 'POST',
      body: JSON.stringify({ orderedStepIds }),
    })
  }

  // ── Asset API ────────────────────────────────────────────────────
  async uploadAsset(
    file: File,
    type: 'image' | 'audio' | 'video' | 'gltf' | 'model' | 'other',
    metadata?: any
  ): Promise<Asset | null> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata))
    }

    const response = await fetch(`${this.baseUrl}/assets/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let errorData: any = {}
      try {
        errorData = JSON.parse(text || '{}')
      } catch (e) {}
      throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async deleteAsset(assetId: string): Promise<null> {
    const url = `${this.baseUrl}/assets/${assetId}`
    const response = await fetch(url, { method: 'DELETE' })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      let errorData: any = {}
      try {
        errorData = JSON.parse(text || '{}')
      } catch (e) {}
      throw new Error(errorData.detail || errorData.error || `HTTP ${response.status}`)
    }
    const text = await response.text().catch(() => '')
    if (!text) return null
    return JSON.parse(text)
  }

  async getAssets(): Promise<Asset[] | null> {
    return this.request<Asset[]>('/assets')
  }
}

export const apiClient = new ApiClient(API_BASE_URL)
export type { ApiResponse }
