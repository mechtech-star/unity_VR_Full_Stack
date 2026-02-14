import { X, Plus, Trash2, Maximize, Image as ImageIcon, Box, MousePointerClick, CheckCircle2, HelpCircle, Play, Pause } from 'lucide-react'
import { useEffect, useRef, Suspense, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Bounds, useBounds, useAnimations, Environment, Center, ContactShadows } from '@react-three/drei'
import { Button } from '../ui/button'
import { Select, SelectItem } from '../ui/select'
import { SearchableSelect } from '../ui/searchable-select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import type { Step, StepChoice, MediaType, UpdateStepRequest, StepModel } from '../../types'
import { BACKEND_BASE_URL } from '../../lib/api'

const MEDIA_TYPES: MediaType[] = ['image', 'video']
const COMPLETION_TYPES = ['button_clicked', 'animation_completed', 'interaction_completed', 'time_spent', 'user_confirmed']

export type DetailTab = 'media' | 'model' | 'interaction' | 'completion' | 'choices'

/* ── Preview scene rendered inside the model Canvas ── */
function ModelScene({ url, animation, loop, isPlaying }: { url: string; animation?: string; loop?: boolean; isPlaying: boolean }) {
  const { scene, animations } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const group = useRef<InstanceType<typeof THREE.Group>>(null)
  const { actions, names } = useAnimations(animations, group)
  const currentActionRef = useRef<THREE.AnimationAction | null>(null)
  const isPlayingRef = useRef(isPlaying)
  isPlayingRef.current = isPlaying

  // Setup effect: runs when animation clip, actions, or loop changes
  useEffect(() => {
    Object.values(actions).forEach(a => a?.stop())
    currentActionRef.current = null

    if (!animation || !names.includes(animation)) return

    const action = actions[animation]
    if (!action) return

    currentActionRef.current = action
    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    action.paused = !isPlayingRef.current
    action.play()

    return () => { action.stop() }
  }, [animation, actions, names, loop])

  // Play/pause effect: toggles without resetting the animation
  useEffect(() => {
    const action = currentActionRef.current
    if (!action) return
    action.paused = !isPlaying
  }, [isPlaying])

  return (
    <group ref={group}>
      <primitive object={cloned} />
    </group>
  )
}

/* ── Invisible helper that exposes the Bounds .fit() to an external ref ── */
function BoundsController({ fitRef }: { fitRef: React.MutableRefObject<(() => void) | null> }) {
  const api = useBounds()
  useEffect(() => { fitRef.current = () => api.refresh().clip().fit() }, [api, fitRef])
  return null
}

interface StepDetailsPanelProps {
  step: Step
  onUpdate: (patch: UpdateStepRequest) => void
  assets: Array<{ id: string; name?: string; originalFilename?: string; metadata?: Record<string, unknown>; type?: string; url?: string }>
  allSteps: Step[]
  activeTab: DetailTab
  activeModelIndex: number
  onTabChange: (tab: DetailTab) => void
  onClose: () => void
}

