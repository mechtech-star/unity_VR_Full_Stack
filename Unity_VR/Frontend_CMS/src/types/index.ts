// ── Unity Training Module Types ──────────────────────────────────────

export type InstructionType =
  | 'info'
  | 'safety'
  | 'observe'
  | 'action'
  | 'inspect'
  | 'completion'
  | 'question'

export type MediaType = 'image' | 'video'

export type CompletionType =
  | 'button_clicked'
  | 'animation_completed'
  | 'interaction_completed'
  | 'time_spent'
  | 'user_confirmed'

export type HandType = 'left' | 'right' | ''

// ── Step Choice (Branching) ──────────────────────────────────────────
export interface StepChoice {
  id?: string
  label: string
  go_to_step: string | null  // Step UUID
  order_index: number
}

// ── Step ─────────────────────────────────────────────────────────────
export interface Step {
  id: string
  module: string
  task?: string
  order_index: number
  title: string
  description: string
  instruction_type: InstructionType

  // Media
  media_type?: MediaType | null
  media_asset?: string | null
  media_asset_url?: string
  media_asset_filename?: string

  // 3D Model
  model_asset?: string | null
  model_asset_url?: string
  model_asset_filename?: string
  model_asset_metadata?: any
  model_animation: string
  model_position_x: number
  model_position_y: number
  model_position_z: number
  model_rotation_x: number
  model_rotation_y: number
  model_rotation_z: number
  model_scale: number
  model_animation_loop: boolean

  // Interaction
  interaction_required_action: string
  interaction_input_method: string
  interaction_target: string
  interaction_hand: HandType
  interaction_attempts_allowed: number

  // Completion Criteria
  completion_type: string
  completion_value: string

  // Branching choices
  choices?: StepChoice[]

  created_at: string
  updated_at: string
}

// ── Task ─────────────────────────────────────────────────────────────
export interface Task {
  id: string
  module: string
  order_index: number
  title: string
  description?: string
  created_at: string
  updated_at: string
  steps?: Step[]
}

// ── Module ───────────────────────────────────────────────────────────
export interface Module {
  id: string
  module_id: string
  title: string
  description: string
  version: string
  mode: 'VR' | 'AR'
  estimated_duration_min: number
  language: string
  icon: string
  thumbnail?: string | null
  thumbnail_url?: string
  tags: string[]
  status: 'draft' | 'published'
  created_at: string
  updated_at: string
  tasks?: Task[]
}

// ── Asset ────────────────────────────────────────────────────────────
export interface Asset {
  id: string
  type: string
  mimeType: string
  url: string
  originalFilename: string
  sizeBytes: number
  metadata?: any
  created_at: string
}

// ── API Request Types ────────────────────────────────────────────────
export interface CreateModuleRequest {
  title: string
  description?: string
  mode?: string
  estimated_duration_min?: number
  language?: string
  icon?: string
  tags?: string[]
}

export interface UpdateStepRequest {
  title?: string
  description?: string
  instruction_type?: InstructionType
  media_type?: MediaType | null
  media_asset?: string | null
  model_asset?: string | null
  model_animation?: string
  model_position_x?: number
  model_position_y?: number
  model_position_z?: number
  model_rotation_x?: number
  model_rotation_y?: number
  model_rotation_z?: number
  model_scale?: number
  model_animation_loop?: boolean
  interaction_required_action?: string
  interaction_input_method?: string
  interaction_target?: string
  interaction_hand?: string
  interaction_attempts_allowed?: number
  completion_type?: string
  completion_value?: string
  choices?: StepChoice[]
}
