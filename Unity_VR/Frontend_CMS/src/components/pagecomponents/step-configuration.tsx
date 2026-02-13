import { X, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { Button } from '../ui/button'
import type { Step, StepChoice, InstructionType, MediaType, UpdateStepRequest } from '../../types'

const INSTRUCTION_TYPES: InstructionType[] = ['info', 'safety', 'observe', 'action', 'inspect', 'completion', 'question']
const MEDIA_TYPES: MediaType[] = ['image', 'video']
const COMPLETION_TYPES = ['button_clicked', 'animation_completed', 'interaction_completed', 'time_spent', 'user_confirmed']

interface StepConfigurationProps {
  step: Step
  onUpdate: (patch: UpdateStepRequest) => void
  onDelete?: () => void
  isSaving?: boolean
  assets?: Array<{ id: string; name?: string; originalFilename?: string; metadata?: Record<string, unknown>; type?: string; url?: string }>
  /** All steps in the module for goToStep dropdowns */
  allSteps?: Step[]
}

export default function StepConfiguration({
  step,
  onUpdate,
  onDelete,
  isSaving = false,
  assets = [],
  allSteps = [],
}: StepConfigurationProps) {
  // Local state for debounced text fields
  const [localDescription, setLocalDescription] = useState(step.description || '')
  const [localTitle, setLocalTitle] = useState(step.title || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when step changes (navigation)
  useEffect(() => {
    setLocalDescription(step.description || '')
    setLocalTitle(step.title || '')
  }, [step.id, step.description, step.title])

  const debouncedUpdate = (patch: UpdateStepRequest) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onUpdate(patch), 600)
  }

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const selectClass = 'w-full rounded border border-border px-3 py-2 bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-accent/20'
  const inputClass = selectClass
  const labelClass = 'block text-sm font-medium text-foreground mb-1'

  // Model asset info
  const modelAsset = step.model_asset ? assets.find(a => a.id === step.model_asset) : null
  const modelAnimations = modelAsset?.metadata?.animations || []

  // Media asset info
  const mediaAsset = step.media_asset ? assets.find(a => a.id === step.media_asset) : null

  return (
    <div className="space-y-6 pb-8">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">
          {step.title || 'Untitled Step'}
        </h3>
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={isSaving}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete Step
          </Button>
        )}
      </div>

      {/* ── Title ──────────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Title</label>
        <input
          className={inputClass}
          value={localTitle}
          onChange={(e) => {
            setLocalTitle(e.target.value)
            debouncedUpdate({ title: e.target.value })
          }}
          placeholder="Step title"
        />
      </div>

      {/* ── Description ────────────────────────────────────── */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          className={`${inputClass} min-h-[120px] resize-y`}
          value={localDescription}
          onChange={(e) => {
            setLocalDescription(e.target.value)
            debouncedUpdate({ description: e.target.value })
          }}
          placeholder="Step description shown to the user..."
        />
      </div>

      {/* ── Instruction Type ───────────────────────────────── */}
      <div>
        <label className={labelClass}>Instruction Type</label>
        <select
          className={selectClass}
          value={step.instruction_type}
          onChange={(e) => onUpdate({ instruction_type: e.target.value as InstructionType })}
        >
          {INSTRUCTION_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* ── Media Section ──────────────────────────────────── */}
      <fieldset className="border border-border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold text-foreground px-2">Media</legend>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <select
              className={selectClass}
              value={step.media_type || ''}
              onChange={(e) => {
                const val = e.target.value as MediaType | ''
                onUpdate({ media_type: val || null })
              }}
            >
              <option value="">None</option>
              {MEDIA_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Asset</label>
            <select
              className={selectClass}
              value={step.media_asset || ''}
              onChange={(e) => onUpdate({ media_asset: e.target.value || null })}
            >
              <option value="">None</option>
              {assets
                .filter(a => a.type === 'image' || a.type === 'video')
                .map(a => (
                  <option key={a.id} value={a.id}>{a.originalFilename || a.name || a.id}</option>
                ))}
            </select>
          </div>
        </div>

        {/* Media preview */}
        {mediaAsset && (
          <div className="rounded-md border border-border/50 p-2 bg-muted/30">
            {step.media_type === 'video' ? (
              <video src={mediaAsset.url} controls className="w-full max-w-xs rounded" />
            ) : (
              <img src={mediaAsset.url} alt="media preview" className="w-full max-w-xs rounded" />
            )}
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{mediaAsset.originalFilename || mediaAsset.name}</span>
              <Button size="sm" variant="ghost" onClick={() => onUpdate({ media_asset: null, media_type: null })}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}
      </fieldset>

      {/* ── 3D Model Section ───────────────────────────────── */}
      <fieldset className="border border-border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold text-foreground px-2">3D Model</legend>

        <div>
          <label className={labelClass}>Model Asset</label>
          <select
            className={selectClass}
            value={step.model_asset || ''}
            onChange={(e) => onUpdate({ model_asset: e.target.value || null })}
          >
            <option value="">None</option>
            {assets
              .filter(a => a.type === 'gltf' || a.type === 'model')
              .map(a => (
                <option key={a.id} value={a.id}>{a.originalFilename || a.name || a.id}</option>
              ))}
          </select>
        </div>

        {step.model_asset && (
          <>
            <div>
              <label className={labelClass}>Animation</label>
              {modelAnimations.length > 0 ? (
                <select
                  className={selectClass}
                  value={step.model_animation || ''}
                  onChange={(e) => onUpdate({ model_animation: e.target.value })}
                >
                  <option value="">(none)</option>
                  {modelAnimations.map((a: { name: string }, i: number) => (
                    <option key={i} value={a.name}>{a.name || `clip-${i}`}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputClass}
                  value={step.model_animation || ''}
                  onChange={(e) => onUpdate({ model_animation: e.target.value })}
                  placeholder="Animation clip name"
                />
              )}
            </div>

            <div>
              <label className={labelClass}>Spawn Transform</label>
              <div className="grid grid-cols-3 gap-2">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <div key={`pos-${axis}`}>
                    <label className="text-xs text-muted-foreground">Pos {axis.toUpperCase()}</label>
                    <input
                      type="number"
                      step="0.1"
                      className={inputClass}
                      value={step[`model_position_${axis}`] ?? 0}
                      onChange={(e) => onUpdate({ [`model_position_${axis}` as keyof UpdateStepRequest]: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {(['x', 'y', 'z'] as const).map(axis => (
                  <div key={`rot-${axis}`}>
                    <label className="text-xs text-muted-foreground">Rot {axis.toUpperCase()}</label>
                    <input
                      type="number"
                      step="1"
                      className={inputClass}
                      value={step[`model_rotation_${axis}`] ?? 0}
                      onChange={(e) => onUpdate({ [`model_rotation_${axis}` as keyof UpdateStepRequest]: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className="text-xs text-muted-foreground">Scale</label>
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={step.model_scale ?? 1}
                  onChange={(e) => onUpdate({ model_scale: parseFloat(e.target.value) || 1 })}
                />
              </div>
            </div>
          </>
        )}
      </fieldset>

      {/* ── Interaction Section ─────────────────────────────── */}
      <fieldset className="border border-border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold text-foreground px-2">Interaction</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Required Action</label>
            <input
              className={inputClass}
              value={step.interaction_required_action || ''}
              onChange={(e) => onUpdate({ interaction_required_action: e.target.value })}
              placeholder="e.g., grab, press, rotate"
            />
          </div>
          <div>
            <label className={labelClass}>Input Method</label>
            <input
              className={inputClass}
              value={step.interaction_input_method || ''}
              onChange={(e) => onUpdate({ interaction_input_method: e.target.value })}
              placeholder="e.g., controller, hand"
            />
          </div>
          <div>
            <label className={labelClass}>Target</label>
            <input
              className={inputClass}
              value={step.interaction_target || ''}
              onChange={(e) => onUpdate({ interaction_target: e.target.value })}
              placeholder="Object to interact with"
            />
          </div>
          <div>
            <label className={labelClass}>Hand</label>
            <select
              className={selectClass}
              value={step.interaction_hand || ''}
              onChange={(e) => onUpdate({ interaction_hand: e.target.value })}
            >
              <option value="">Any</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Attempts Allowed</label>
            <input
              type="number"
              min="0"
              className={inputClass}
              value={step.interaction_attempts_allowed ?? 0}
              onChange={(e) => onUpdate({ interaction_attempts_allowed: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>
      </fieldset>

      {/* ── Completion Criteria ─────────────────────────────── */}
      <fieldset className="border border-border rounded-lg p-4 space-y-3">
        <legend className="text-sm font-semibold text-foreground px-2">Completion Criteria</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Type</label>
            <select
              className={selectClass}
              value={step.completion_type || ''}
              onChange={(e) => onUpdate({ completion_type: e.target.value })}
            >
              <option value="">None</option>
              {COMPLETION_TYPES.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Value</label>
            <input
              className={inputClass}
              value={step.completion_value || ''}
              onChange={(e) => onUpdate({ completion_value: e.target.value })}
              placeholder="e.g., true, 5 (for time_spent)"
            />
          </div>
        </div>
      </fieldset>

      {/* ── Branching Choices (for question type) ──────────── */}
      {step.instruction_type === 'question' && (
        <fieldset className="border border-border rounded-lg p-4 space-y-3">
          <legend className="text-sm font-semibold text-foreground px-2">Choices</legend>

          {(step.choices || []).map((choice, cIdx) => (
            <div key={cIdx} className="flex items-center gap-2">
              <input
                className={`${inputClass} flex-1`}
                value={choice.label}
                onChange={(e) => {
                  const updated = [...(step.choices || [])]
                  updated[cIdx] = { ...updated[cIdx], label: e.target.value }
                  onUpdate({ choices: updated })
                }}
                placeholder="Choice label"
              />
              <select
                className={`${selectClass} w-48`}
                value={choice.go_to_step || ''}
                onChange={(e) => {
                  const updated = [...(step.choices || [])]
                  updated[cIdx] = { ...updated[cIdx], go_to_step: e.target.value || null }
                  onUpdate({ choices: updated })
                }}
              >
                <option value="">Next step</option>
                {allSteps
                  .filter(s => s.id !== step.id)
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.title || s.id}</option>
                  ))}
              </select>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  const updated = (step.choices || []).filter((_, i) => i !== cIdx)
                  onUpdate({ choices: updated })
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next: StepChoice[] = [...(step.choices || []), { label: '', go_to_step: null, order_index: (step.choices?.length || 0) }]
              onUpdate({ choices: next })
            }}
          >
            <Plus className="w-4 h-4 mr-1" /> Add Choice
          </Button>
        </fieldset>
      )}

      {isSaving && (
        <div className="text-xs text-muted-foreground">Saving...</div>
      )}
    </div>
  )
}
