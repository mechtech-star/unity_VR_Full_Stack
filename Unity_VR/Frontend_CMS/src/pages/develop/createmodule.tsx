import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '../../components/ui/dropdown-menu'
import { MoreHorizontal, Grid2x2Plus, FolderUp } from 'lucide-react'
import AssetSidebar from '../../components/pagecomponents/asset-sidebar'
import Header from '../../components/pagecomponents/header'
import TaskCard from '../../components/pagecomponents/task-card'
import TaskDialog from '../../components/pagecomponents/task-dialog'
import { apiClient } from '../../lib/api'
import { deleteStepAndRefresh } from '../../lib/stepOperations'
import type { Step, Task, Module } from '../../types'

export default function CreateModule() {
    const navigate = useNavigate()
    const { moduleName } = useParams<{ moduleName: string }>()
    const [searchParams] = useSearchParams()
    const moduleId = searchParams.get('id')

    const decodedModuleName = moduleName ? decodeURIComponent(moduleName) : 'New Module'

    const [tasks, setTasks] = useState<Task[]>([])
    const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set())
    const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null)
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const [assets, setAssets] = useState<any[]>([])
    const [multiSelectMode, setMultiSelectMode] = useState(false)
    const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    // Task dialog state
    const [taskDialogOpen, setTaskDialogOpen] = useState(false)
    const [taskDialogMode, setTaskDialogMode] = useState<'create' | 'edit'>('create')
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
    const [editingTaskTitle, setEditingTaskTitle] = useState('')
    const [editingTaskDescription, setEditingTaskDescription] = useState('')

    useEffect(() => {
        if (moduleId) loadModule()
    }, [moduleId])

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const list = (await apiClient.getAssets()) as any
                if (!mounted) return
                setAssets(list || [])
            } catch (err) {
                console.warn('Failed to load assets:', err)
            }
        })()
        return () => { mounted = false }
    }, [])

    const loadModule = async () => {
        if (!moduleId) return
        setIsLoading(true)
        try {
            const module = (await apiClient.getModule(moduleId)) as Module | null
            if (!module) return
            
            const moduleTasks: Task[] = (module.tasks || []).map((task) => ({
                ...task,
                steps: (task.steps || []).map((step) => ({ ...step })),
            }))
            
            setTasks(moduleTasks)
            setExpandedTaskIds(new Set(moduleTasks.map(t => t.id)))
        } catch (err) {
            console.error('Failed to load module:', err)
            setError(`Failed to load module: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsLoading(false)
        }
    }

    async function createTask(title: string, description: string) {
        if (!moduleId) {
            alert('Module not initialized')
            return
        }
        setIsSaving(true)
        try {
            const newTask = (await apiClient.createTask(moduleId, title, description, tasks.length + 1)) as Task | null
            if (!newTask) return
            const task: Task = { ...newTask, steps: [] }
            setTasks((prev) => [...prev, task])
            setExpandedTaskIds(prev => new Set([...prev, task.id]))
        } catch (err) {
            console.error('Failed to create task:', err)
            setError(`Failed to create task: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    async function updateTask(taskId: string, title: string, description: string) {
        setIsSaving(true)
        try {
            await apiClient.updateTask(taskId, { title, description } as any)
            setTasks(prev => prev.map(t => 
                t.id === taskId ? { ...t, title, description } : t
            ))
        } catch (err) {
            console.error('Failed to update task:', err)
            setError(`Failed to update task: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    async function deleteTask(taskId: string) {
        if (!confirm('Delete this task and all its steps?')) return
        setIsSaving(true)
        try {
            await apiClient.deleteTask(taskId)
            await loadModule()
        } catch (err) {
            console.error('Failed to delete task:', err)
            setError(`Failed to delete task: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    function openEditTaskDialog(taskId: string) {
        const task = tasks.find(t => t.id === taskId)
        if (!task) return
        setEditingTaskId(taskId)
        setEditingTaskTitle(task.title)
        setEditingTaskDescription(task.description || '')
        setTaskDialogMode('edit')
        setTaskDialogOpen(true)
    }

    function handleTaskDialogSave(title: string, description: string) {
        if (taskDialogMode === 'create') {
            createTask(title, description)
        } else if (editingTaskId) {
            updateTask(editingTaskId, title, description)
        }
    }

    async function addStepToTask(taskId: string) {
        if (!moduleId) {
            alert('Module not initialized')
            return
        }
        
        const task = tasks.find(t => t.id === taskId)
        if (!task) return
        
        setIsSaving(true)
        try {
            const newStep = (await apiClient.createStep(
                moduleId,
                taskId,
            )) as Step | null
            
            if (!newStep) return
            
            await loadModule()
        } catch (err) {
            console.error('Failed to add step:', err)
            setError(`Failed to add step: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    async function removeStepFromTask(taskId: string, stepIndex: number) {
        const task = tasks.find(t => t.id === taskId)
        const step = task?.steps?.[stepIndex]
        if (!step) return

        const confirmDelete = window.confirm(
            `Delete step "${step.title}"? This will renumber remaining steps in the task.`
        )
        if (!confirmDelete) return

        setIsSaving(true)
        try {
            await deleteStepAndRefresh(step.id)
            await loadModule()
            setSelectedTaskId(null)
            setSelectedStepIndex(null)
        } catch (err) {
            console.error('Failed to delete step:', err)
            setError(`Failed to delete step: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    async function handlePublish() {
        if (!moduleId) {
            alert('Module not initialized')
            return
        }
        if (tasks.length === 0) {
            alert('Add at least one task before publishing')
            return
        }
        
        const emptyTasks = tasks.filter(t => !t.steps || t.steps.length === 0)
        if (emptyTasks.length > 0) {
            alert(`The following tasks have no steps: ${emptyTasks.map(t => t.title).join(', ')}`)
            return
        }

        setIsSaving(true)
        try {
            const published = (await apiClient.publishModule(moduleId)) as any
            alert(`Module published successfully (v${published?.version || '1.0'})`)
            navigate('/develop')
        } catch (err) {
            console.error('Failed to publish:', err)
            setError(`Failed to publish: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    function toggleTaskExpand(taskId: string) {
        setExpandedTaskIds(prev => {
            const next = new Set(prev)
            if (next.has(taskId)) next.delete(taskId)
            else next.add(taskId)
            return next
        })
    }

    function navigateToStepEditor(taskId: string, taskOrderIndex: number, stepId: string, stepIndex: number) {
        if (!moduleId) return
        navigate(`/develop/configure-step?moduleId=${moduleId}&stepId=${stepId}&taskId=${taskId}&index=${taskOrderIndex}&stepIndex=${stepIndex}&moduleName=${encodeURIComponent(decodedModuleName)}`)
    }

    if (isLoading) {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground">Loading module...</div>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-background">
            <div className="overflow-hidden h-screen">
                <div className="grid grid-rows-[auto_1fr] grid-cols-1 lg:grid-cols-12 h-screen">
                    <Header title={`Module Workspace: ${decodedModuleName}`} onBack={() => navigate('/develop')} />

                    <div className="col-span-1 lg:col-span-9 pl-2 py-2 overflow-hidden">
                        <div className="h-full rounded-lg border border-border bg-background flex flex-col overflow-hidden">
                            <div className="px-4 pt-4 shrink-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-foreground">Configure Module - Task Based Structure</h3>
                                    <div className="flex gap-2">
                                        <Button 
                                            size="sm" 
                                            onClick={() => {
                                                setTaskDialogMode('create')
                                                setEditingTaskId(null)
                                                setEditingTaskTitle('')
                                                setEditingTaskDescription('')
                                                setTaskDialogOpen(true)
                                            }} 
                                            disabled={isSaving} 
                                            className="flex items-center gap-2"
                                        >
                                            <Grid2x2Plus className="w-4 h-4" />
                                            <span>Add Task</span>
                                        </Button>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="icon-sm" variant="ghost" title="More">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>

                                            <DropdownMenuContent sideOffset={6} align="end">
                                                <DropdownMenuItem onSelect={() => handlePublish()}>
                                                    <div className="flex items-center gap-2">
                                                        <FolderUp className="w-4 h-4" />
                                                        <span>Publish</span>
                                                    </div>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                {error && (
                                    <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-sm">
                                        {error}
                                    </div>
                                )}
                            </div>
                            
                            <div className="flex-1 overflow-y-auto px-4 py-4">
                                {tasks.length === 0 ? (
                                    <div className="p-8 bg-muted/20 rounded-lg border border-dashed text-center">
                                        <h3 className="text-lg font-semibold text-foreground mb-2">No tasks yet</h3>
                                        <p className="text-sm text-muted-foreground mb-4">
                                            Create your first task to start organizing your module steps
                                        </p>
                                        <Button onClick={() => {
                                            setTaskDialogMode('create')
                                            setTaskDialogOpen(true)
                                        }}>
                                            <Grid2x2Plus className="w-4 h-4 mr-2" />
                                            Create First Task
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {tasks.map((task, taskIdx) => (
                                            <TaskCard
                                                key={task.id}
                                                task={task}
                                                taskIndex={taskIdx}
                                                isExpanded={expandedTaskIds.has(task.id)}
                                                onToggleExpand={() => toggleTaskExpand(task.id)}
                                                onEditTask={openEditTaskDialog}
                                                onDeleteTask={deleteTask}
                                                onAddStep={addStepToTask}
                                                selectedStepIndex={selectedTaskId === task.id ? selectedStepIndex : null}
                                                onSelectStep={(stepIdx) => {
                                                    const step = task.steps?.[stepIdx]
                                                    if (step) {
                                                        navigateToStepEditor(task.id, task.order_index, step.id, stepIdx)
                                                    }
                                                }}
                                                onRemoveStep={(stepIdx) => removeStepFromTask(task.id, stepIdx)}
                                                isSaving={isSaving}
                                                assets={assets}
                                                multiSelectMode={multiSelectMode}
                                                multiSelectedIds={multiSelectedIds}
                                                onToggleSelectStep={(stepIdx) => {
                                                    const step = task.steps?.[stepIdx]
                                                    if (!step) return
                                                    setMultiSelectedIds(prev => 
                                                        prev.includes(step.id) 
                                                            ? prev.filter(id => id !== step.id)
                                                            : [...prev, step.id]
                                                    )
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="col-span-1 lg:col-span-3 p-2 bg-background overflow-hidden">
                        <div className="h-full">
                            <AssetSidebar
                                models={assets}
                                showAssign={false}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <TaskDialog
                open={taskDialogOpen}
                onOpenChange={setTaskDialogOpen}
                onSave={handleTaskDialogSave}
                initialTitle={editingTaskTitle}
                initialDescription={editingTaskDescription}
                mode={taskDialogMode}
            />
        </main>
    )
}
