import { ChevronDown, ChevronRight, MoreHorizontal, Trash2, Edit, Plus } from 'lucide-react'
import { Button } from '../ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'
import StepCard from './step-card'
import type { Step, Task } from '../../types'

interface TaskCardProps {
  task: Task
  taskIndex: number
  isExpanded: boolean
  onToggleExpand: () => void
  onEditTask: (taskId: string) => void
  onDeleteTask: (taskId: string) => void
  onAddStep: (taskId: string) => void
  selectedStepIndex: number | null
  onSelectStep: (stepIndex: number) => void
  onRemoveStep: (stepIndex: number) => void
  isSaving?: boolean
  assets?: any[]
  multiSelectMode?: boolean
  multiSelectedIds?: string[]
  onToggleSelectStep?: (stepIndex: number) => void
}

export default function TaskCard({
  task,
  taskIndex,
  isExpanded,
  onToggleExpand,
  onEditTask,
  onDeleteTask,
  onAddStep,
  selectedStepIndex,
  onSelectStep,
  onRemoveStep,
  isSaving = false,
  assets = [],
  multiSelectMode = false,
  multiSelectedIds = [],
  onToggleSelectStep,
}: TaskCardProps) {
  const steps = task.steps || []

  return (
    <div className="mb-4 border border-border rounded-lg bg-card overflow-hidden">
      {/* Task Header */}
      <div className="p-4 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleExpand}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
          
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">
                Task {task.order_index}: {task.title}
              </h3>
              <span className="text-xs text-muted-foreground">
                ({steps.length} step{steps.length !== 1 ? 's' : ''})
              </span>
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddStep(task.id)}
            disabled={isSaving}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Step
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" title="More options">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEditTask(task.id)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Task
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDeleteTask(task.id)} variant="destructive">
                <Trash2 className="w-4 h-4 mr-2 text-destructive" />
                <span className="text-destructive">Delete Task</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Task Steps (Collapsed/Expanded) */}
      {isExpanded && (
        <div className="p-4">
          {steps.length === 0 ? (
            <div className="p-6 bg-muted/20 rounded-lg border border-dashed text-center text-muted-foreground">
              No steps in this task yet. Click "Add Step" to begin.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {steps.map((step, stepIdx) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={stepIdx}
                  indexOffset={task.order_index}
                  selected={selectedStepIndex === stepIdx}
                  onSelect={onSelectStep}
                  onRemove={onRemoveStep}
                  isSaving={isSaving}
                  assets={assets}
                  multiSelectMode={multiSelectMode}
                  isMultiSelected={multiSelectedIds.includes(step.id)}
                  onToggleSelect={onToggleSelectStep}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
