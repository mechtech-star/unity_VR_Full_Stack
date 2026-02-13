import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
  disabled?: boolean
}

const SelectContext = React.createContext<{
  value?: string
  onValueChange?: (value: string) => void
}>({})

function Select({ value, onValueChange, placeholder, children, className, disabled }: SelectProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <SelectContext.Provider value={{ value, onValueChange }}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              !value && "text-muted-foreground",
              className
            )}
            disabled={disabled}
          >
            {value ? (
              React.Children.toArray(children).find(
                (child) =>
                  React.isValidElement(child) &&
                  child.props.value === value
              )?.props.children || value
            ) : (
              placeholder || "Select..."
            )}
            <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-full min-w-[var(--radix-dropdown-menu-trigger-width)]">
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </SelectContext.Provider>
  )
}

function SelectItem({ value, children, disabled }: SelectItemProps) {
  const { value: selectedValue, onValueChange } = React.useContext(SelectContext)

  return (
    <DropdownMenuItem
      onClick={() => onValueChange?.(value)}
      disabled={disabled}
      className="cursor-pointer"
    >
      <CheckIcon
        className={cn(
          "mr-2 h-4 w-4",
          selectedValue === value ? "opacity-100" : "opacity-0"
        )}
      />
      {children}
    </DropdownMenuItem>
  )
}

export { Select, SelectItem }