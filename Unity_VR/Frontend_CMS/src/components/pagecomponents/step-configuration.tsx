import { Plus, Image, Box, MousePointerClick, CheckCircle2, HelpCircle, Trash2 } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Button } from '../ui/button'
import { Select, SelectItem } from '../ui/select'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '../ui/context-menu'
import type { Step, InstructionType, UpdateStepRequest, StepModel } from '../../types'
import { BACKEND_BASE_URL } from '../../lib/api'
import type { DetailTab } from './step-details-panel'

const INSTRUCTION_TYPES: InstructionType[] = ['info', 'safety', 'observe', 'action', 'inspect', 'completion', 'question']

/* ── Offscreen snapshot hook — renders GLTF to a static data-URL image ── */
function useModelSnapshot(url: string | null) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) { setDataUrl(null); return }

    let disposed = false
    const w = 240, h = 240
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(2)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 10, 7)
    scene.add(dir)
    const fill = new THREE.DirectionalLight(0xffffff, 0.4)
    fill.position.set(-5, 0, -5)
    scene.add(fill)

    const loader = new (GLTFLoader as unknown as new () => { load: (url: string, onLoad: (gltf: { scene: InstanceType<typeof THREE.Object3D> }) => void, onProgress?: undefined, onError?: () => void) => void })()
    loader.load(
      url,
      (gltf) => {
        if (disposed) return
        scene.add(gltf.scene)
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        const dist = (maxDim / (2 * Math.tan((45 * Math.PI / 180) / 2))) * 1.6
        camera.position.set(center.x + dist * 0.4, center.y + dist * 0.25, center.z + dist)
        camera.lookAt(center)
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
        setDataUrl(renderer.domElement.toDataURL())
        renderer.dispose()
        renderer.forceContextLoss()
      },
      undefined,
      () => { if (!disposed) setDataUrl(null); renderer.dispose(); renderer.forceContextLoss() },
    )

    return () => { disposed = true; renderer.dispose(); renderer.forceContextLoss() }
  }, [url])

  return dataUrl
}

/* ── Small wrapper so card thumbnails are plain React (no live Canvas) ── */
function ModelSnapshotCard({ url }: { url: string }) {
  const snap = useModelSnapshot(url)
  if (!snap) return <div className="flex items-center justify-center w-full h-full text-xs text-muted-foreground">Loading…</div>
  return <img src={snap} alt="3D model" className="w-full h-full object-contain" />
}

/* ── Preview scene rendered inside the sheet Canvas ── */
/* (moved to step-details-panel.tsx) */

interface StepConfigurationProps {
  step: Step
  onUpdate: (patch: UpdateStepRequest) => void
  isSaving?: boolean
  assets?: Array<{ id: string; name?: string; originalFilename?: string; metadata?: Record<string, unknown>; type?: string; url?: string }>
  onDetailSelect?: (tab: DetailTab, modelIndex?: number) => void
}