export default function StepDetailsPanel({
  step,
  onUpdate,
  assets,
  allSteps,
  activeTab,
  activeModelIndex,
  onTabChange,
  onClose,
}: StepDetailsPanelProps) {
  const fitRef = useRef<(() => void) | null>(null)

  const inputClass = 'w-full rounded-md border border-border px-3 py-2 bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30'
  const labelClass = 'block text-sm font-medium text-foreground mb-1'

  const getModelAsset = (model: StepModel) => model.asset ? assets.find(a => a.id === model.asset) : null
  const getModelAnimations = (model: StepModel): Array<{ name: string }> => {
    const asset = getModelAsset(model)
    return (asset?.metadata?.animations || []) as Array<{ name: string }>
  }
  const mediaAsset = step.media_asset ? assets.find(a => a.id === step.media_asset) : null

  const updateModel = (index: number, patch: Partial<StepModel>) => {
    const updatedModels = [...(step.models || [])]
    updatedModels[index] = { ...updatedModels[index], ...patch }
    onUpdate({ models: updatedModels })
  }

  const removeModel = (index: number) => {
    const updatedModels = (step.models || []).filter((_, i) => i !== index)
    onUpdate({ models: updatedModels })
  }

  const activeModel = activeModelIndex >= 0 ? (step.models || [])[activeModelIndex] : null

  const [isAnimationPlaying, setIsAnimationPlaying] = useState(true)

  useEffect(() => {
    if (activeModel?.asset && fitRef.current) {
      // Small delay to ensure the scene is loaded
      setTimeout(() => fitRef.current?.(), 100)
    }
    // Auto-play animation when switching models
    setIsAnimationPlaying(!!activeModel?.animation)
  }, [activeModelIndex, activeModel?.asset, activeModel?.animation])

  // Build visible tabs dynamically
  const showChoices = step.instruction_type === 'question'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card/80 backdrop-blur-md shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Step Details</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close details">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as DetailTab)} className="flex-1 flex flex-col min-h-0">
        <div className="px-2 pt-2 shrink-0">
          <TabsList className="w-full">
            <TabsTrigger value="media" className="gap-1">
              <ImageIcon className="w-3 h-3" />
              Media
            </TabsTrigger>
            <TabsTrigger value="model" className="gap-1">
              <Box className="w-3 h-3" />
              Model
            </TabsTrigger>
            <TabsTrigger value="interaction" className="gap-1">
              <MousePointerClick className="w-3 h-3" />
              Interact
            </TabsTrigger>
            <TabsTrigger value="completion" className="gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Done
            </TabsTrigger>
            {showChoices && (
              <TabsTrigger value="choices" className="gap-1">
                <HelpCircle className="w-3 h-3" />
                Choices
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── Media Tab ── */}
          <TabsContent value="media" className="p-3 space-y-4">
            <div>
              <label className={labelClass}>Type</label>
              <Select
                value={step.media_type || ''}
                onValueChange={(value) => {
                  const val = value as MediaType | ''
                  onUpdate({ media_type: val || null })
                }}
              >
                <SelectItem value="">None</SelectItem>
                {MEDIA_TYPES.map(t => (
                  <SelectItem key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div>
              <label className={labelClass}>Asset</label>
              <SearchableSelect
                value={step.media_asset || ''}
                onValueChange={(value) => onUpdate({ media_asset: value || null })}
                placeholder="Select media"
                options={[
                  { value: '', label: 'None' },
                  ...assets
                    .filter(a => a.type === 'image' || a.type === 'video')
                    .map(a => ({ value: a.id, label: a.originalFilename || a.name || a.id }))
                ]}
              />
            </div>

            {mediaAsset && (
              <div className="rounded-md border border-border/50 p-2 bg-muted/30">
                {step.media_type === 'video' ? (
                  <video src={`${BACKEND_BASE_URL}${mediaAsset.url}`} controls className="w-full rounded" />
                ) : (
                  <img src={`${BACKEND_BASE_URL}${mediaAsset.url}`} alt="media preview" className="w-full rounded" />
                )}
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground truncate">{mediaAsset.originalFilename || mediaAsset.name}</span>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Model Tab ── */}
          <TabsContent value="model" className="p-3 space-y-4">
            {activeModel ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Model {activeModelIndex + 1}</span>
                </div>
                <p className="text-xs text-muted-foreground">Configure this 3D model's asset, animation, and transform.</p>

                <div>
                  <label className={labelClass}>Model Asset</label>
                  <SearchableSelect
                    value={activeModel.asset || ''}
                    onValueChange={(value) => updateModel(activeModelIndex, { asset: value || null })}
                    placeholder="Select model"
                    options={[
                      { value: '', label: 'None' },
                      ...assets
                        .filter(a => a.type === 'gltf' || a.type === 'model')
                        .map(a => ({ value: a.id, label: a.originalFilename || a.name || a.id }))
                    ]}
                  />
                </div>

                {activeModel.asset && (() => {
                  const asset = getModelAsset(activeModel)
                  const modelUrl = asset?.url ? `${BACKEND_BASE_URL}${asset.url}` : null
                  const modelAnimations = getModelAnimations(activeModel)
                  return (
                    <>
                      {modelUrl && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className={labelClass}>Preview</label>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => fitRef.current?.()}
                            >
                              <Maximize className="w-3.5 h-3.5 mr-1" /> Fit
                            </Button>
                          </div>
                          <div className="w-full h-80 border border-border rounded-lg overflow-hidden bg-[radial-gradient(circle_at_center,rgba(128,128,128,0.25)_0%,transparent_70%)]">
                            <Canvas camera={{ position: [0, 1, 5], fov: 45 }} shadows>
                              <Suspense fallback={null}>
                                <Environment preset="studio" />
                                <Bounds fit clip observe margin={1.5}>
                                  <BoundsController fitRef={fitRef} />
                                  <Center>
                                    <ModelScene key={`${modelUrl}-${activeModelIndex}`} url={modelUrl} animation={activeModel.animation} loop={activeModel.animation_loop} isPlaying={isAnimationPlaying} />
                                  </Center>
                                </Bounds>
                                <ContactShadows position={[0, -1, 0]} opacity={0.35} scale={10} blur={2} />
                              </Suspense>
                              <OrbitControls makeDefault enablePan enableZoom enableRotate />
                            </Canvas>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className={labelClass}>Animation</label>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1">
                            {modelAnimations.length > 0 ? (
                              <Select
                                value={activeModel.animation || ''}
                                onValueChange={(value) => { updateModel(activeModelIndex, { animation: value }); if (value) setIsAnimationPlaying(true) }}
                              >
                                <SelectItem value="">(none)</SelectItem>
                                {modelAnimations.map((a: { name: string }, i: number) => (
                                  <SelectItem key={i} value={a.name}>
                                    {a.name || `clip-${i}`}
                                  </SelectItem>
                                ))}
                              </Select>
                            ) : (
                              <input
                                className={inputClass}
                                value={activeModel.animation || ''}
                                onChange={(e) => updateModel(activeModelIndex, { animation: e.target.value })}
                                placeholder="Animation clip name"
                              />
                            )}
                          </div>
                          {activeModel.animation && (
                            <Button
                              variant="outline" size="icon-sm"
                              className="shrink-0"
                              onClick={() => setIsAnimationPlaying(!isAnimationPlaying)}
                              title={isAnimationPlaying ? 'Pause' : 'Play'}
                            >
                              {isAnimationPlaying ? (
                                <Pause className="w-3.5 h-3.5" />
                              ) : (
                                <Play className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Playback</label>
                        <Select
                          value={activeModel.animation_loop ? 'loop' : 'once'}
                          onValueChange={(value) => updateModel(activeModelIndex, { animation_loop: value === 'loop' })}
                        >
                          <SelectItem value="once">Play Once</SelectItem>
                          <SelectItem value="loop">Loop</SelectItem>
                        </Select>
                      </div>

                      <fieldset className="border border-border rounded-lg p-3 space-y-3">
                        <legend className="text-xs font-semibold text-muted-foreground px-2 uppercase">Transform</legend>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Position</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(['x', 'y', 'z'] as const).map(axis => (
                              <div key={`pos-${axis}`}>
                                <label className="text-xs text-muted-foreground">{axis.toUpperCase()}</label>
                                <input
                                  type="number" step="0.1" className={inputClass}
                                  value={activeModel[`position_${axis}`] ?? 0}
                                  onChange={(e) => updateModel(activeModelIndex, { [`position_${axis}`]: parseFloat(e.target.value) || 0 })}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Rotation</label>
                          <div className="grid grid-cols-3 gap-2">
                            {(['x', 'y', 'z'] as const).map(axis => (
                              <div key={`rot-${axis}`}>
                                <label className="text-xs text-muted-foreground">{axis.toUpperCase()}</label>
                                <input
                                  type="number" step="1" className={inputClass}
                                  value={activeModel[`rotation_${axis}`] ?? 0}
                                  onChange={(e) => updateModel(activeModelIndex, { [`rotation_${axis}`]: parseFloat(e.target.value) || 0 })}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">Scale</label>
                          <input
                            type="number" step="0.1" className={inputClass}
                            value={activeModel.scale ?? 1}
                            onChange={(e) => updateModel(activeModelIndex, { scale: parseFloat(e.target.value) || 1 })}
                          />
                        </div>
                      </fieldset>
                    </>
                  )
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Box className="w-10 h-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Select a model card from the step configuration to edit its properties here.</p>
              </div>
            )}
          </TabsContent>

          {/* ── Interaction Tab ── */}
          <TabsContent value="interaction" className="p-3 space-y-4">
            <p className="text-xs text-muted-foreground">Define how the user interacts with this step.</p>
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
              <label className={labelClass}>Target Object</label>
              <input
                className={inputClass}
                value={step.interaction_target || ''}
                onChange={(e) => onUpdate({ interaction_target: e.target.value })}
                placeholder="Object to interact with"
              />
            </div>
            <div>
              <label className={labelClass}>Hand</label>
              <Select
                value={step.interaction_hand || ''}
                onValueChange={(value) => onUpdate({ interaction_hand: value })}
              >
                <SelectItem value="">Any</SelectItem>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </Select>
            </div>
            <div>
              <label className={labelClass}>Attempts Allowed</label>
              <input
                type="number" min="0"
                className={inputClass}
                value={step.interaction_attempts_allowed ?? 0}
                onChange={(e) => onUpdate({ interaction_attempts_allowed: parseInt(e.target.value) || 0 })}
              />
            </div>
          </TabsContent>

          {/* ── Completion Tab ── */}
          <TabsContent value="completion" className="p-3 space-y-4">
            <p className="text-xs text-muted-foreground">When is this step considered completed?</p>
            <div>
              <label className={labelClass}>Type</label>
              <Select
                value={step.completion_type || ''}
                onValueChange={(value) => onUpdate({ completion_type: value })}
              >
                <SelectItem value="">None</SelectItem>
                {COMPLETION_TYPES.map(t => (
                  <SelectItem key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </Select>
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
          </TabsContent>

          {/* ── Choices Tab ── */}
          {showChoices && (
            <TabsContent value="choices" className="p-3 space-y-4">
              <p className="text-xs text-muted-foreground">Define answer options and where each leads.</p>
              {(step.choices || []).map((choice, cIdx) => (
                <div key={cIdx} className="space-y-2 border border-border rounded-lg p-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Choice {cIdx + 1}</span>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => {
                        const updated = (step.choices || []).filter((_, i) => i !== cIdx)
                        onUpdate({ choices: updated })
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div>
                    <label className={labelClass}>Label</label>
                    <input
                      className={inputClass}
                      value={choice.label}
                      onChange={(e) => {
                        const updated = [...(step.choices || [])]
                        updated[cIdx] = { ...updated[cIdx], label: e.target.value }
                        onUpdate({ choices: updated })
                      }}
                      placeholder="Choice label"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Go to Step</label>
                    <Select
                      value={choice.go_to_step || ''}
                      onValueChange={(value) => {
                        const updated = [...(step.choices || [])]
                        updated[cIdx] = { ...updated[cIdx], go_to_step: value || null }
                        onUpdate({ choices: updated })
                      }}
                    >
                      <SelectItem value="">Next step</SelectItem>
                      {allSteps
                        .filter(s => s.id !== step.id)
                        .map(s => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title || s.id}
                          </SelectItem>
                        ))}
                    </Select>
                  </div>
                </div>
              ))}

              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const next: StepChoice[] = [...(step.choices || []), { label: '', go_to_step: null, order_index: (step.choices?.length || 0) }]
                  onUpdate({ choices: next })
                }}
              >
                <Plus className="w-4 h-4 mr-1" /> Add Choice
              </Button>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  )
}
