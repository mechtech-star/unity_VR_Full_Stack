import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/button'
import AssetSidebar from '../../components/pagecomponents/asset-sidebar'
import Header from '../../components/pagecomponents/header'
import StepConfiguration from '../../components/pagecomponents/step-configuration'
import { apiClient } from '../../lib/api'
import { deleteStepAndRefresh } from '../../lib/stepOperations'
import type { Step, Module, Task, UpdateStepRequest } from '../../types'

export default function ConfigureStep() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const moduleId = searchParams.get('moduleId')
    const stepId = searchParams.get('stepId')
    const taskId = searchParams.get('taskId')
    const moduleName = searchParams.get('moduleName') ?? 'Module'

    const [step, setStep] = useState<Step | null>(null)
    const [taskSteps, setTaskSteps] = useState<Step[]>([])
    const [allSteps, setAllSteps] = useState<Step[]>([])
    const [allTasks, setAllTasks] = useState<Task[]>([])
    const [assets, setAssets] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load assets
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

    // Load step data from module
    useEffect(() => {
        if (!moduleId || !stepId) return
        setIsLoading(true)
        ;(async () => {
            try {
                const module = (await apiClient.getModule(moduleId)) as Module | null
                if (!module) {
                    setError('Module not found')
                    return
                }

                setAllTasks(module.tasks || [])

                // Collect all steps across all tasks for goToStep references
                const every: Step[] = []
                const currentTaskSteps: Step[] = []

                // Normalize steps: ensure `model_animation_loop` is present
                for (const task of (module.tasks || [])) {
                    for (const raw of (task.steps || [])) {
                        const s = raw as any
                        const normalized: Step = {
                            ...s,
                            model_animation_loop: (s.model_animation_loop !== undefined)
                                ? s.model_animation_loop
                                : (s.model?.loop !== undefined ? s.model.loop : false),
                        }
                        every.push(normalized)
                        if (task.id === taskId) {
                            currentTaskSteps.push(normalized)
                        }
                    }
                }
                
                setAllSteps(every)
                setTaskSteps(currentTaskSteps)

                const found = every.find(s => s.id === stepId)
                if (!found) {
                    setError('Step not found')
                    return
                }
                setStep(found)
            } catch (err) {
                console.error('Failed to load step:', err)
                setError(`Failed to load step: ${err instanceof Error ? err.message : 'Unknown error'}`)
            } finally {
                setIsLoading(false)
            }
        })()
    }, [moduleId, stepId])

    function goToNeighbor(delta: number) {
        if (taskSteps.length === 0 || !step) return
        const currentIndex = taskSteps.findIndex(s => s.id === step.id)
        if (currentIndex === -1) return
        const newIndex = currentIndex + delta

        // Within same task
        if (newIndex >= 0 && newIndex < taskSteps.length) {
            const next = taskSteps[newIndex]
            const params = `moduleId=${moduleId}&stepId=${next.id}&taskId=${taskId}&index=0&stepIndex=${newIndex}&moduleName=${encodeURIComponent(moduleName)}`
            navigate(`/develop/configure-step?${params}`)
            return
        }

        // Cross-task navigation
        if (!allTasks || allTasks.length === 0) return
        const currentTaskIndex = allTasks.findIndex(t => t.id === taskId)
        if (currentTaskIndex === -1) return

        if (delta > 0 && newIndex >= taskSteps.length) {
            const nextTask = allTasks[currentTaskIndex + 1]
            if (!nextTask?.steps?.length) return
            const firstStep = nextTask.steps[0]
            navigate(`/develop/configure-step?moduleId=${moduleId}&stepId=${firstStep.id}&taskId=${nextTask.id}&index=0&stepIndex=0&moduleName=${encodeURIComponent(moduleName)}`)
            return
        }

        if (delta < 0 && newIndex < 0) {
            const prevTask = allTasks[currentTaskIndex - 1]
            if (!prevTask?.steps?.length) return
            const lastStep = prevTask.steps[prevTask.steps.length - 1]
            navigate(`/develop/configure-step?moduleId=${moduleId}&stepId=${lastStep.id}&taskId=${prevTask.id}&index=0&stepIndex=${prevTask.steps.length - 1}&moduleName=${encodeURIComponent(moduleName)}`)
            return
        }
    }

    async function handleUpdate(patch: UpdateStepRequest) {
        if (!step) return
        setIsSaving(true)
            try {
                const updated = await apiClient.updateStep(step.id, patch) as Step | null
                if (updated) {
                    // Merge server response with our patch to preserve fields
                    setStep(prev => prev ? ({ ...updated, ...patch } as Step) : ({ ...updated, ...patch } as Step))
                } else {
                    // Optimistic local update
                    setStep(prev => prev ? ({ ...prev, ...patch } as Step) : prev)
                }
        } catch (err) {
            console.error('Failed to save step:', err)
            setError(`Failed to save step: ${err instanceof Error ? err.message : 'Unknown error'}`)
        } finally {
            setIsSaving(false)
        }
    }

    async function handleDeleteStep() {
        if (!step || !taskId) return
        const confirmDelete = window.confirm(`Delete step "${step.title}"?`)
        if (!confirmDelete) return

        setIsSaving(true)
        try {
            await deleteStepAndRefresh(step.id)
            goBackToModule()
        } catch (err) {
            console.error('Failed to delete step:', err)
            setError(`Failed to delete step: ${err instanceof Error ? err.message : 'Unknown error'}`)
            setIsSaving(false)
        }
    }

    function goBackToModule() {
        if (moduleId) {
            navigate(`/develop/createmodule/${encodeURIComponent(moduleName)}?id=${moduleId}`)
            return
        }
        navigate('/develop')
    }

    if (isLoading || !step) {
        return (
            <main className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-muted-foreground">Loading step...</div>
            </main>
        )
    }

    const canGoPrev = (() => {
        const idx = taskSteps.findIndex(s => s.id === step.id)
        if (idx > 0) return true
        const tIdx = allTasks.findIndex(t => t.id === taskId)
        return tIdx > 0 && (allTasks[tIdx - 1]?.steps?.length || 0) > 0
    })()

    const canGoNext = (() => {
        const idx = taskSteps.findIndex(s => s.id === step.id)
        if (idx < taskSteps.length - 1) return true
        const tIdx = allTasks.findIndex(t => t.id === taskId)
        return tIdx < allTasks.length - 1 && (allTasks[tIdx + 1]?.steps?.length || 0) > 0
    })()

    return (
        <main className="min-h-screen bg-background">
            <div className="overflow-hidden h-screen">
                <div className="grid grid-rows-[auto_1fr] grid-cols-1 lg:grid-cols-12 h-screen">
                    <Header title={`Step Workspace: ${moduleName}`} onBack={goBackToModule} />

                    <div className="col-span-1 lg:col-span-9 pl-2 py-2 overflow-hidden">
                        <div className="h-full rounded-lg border border-border bg-background flex flex-col overflow-hidden">
                            <div className="px-4 pt-4 shrink-0">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-foreground">Configure Step</h3>
                                    <div className="flex gap-2 items-center">
                                        <Button size="sm" variant="secondary" onClick={() => goToNeighbor(-1)} disabled={!canGoPrev}>
                                            Previous Step
                                        </Button>
                                        <Button size="sm" onClick={() => goToNeighbor(1)} disabled={!canGoNext}>
                                            Next Step
                                        </Button>
                                    </div>
                                </div>
                                {error && (
                                    <div className="mt-2 p-2 bg-red-100 text-red-700 rounded text-sm">
                                        {error}
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto px-4 py-4">
                                <div className="max-w-2xl mx-auto">
                                    <StepConfiguration
                                        step={step}
                                        onUpdate={handleUpdate}
                                        onDelete={handleDeleteStep}
                                        isSaving={isSaving}
                                        assets={assets}
                                        allSteps={allSteps}
                                    />
                                </div>
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
        </main>
    )
}
