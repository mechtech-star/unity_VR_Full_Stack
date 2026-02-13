import StepCard from './step-card'
import type { Step } from '../../types'

interface ModuleConfigurationProps {
    steps?: Step[]
    selectedIndex?: number | null
    onSelect?: (index: number) => void
    onRemove?: (index: number) => void
    isSaving?: boolean
    assets?: Array<{ id: string; name?: string; originalFilename?: string; metadata?: any }>
    multiSelectMode?: boolean
    multiSelectedIds?: string[]
    onToggleSelect?: (index: number) => void
}

export default function ModuleConfiguration({
    steps = [],
    selectedIndex = null,
    onSelect,
    onRemove,
    isSaving = false,
    assets = [],
    multiSelectMode = false,
    multiSelectedIds = [],
    onToggleSelect,
}: ModuleConfigurationProps) {
    return (
        <div className="mb-6">
            <div className="mt-4">
                {steps.length === 0 ? (
                    <div className="p-6 bg-card text-card-foreground rounded-lg border border-dashed text-center text-muted-foreground">No steps yet. Click "Add Step" to begin.</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                        {steps.map((s, i) => (
                            <div key={s.id}>
                                <StepCard
                                    step={s}
                                    index={i}
                                    indexOffset={0}
                                    selected={selectedIndex === i}
                                    onSelect={onSelect}
                                    onRemove={onRemove}
                                    isSaving={isSaving}
                                    assets={assets}
                                    multiSelectMode={multiSelectMode}
                                    isMultiSelected={Array.isArray(multiSelectedIds) ? multiSelectedIds.includes(s.id) : false}
                                    onToggleSelect={onToggleSelect}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
