import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu'
import { MoreHorizontal, Edit, Trash2 } from 'lucide-react'
import AssetSidebar from '../../components/pagecomponents/asset-sidebar'
import Header from '../../components/pagecomponents/header'
import { apiClient } from '../../lib/api'

interface Asset {
  id: string
  name: string
  type: string
  url: string
  uploadedAt: string
}

interface ModuleItem {
  id: string
  title: string
  description?: string
  updated_at?: string
}

export default function HomeDevelop() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [moduleName, setModuleName] = useState('')
  const [createNameError, setCreateNameError] = useState('')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null)
  const [selectedModuleTitle, setSelectedModuleTitle] = useState('')
  const [renameInput, setRenameInput] = useState('')
  const [assets, setAssets] = useState<Asset[]>([])
  const [modules, setModules] = useState<ModuleItem[]>([])
  const [loadingModules, setLoadingModules] = useState(false)


  useEffect(() => {
    // Load assets and modules on mount
    let mounted = true
    ; (async () => {
      try {
        setLoadingModules(true)
        const [assetList, moduleList] = await Promise.all([
          apiClient.getAssets(),
          // apiClient.getModules was added to list modules
          // returns array of ModuleSerializer objects
          apiClient.getModules(),
        ])
        if (!mounted) return
        setAssets(assetList)
        setModules(moduleList)
      } catch (err) {
        console.warn('Failed to fetch assets or modules:', err)
      } finally {
        setLoadingModules(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const reloadAssets = async () => {
    try {
      const list = await apiClient.getAssets()
      setAssets(list)
    } catch (err) {
      console.warn('Failed to reload assets:', err)
    }
  }

  const reloadModules = async () => {
    try {
      setLoadingModules(true)
      const list = await apiClient.getModules()
      setModules(list)
    } catch (err) {
      console.warn('Failed to reload modules:', err)
    } finally {
      setLoadingModules(false)
    }
  }

  const handleCreateModule = async (name: string) => {
    // client-side duplicate check (case-insensitive)
    if (modules.some((m) => m.title.trim().toLowerCase() === name.trim().toLowerCase())) {
      setCreateNameError('A module with that name already exists')
      return
    }

    try {
      const newModule = await apiClient.createModule({ title: name })
      // refresh local module list so new module appears immediately
      await reloadModules()
      navigate(`/develop/createmodule/${encodeURIComponent(name)}?id=${newModule.id}`)
      setOpen(false)
      setModuleName('')
      setCreateNameError('')
    } catch (error) {
      console.error('Failed to create module:', error)
      // If backend returns an error about duplicate title, surface it
      const msg = error instanceof Error ? error.message : 'Unknown error'
      if (msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('exists') || msg.toLowerCase().includes('duplicate')) {
        setCreateNameError('A module with that name already exists')
      } else {
        alert(`Failed to create module: ${msg}`)
      }
    }
  }
  const handleDeleteAsset = async (assetId: string) => {
    try {
      await apiClient.deleteAsset(assetId)
      // remove from local list
      setAssets((s) => s.filter((a) => a.id !== assetId))
    } catch (err) {
      console.error('Failed to delete asset:', err)
      alert(`Failed to delete asset: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleRenameModule = async (moduleId: string, currentTitle: string) => {
    const newTitle = window.prompt('Rename module', currentTitle)
    if (!newTitle) return
    try {
      await apiClient.updateModule(moduleId, { title: newTitle.trim() })
      await reloadModules()
    } catch (err) {
      console.error('Failed to rename module:', err)
      alert(`Failed to rename module: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleDeleteModule = async (moduleId: string) => {
    // kept for compatibility; prefer delete via dialog
    try {
      await apiClient.deleteModule(moduleId)
      setModules((s) => s.filter((m) => m.id !== moduleId))
    } catch (err) {
      console.error('Failed to delete module:', err)
      alert(`Failed to delete module: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const openRenameDialog = (moduleId: string, title: string) => {
    setSelectedModuleId(moduleId)
    setSelectedModuleTitle(title)
    setRenameInput(title)
    setRenameDialogOpen(true)
  }

  const handleConfirmRename = async () => {
    if (!selectedModuleId) return
    const trimmed = renameInput.trim()
    if (!trimmed) {
      alert('Module title cannot be empty')
      return
    }
    try {
      await apiClient.updateModule(selectedModuleId, { title: trimmed })
      setRenameDialogOpen(false)
      setSelectedModuleId(null)
      setSelectedModuleTitle('')
      setRenameInput('')
      await reloadModules()
    } catch (err) {
      console.error('Failed to rename module:', err)
      alert(`Failed to rename module: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const openDeleteDialog = (moduleId: string, title: string) => {
    setSelectedModuleId(moduleId)
    setSelectedModuleTitle(title)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedModuleId) return
    try {
      await apiClient.deleteModule(selectedModuleId)
      setModules((s) => s.filter((m) => m.id !== selectedModuleId))
      setDeleteDialogOpen(false)
      setSelectedModuleId(null)
      setSelectedModuleTitle('')
    } catch (err) {
      console.error('Failed to delete module:', err)
      alert(`Failed to delete module: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div>
        <section className="overflow-hidden h-screen">
          <div className="grid grid-rows-[auto_1fr] grid-cols-1 lg:grid-cols-12 h-screen">
            {/* Header spanning full width */}
            <Header title="Development WorkSpace" onBack={() => navigate('/')} />

            {/* Content area: left develop space, right asset sidebar */}
            <div className="col-span-1 lg:col-span-9 pl-2 py-2 overflow-hidden">
              <div className="h-full rounded-lg border border-border bg-background flex flex-col overflow-hidden">
                <div className="p-3 flex items-center justify-between border-b border-border flex-shrink-0">
                  <h3 className="text-lg font-medium text-foreground">Training Modules</h3>
                  <div>
                    <Dialog open={open} onOpenChange={setOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="px-4 py-2">Create Module</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create Module</DialogTitle>
                          <DialogDescription>Enter a name for the new module.</DialogDescription>
                        </DialogHeader>

                        <div className="pt-2">
                          <label className="text-sm text-muted-foreground">Module name</label>
                          <input
                            value={moduleName}
                            onChange={(e) => {
                              setModuleName(e.target.value)
                              // clear duplicate warning while editing
                              if (createNameError) setCreateNameError('')
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (moduleName.trim()) {
                                  handleCreateModule(moduleName.trim())
                                }
                              }
                            }}
                            className="mt-2 w-full rounded border border-border px-2 py-1 bg-input text-foreground"
                            aria-label="Module name"
                            autoFocus
                          />
                          {createNameError && (
                            <div className="text-destructive text-sm mt-2">{createNameError}</div>
                          )}
                        </div>

                        <DialogFooter>
                          <Button variant="secondary" onClick={() => { setOpen(false); setModuleName('') }}>
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              if (moduleName && moduleName.trim()) {
                                handleCreateModule(moduleName.trim())
                              }
                            }}
                            className="px-4 py-2"
                          >
                            Create
                          </Button>
                        </DialogFooter>
                        <DialogClose />
                      </DialogContent>
                    </Dialog>

                    {/* Rename dialog (controlled) */}
                    <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Rename Module</DialogTitle>
                          <DialogDescription>Enter a new name for "{selectedModuleTitle}".</DialogDescription>
                        </DialogHeader>
                        <div className="pt-2">
                          <label className="text-sm text-muted-foreground">Module name</label>
                          <input
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleConfirmRename()
                            }}
                            className="mt-2 w-full rounded border border-border px-2 py-1 bg-input text-foreground"
                            aria-label="Rename module"
                            autoFocus
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="secondary" onClick={() => { setRenameDialogOpen(false); setSelectedModuleId(null); setRenameInput('') }}>
                            Cancel
                          </Button>
                          <Button onClick={handleConfirmRename} className="px-4 py-2">Rename</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* Delete confirmation dialog */}
                    <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete Module</DialogTitle>
                          <DialogDescription>Are you sure you want to delete "{selectedModuleTitle}"? This cannot be undone.</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="secondary" onClick={() => { setDeleteDialogOpen(false); setSelectedModuleId(null); setSelectedModuleTitle('') }}>
                            Cancel
                          </Button>
                          <Button variant="destructive" className="px-4 py-2" onClick={handleConfirmDelete}>
                            Delete
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {loadingModules ? (
                    <div className="text-muted-foreground">Loading modules...</div>
                  ) : modules.length === 0 ? (
                    <div className="text-muted-foreground">No modules yet. Create one to get started.</div>
                  ) : (
                    <ul className="space-y-2">
                      {modules.map((m) => (
                        <li key={m.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                          <div>
                            <div className="font-medium text-foreground">{m.title}</div>
                            {m.updated_at && (
                              <div className="text-sm text-muted-foreground">{new Date(m.updated_at).toLocaleString()}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/develop/createmodule/${encodeURIComponent(m.title)}?id=${m.id}`)}>
                              Open
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    onClick={(e) => e.stopPropagation()}
                                    variant="ghost"
                                    size="icon-sm"
                                    title="More"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                              <DropdownMenuContent sideOffset={6} align="end">
                                <DropdownMenuItem onSelect={() => openRenameDialog(m.id, m.title)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => openDeleteDialog(m.id, m.title)} variant="destructive">
                                  <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-1 lg:col-span-3 p-2 bg-background overflow-hidden">
              <div className="h-full">
                <AssetSidebar
                  models={assets}
                  showAssign={false}
                  onDelete={handleDeleteAsset}
                  onUpload={() => { reloadAssets(); reloadModules(); }}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
