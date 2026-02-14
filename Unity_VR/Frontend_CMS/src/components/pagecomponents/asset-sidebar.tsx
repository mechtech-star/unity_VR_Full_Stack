import { Button } from '../ui/button'
import { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, MoreHorizontal, UploadCloud, Search, FolderOpen, Settings2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../ui/input-group'
import { apiClient, BACKEND_BASE_URL } from '../../lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '../ui/dialog'
import { toast } from 'sonner'

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

import StepDetailsPanel, { type DetailTab } from './step-details-panel'
import type { Step as StepType, UpdateStepRequest } from '../../types'

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

type Model = {
  id: string
  name?: string
  uploadedAt?: string
  originalFilename?: string
  created_at?: string
}

interface AssetSidebarProps {
  models: Model[]
  onAssignModel?: (modelId: string) => void
  onDelete?: (modelId: string) => void
  onUpload?: (files: FileList | File[]) => void
  showAssign?: boolean
  isLoading?: boolean
  // Step details props
  step?: StepType | null
  onStepUpdate?: (patch: UpdateStepRequest) => void
  assets?: Array<{ id: string; name?: string; originalFilename?: string; metadata?: Record<string, unknown>; type?: string; url?: string }>
  allSteps?: StepType[]
  activeDetailTab?: DetailTab | null
  activeModelIndex?: number
  onDetailTabChange?: (tab: DetailTab | null) => void
}

export default function AssetSidebar({
  models, onAssignModel, onDelete, onUpload, showAssign = true, isLoading = false,
  step, onStepUpdate, assets = [], allSteps = [], activeDetailTab, activeModelIndex = -1, onDetailTabChange,
}: AssetSidebarProps) {
  const showDetails = !!(activeDetailTab && step && onStepUpdate)

  function formatUploaded(dateStr?: string) {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString()
  }

  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [fetchedAssets, setFetchedAssets] = useState<Array<{ id: string; name?: string; originalFilename?: string; metadata?: Record<string, unknown>; type?: string; url?: string }>>([])

  useEffect(() => {
    if (!assets || assets.length === 0) {
      apiClient.getAssets().then((result) => {
        if (result) setFetchedAssets(result)
      }).catch((err) => {
        console.error('Failed to fetch assets:', err)
      })
    }
  }, [assets])

  const effectiveAssets = assets && assets.length > 0 ? assets : fetchedAssets

  const [conflict, setConflict] = useState<{ existing: Model; file: File } | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const onTriggerUpload = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const parseGltfAnimations = useCallback(async (file: File) => {
    const loader = new GLTFLoader()
    return new Promise<any[]>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      loader.load(url, (gltf) => {
        try {
          const clips = (gltf.animations || []).map((c: THREE.AnimationClip) => ({
            name: c.name || '',
            duration: c.duration || 0,
            tracks: c.tracks?.length || 0,
          }))
          resolve(clips)
        } catch (e) {
          reject(e)
        } finally {
          URL.revokeObjectURL(url)
        }
      }, undefined, (err) => {
        URL.revokeObjectURL(url)
        reject(err)
      })
    })
  }, [])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return
    setUploadError(null)
    const fileList = Array.from(files)
    const gltfFiles = fileList.filter((f) => f.name.endsWith('.glb') || f.name.endsWith('.gltf'))
    const imageFiles = fileList.filter((f) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
    const videoFiles = fileList.filter((f) => /\.(mp4|webm|ogg)$/i.test(f.name))
    const allValid = [...gltfFiles, ...imageFiles, ...videoFiles]

    if (allValid.length === 0) {
      setUploadError('Only .glb, .gltf, image (.jpg, .png, .gif, .webp), and video (.mp4, .webm, .ogg) files are supported')
      return
    }

    setIsUploading(true)
    try {
      for (const file of allValid) {
        const existing = models.find((m) => (m.name ?? m.originalFilename ?? '').toLowerCase() === file.name.toLowerCase())
        if (existing) {
          setConflict({ existing, file })
          setRenameValue(file.name)
          setConflictOpen(true)
          break
        }
        
        // Determine asset type
        let assetType: 'gltf' | 'image' | 'video' = 'gltf'
        if (imageFiles.includes(file)) assetType = 'image'
        else if (videoFiles.includes(file)) assetType = 'video'
        
        const toId = toast.loading(`Uploading ${file.name}...`)
        try {
          let metadata = null
          // Parse animations only for GLTF files
          if (assetType === 'gltf') {
            try {
              const animations = await parseGltfAnimations(file)
              metadata = { animations }
            } catch (e) {
              console.warn('Failed to parse animations for', file.name, e)
            }
          }

          await apiClient.uploadAsset(file, assetType, metadata)
          toast.success(`${file.name} uploaded`, { id: toId })
        } catch (e) {
          toast.error(`Upload failed: ${file.name}`, { id: toId })
          throw e
        }
      }

      if (typeof onUpload === 'function') onUpload(files)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setUploadError(`Upload failed: ${msg}`)
      console.error('Asset upload error:', err)
    } finally {
      setIsUploading(false)
    }
  }, [models, onUpload, parseGltfAnimations])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files)
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleReplace = useCallback(async () => {
    if (!conflict) return
    setConflictOpen(false)
    setIsUploading(true)
    try {
      const toId = toast.loading(`Replacing ${conflict.existing.originalFilename ?? conflict.existing.name}...`)
      try {
        let metadata = null
        try {
          const animations = await parseGltfAnimations(conflict.file)
          metadata = { animations }
        } catch (e) {
          console.warn('Failed to parse animations for replace:', e)
        }

        await apiClient.uploadAsset(conflict.file, 'gltf', metadata)
        try {
          await apiClient.deleteAsset(conflict.existing.id)
        } catch (e) {
          console.warn('Failed to delete existing asset after replace:', e)
        }
        toast.success('Replaced', { id: toId })
      } catch (e) {
        toast.error('Replace failed', { id: toId })
        throw e
      }
      if (typeof onUpload === 'function') onUpload([conflict.file] as unknown as FileList)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setUploadError(`Replace failed: ${msg}`)
      console.error('Asset replace error:', err)
    } finally {
      setIsUploading(false)
      setConflict(null)
    }
  }, [conflict, onDelete, onUpload])

  const handleRenameAndUpload = useCallback(async () => {
    if (!conflict) return
    const newName = renameValue.trim()
    if (!newName) {
      setUploadError('Name cannot be empty')
      return
    }
    setConflictOpen(false)
    setIsUploading(true)
    try {
      const newFile = new File([conflict.file], newName, { type: conflict.file.type })
      const toId = toast.loading(`Uploading ${newName}...`)
      try {
        let metadata = null
        try {
          const animations = await parseGltfAnimations(newFile)
          metadata = { animations }
        } catch (e) {
          console.warn('Failed to parse animations for renamed file:', e)
        }

        await apiClient.uploadAsset(newFile, 'gltf', metadata)
        toast.success(`${newName} uploaded`, { id: toId })
      } catch (e) {
        toast.error(`Upload failed: ${newName}`, { id: toId })
        throw e
      }
      if (typeof onUpload === 'function') onUpload([newFile] as unknown as FileList)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setUploadError(`Upload failed: ${msg}`)
      console.error('Asset rename/upload error:', err)
    } finally {
      setIsUploading(false)
      setConflict(null)
    }
  }, [conflict, renameValue, onUpload])

  return (
    <aside className="col-span-4 h-full rounded-lg bg-card border flex flex-col overflow-hidden">
      {/* ── Top toggle bar ── */}
      {step && onStepUpdate && (
        <div className="flex border-b shrink-0">
          <button
            type="button"
            onClick={() => onDetailTabChange?.(null)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
              !showDetails
                ? 'text-foreground bg-card border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground bg-muted/30'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Assets
          </button>
          <button
            type="button"
            onClick={() => onDetailTabChange?.(activeDetailTab || 'media')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
              showDetails
                ? 'text-foreground bg-card border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground bg-muted/30'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Step Details
          </button>
        </div>
      )}

      {/* ── Step Details Panel ── */}
      {showDetails ? (
        <div className="flex-1 overflow-hidden">
          <StepDetailsPanel
            step={step!}
            onUpdate={onStepUpdate!}
            assets={effectiveAssets}
            allSteps={allSteps}
            activeTab={activeDetailTab!}
            activeModelIndex={activeModelIndex}
            onTabChange={(tab) => onDetailTabChange?.(tab)}
            onClose={() => onDetailTabChange?.(null)}
          />
        </div>
      ) : (
      /* ── Assets View (original) ── */
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="text-card-foreground rounded-lg p-2">
          <div className="flex flex-col p-3 pb-6 pt-4 border-b sticky top-0 bg-card/80 backdrop-blur-md z-10">
            <header>
              <h2 className="font-semibold text-foreground text-lg">Asset Manager</h2>
            </header>
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <InputGroup className="flex-1">
                <InputGroupAddon>
                  <Search className="w-4 h-4" />
                </InputGroupAddon>
                <InputGroupInput value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search models..." />
              </InputGroup>
            </div>

            <div
              className={`mb-3 w-full aspect-[2/1] flex flex-col items-center justify-center p-4 rounded-md overflow-hidden transition-all cursor-pointer border-2 border-dashed ${isDragging ? 'border-accent/80 bg-accent/10 shadow-md' : 'border-border bg-gradient-to-b from-transparent to-accent/3 hover:shadow-sm'} `}
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="button"
              aria-label="Upload 3D models"
            >
              <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full px-4">
                <div className="text-sm font-medium text-foreground text-center">Drop 3D models, images, or videos here</div>
                <div className="text-xs text-muted-foreground text-center">or click Upload</div>

                <div className="mt-2">
                  <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onTriggerUpload() }} className="flex items-center gap-2" disabled={isUploading || isLoading}>
                    <UploadCloud className="w-4 h-4" />
                    {isUploading || isLoading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>

                <input ref={inputRef} type="file" accept=".glb,.gltf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.ogg" multiple onChange={handleInputChange} style={{ display: 'none' }} />
              </div>
            </div>

            {uploadError && (
              <div className="mb-2 p-2 bg-red-100 text-red-700 rounded text-sm">{uploadError}</div>
            )}

            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {models
                .filter((m) => {
                  const displayName = (m.name ?? m.originalFilename ?? '').toString()
                  return displayName.toLowerCase().includes(searchTerm.toLowerCase())
                })
                .map((m) => {
                  const displayName = m.name ?? m.originalFilename ?? 'Unnamed'
                  const asset = effectiveAssets.find(a => a.id === m.id)
                  const assetUrl = asset?.url ? `${BACKEND_BASE_URL}${asset.url}` : null

                  const handleDragStart = (e: React.DragEvent) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({
                      assetId: m.id,
                      assetType: asset?.type,
                      assetName: displayName
                    }))
                    e.dataTransfer.effectAllowed = 'copy'
                  }

                  return (
                    <ContextMenu key={m.id}>
                      <ContextMenuTrigger asChild>
                        {showAssign ? (
                          <button
                            type="button"
                            draggable
                            onDragStart={handleDragStart}
                            onClick={() => onAssignModel && onAssignModel(m.id)}
                            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors p-2 w-full aspect-square cursor-pointer text-center relative overflow-hidden"
                          >
                            {asset?.type === 'gltf' && assetUrl ? (
                              <ModelSnapshotCard url={assetUrl} />
                            ) : asset?.type === 'image' && assetUrl ? (
                              <img
                                src={assetUrl}
                                alt="asset thumbnail"
                                className="w-full h-full object-cover rounded"
                              />
                            ) : asset?.type === 'video' && assetUrl ? (
                              <video
                                src={assetUrl}
                                className="w-full h-full object-cover rounded"
                                muted
                                preload="metadata"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <UploadCloud className="w-8 h-8" />
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 bg-black/50 text-white text-xs rounded px-1 truncate">
                              {displayName}
                            </div>
                          </button>
                        ) : (
                          <div
                            draggable
                            onDragStart={handleDragStart}
                            className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-2 w-full aspect-square text-center relative overflow-hidden cursor-grab active:cursor-grabbing"
                          >
                            {asset?.type === 'gltf' && assetUrl ? (
                              <ModelSnapshotCard url={assetUrl} />
                            ) : asset?.type === 'image' && assetUrl ? (
                              <img
                                src={assetUrl}
                                alt="asset thumbnail"
                                className="w-full h-full object-cover rounded"
                              />
                            ) : asset?.type === 'video' && assetUrl ? (
                              <video
                                src={assetUrl}
                                className="w-full h-full object-cover rounded"
                                muted
                                preload="metadata"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                <UploadCloud className="w-8 h-8" />
                              </div>
                            )}
                            <div className="absolute bottom-1 left-1 right-1 bg-black/50 text-white text-xs rounded px-1 truncate">
                              {displayName}
                            </div>
                          </div>
                        )}
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem
                          variant="destructive"
                          onSelect={() => onDelete && onDelete(m.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
            </div>
          </div>
        </div>
      </div>
      )}

      <Dialog open={conflictOpen && !!conflict} onOpenChange={setConflictOpen}>
        {conflict ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asset name conflict</DialogTitle>
              <DialogDescription>There is already an uploaded asset with the same filename. Replace it or rename the new upload.</DialogDescription>
            </DialogHeader>

            <div className="mt-2">
              <div className="text-sm text-foreground">Existing: {conflict.existing?.name ?? conflict.existing?.originalFilename}</div>
              <div className="text-sm text-muted-foreground">New file: {conflict.file?.name}</div>
            </div>

            <div className="mt-4">
              <label className="text-sm text-muted-foreground">Rename new file</label>
              <input className="mt-2 w-full rounded border border-border px-2 py-1 bg-input text-foreground" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            </div>

            <DialogFooter>
              <Button variant="secondary" onClick={() => { setConflictOpen(false); setConflict(null) }}>Cancel</Button>
              <Button variant="secondary" onClick={handleReplace}>Replace</Button>
              <Button onClick={handleRenameAndUpload}>Rename & Upload</Button>
            </DialogFooter>

            <DialogClose />
          </DialogContent>
        ) : null}
      </Dialog>
    </aside>
  )
}