export default function StepConfiguration({
  step,
  onUpdate,
  isSaving = false,
  assets = [],
  onDetailSelect,
}: StepConfigurationProps) {
  const [localDescription, setLocalDescription] = useState(step.description || '')
  const [localTitle, setLocalTitle] = useState(step.title || '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalDescription(step.description || '')
    setLocalTitle(step.title || '')
  }, [step.id, step.description, step.title])

  const debouncedUpdate = (patch: UpdateStepRequest) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onUpdate(patch), 600)
  }

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [])

  const inputClass = 'w-full rounded-md border border-border px-3 py-2 bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/30'
  const labelClass = 'block text-sm font-medium text-foreground mb-1'

  const getModelAsset = (model: StepModel) => model.asset ? assets.find(a => a.id === model.asset) : null
  const mediaAsset = step.media_asset ? assets.find(a => a.id === step.media_asset) : null

  const addModel = () => {
    const newModel: StepModel = {
      asset: null,
      animation: '',
      position_x: 0, position_y: 0, position_z: 0,
      rotation_x: 0, rotation_y: 0, rotation_z: 0,
      scale: 1,
      animation_loop: false,
    }
    const updatedModels = [...(step.models || []), newModel]
    onUpdate({ models: updatedModels })
    setTimeout(() => onDetailSelect?.('model', updatedModels.length - 1), 50)
  }

  const handleDropOnMedia = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      const { assetId, assetType } = data
      if (assetType === 'image' || assetType === 'video') {
        onUpdate({ media_asset: assetId, media_type: assetType })
      }
    } catch (err) {
      console.warn('Failed to parse drag data:', err)
    }
  }

  const handleDropOnModel = (e: React.DragEvent, modelIndex: number) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      const { assetId, assetType } = data
      if (assetType === 'gltf') {
        const updatedModels = [...(step.models || [])]
        if (updatedModels[modelIndex]) {
          updatedModels[modelIndex] = { ...updatedModels[modelIndex], asset: assetId }
          onUpdate({ models: updatedModels })
        }
      }
    } catch (err) {
      console.warn('Failed to parse drag data:', err)
    }
  }

  const handleDropOnAddModel = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      const { assetId, assetType } = data
      if (assetType === 'gltf') {
        const newModel: StepModel = {
          asset: assetId,
          animation: '',
          position_x: 0, position_y: 0, position_z: 0,
          rotation_x: 0, rotation_y: 0, rotation_z: 0,
          scale: 1,
          animation_loop: false,
        }
        const updatedModels = [...(step.models || []), newModel]
        onUpdate({ models: updatedModels })
      }
    } catch (err) {
      console.warn('Failed to parse drag data:', err)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const hasInteraction = !!(step.interaction_required_action || step.interaction_target)
  const hasCompletion = !!step.completion_type

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col gap-5 border border-border rounded-lg p-4 bg-accent">
        {/* ── Row 1: Title + Instruction Type ──────────────── */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
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
          <div className="w-44 shrink-0">
            <label className={labelClass}>Instruction Type</label>
            <Select
              value={step.instruction_type}
              onValueChange={(value) => onUpdate({ instruction_type: value as InstructionType })}
            >
              {INSTRUCTION_TYPES.map(t => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>

        {/* ── Row 2: Description ───────────────────────────── */}
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={`${inputClass} min-h-[300px] resize-y`}
            value={localDescription}
            onChange={(e) => {
              const newValue = e.target.value.slice(0, 750)
              setLocalDescription(newValue)
              debouncedUpdate({ description: newValue })
            }}
            placeholder="Step description shown to the user..."
            maxLength={750}
          />
          <div className="text-xs text-muted-foreground mt-1">
            {localDescription.length}/750 characters
          </div>
        </div>
      </div>

      {/* ── Row 3: Media card ────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Media</label>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              onClick={() => onDetailSelect?.('media')}
              onDragOver={handleDragOver}
              onDrop={handleDropOnMedia}
              className="relative flex items-center gap-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors p-3 w-[120px] h-[120px] text-left cursor-pointer"
            >
              {mediaAsset ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  {step.media_type === 'video' ? (
                    <video
                      src={`${BACKEND_BASE_URL}${mediaAsset.url}`}
                      className="w-full h-full object-cover rounded"
                      muted
                      preload="metadata"
                    />
                  ) : (
                    <img
                      src={`${BACKEND_BASE_URL}${mediaAsset.url}`}
                      alt="media thumbnail"
                      className="w-full h-full object-cover rounded"
                    />
                  )}
                  <div className="absolute bottom-1 left-1 right-1 bg-black/50 text-white text-xs rounded px-1 truncate">
                    {mediaAsset.originalFilename || mediaAsset.name}
                  </div>
                </div>
              ) : (
                <>
                  <Image className="w-8 h-8 text-muted-foreground/40 shrink-0" />
                  <div className="text-sm text-muted-foreground">Add media</div>
                </>
              )}
            </button>
          </ContextMenuTrigger>
          {mediaAsset && (
            <ContextMenuContent>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => onUpdate({ media_asset: null, media_type: null })}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove
              </ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenu>
      </div>

      {/* ── Row 4: 3D Models grid ────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">3D Models</label>
        <div className="flex flex-wrap gap-3">
          {(step.models || []).map((model, idx) => {
            const asset = getModelAsset(model)
            const modelUrl = asset?.url ? `${BACKEND_BASE_URL}${asset.url}` : null
            return (
                <ContextMenu key={model.id || idx}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onDetailSelect?.('model', idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnModel(e, idx)}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors p-2 w-[120px] h-[120px] cursor-pointer text-center relative overflow-hidden"
                  >
                    {modelUrl ? (
                      <ModelSnapshotCard url={modelUrl} />
                    ) : (
                      <Box className="w-7 h-7 text-muted-foreground" />
                    )}
                    <span className="absolute bottom-1 left-1 right-1 bg-black/50 text-white text-xs rounded px-1 truncate">
                      {asset ? (asset.originalFilename || asset.name || `Model ${idx + 1}`) : `Model ${idx + 1}`}
                    </span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => {
                      const updatedModels = (step.models || []).filter((_, i) => i !== idx)
                      onUpdate({ models: updatedModels })
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}

          <button
            type="button"
            onClick={addModel}
            onDragOver={handleDragOver}
            onDrop={handleDropOnAddModel}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border hover:border-foreground/30 bg-card/50 hover:bg-accent/30 transition-colors p-4 w-[120px] h-[120px] cursor-pointer"
          >
            <Plus className="w-6 h-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Add Model</span>
          </button>
        </div>
      </div>

      {/* ── Row 5: Interaction + Completion + Choices ─────── */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">More</label>
        <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onDetailSelect?.('interaction')}
          className="flex items-center gap-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors p-4 min-w-[160px] cursor-pointer text-left"
        >
          <MousePointerClick className="w-7 h-7 text-muted-foreground shrink-0" />
          <div>
            <div className="text-sm font-medium text-foreground">Interaction</div>
            <div className="text-xs text-muted-foreground">
              {hasInteraction
                ? (step.interaction_required_action || step.interaction_target || 'Configured')
                : 'Not set'}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onDetailSelect?.('completion')}
          className="flex items-center gap-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors p-4 min-w-[160px] cursor-pointer text-left"
        >
          <CheckCircle2 className="w-7 h-7 text-muted-foreground shrink-0" />
          <div>
            <div className="text-sm font-medium text-foreground">Completion</div>
            <div className="text-xs text-muted-foreground">
              {hasCompletion ? step.completion_type!.replace(/_/g, ' ') : 'Not set'}
            </div>
          </div>
        </button>

        {step.instruction_type === 'question' && (
          <button
            type="button"
            onClick={() => onDetailSelect?.('choices')}
            className="flex items-center gap-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors p-4 min-w-[160px] cursor-pointer text-left"
          >
            <HelpCircle className="w-7 h-7 text-muted-foreground shrink-0" />
            <div>
              <div className="text-sm font-medium text-foreground">Choices</div>
              <div className="text-xs text-muted-foreground">
                {(step.choices?.length || 0)} choice{(step.choices?.length || 0) !== 1 ? 's' : ''}
              </div>
            </div>
          </button>
        )}
      </div>
      </div>

      {isSaving && <div className="text-xs text-muted-foreground">Saving...</div>}
    </div>
  )
}
