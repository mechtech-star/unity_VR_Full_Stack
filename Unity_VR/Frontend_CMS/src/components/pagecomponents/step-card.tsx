import { Trash2, MoreHorizontal, Box, Image, Video } from 'lucide-react'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../ui/dropdown-menu'
import { Button } from '../ui/button'
import type { Step } from '../../types'

const INSTRUCTION_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  safety: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  observe: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  action: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  inspect: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  completion: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  question: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

interface StepCardProps {
  step: Step
  index: number
  indexOffset?: number
  selected?: boolean
  onSelect?: (index: number) => void
  onRemove?: (index: number) => void
  isSaving?: boolean
  assets?: Array<{ id: string; name?: string; originalFilename?: string; metadata?: any }>
  multiSelectMode?: boolean
  isMultiSelected?: boolean
  onToggleSelect?: (index: number) => void
}

export default function StepCard(props: StepCardProps) {
  const { step, index, indexOffset = 0, selected = false, onSelect, onRemove, isSaving = false, assets = [], multiSelectMode = false, isMultiSelected = false, onToggleSelect } = props
  
  const displayIndex = indexOffset > 0 
    ? `${indexOffset}.${index + 1}` 
    : `${index + 1}`

  const handleClick = (e: any) => {
    const target = e.target as HTMLElement | null
    if (target && target.closest('input, textarea, button, select, a')) return
    if (e.nativeEvent?.composedPath?.()?.some((el: any) => el.getAttribute?.('role') === 'menuitem' || el.getAttribute?.('role') === 'menu')) return
    if (multiSelectMode) {
      onToggleSelect && onToggleSelect(index)
      return
    }
    onSelect && onSelect(index)
  }

  const badgeClass = INSTRUCTION_COLORS[step.instruction_type] || 'bg-muted text-muted-foreground'

  return (
    <div className="relative">
      <div
        className={`bg-card h-64 text-card-foreground rounded-lg p-4 border border-border hover:shadow-md transition-shadow cursor-pointer ${selected ? 'shadow-sm' : ''}`}
        onClick={handleClick}
      >
        {multiSelectMode && (
          <input
            type="checkbox"
            checked={isMultiSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect && onToggleSelect(index) }}
            className="absolute left-3 top-3 w-4 h-4"
          />
        )}

        <div className="flex flex-col gap-2 h-full">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground truncate flex-1">
              {(step.title && step.title.trim()) ? step.title.trim() : `Step ${displayIndex}`}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button onClick={(e) => e.stopPropagation()} variant="ghost" size="icon-sm" title="More">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent sideOffset={6} align="end">
                <DropdownMenuItem onSelect={() => onRemove && onRemove(index)} variant="destructive">
                  <Trash2 className="w-4 h-4 text-destructive" />
                  <span className="text-destructive">Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Instruction type badge */}
          <div>
            <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${badgeClass}`}>
              {step.instruction_type}
            </span>
          </div>

          <div className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap break-words flex-1">
            {step.description || 'No description yet.'}
          </div>

          {/* Bottom indicators */}
          <div className="flex items-center gap-2 mt-auto">
            {step.model_asset && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                <Box className="w-3 h-3" />
                <span>{step.model_asset_filename || '3D Model'}</span>
              </div>
            )}
            {step.media_asset && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                {step.media_type === 'video' ? <Video className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                <span>{step.media_asset_filename || step.media_type || 'Media'}</span>
              </div>
            )}
            {step.choices && step.choices.length > 0 && (
              <div className="text-xs text-muted-foreground bg-muted rounded px-2 py-1">
                {step.choices.length} choice{step.choices.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
