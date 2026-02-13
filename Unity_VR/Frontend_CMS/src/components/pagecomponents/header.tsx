import { Button } from '../ui/button'
import { ChevronLeft } from 'lucide-react'
import ThemeToggle from '../ui/theme-toggle'
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar'

type HeaderProps = {
    title: string
    onBack?: () => void
    showBack?: boolean
}

export default function Header({ title, onBack, showBack = true }: HeaderProps) {
    return (
        <div className="col-span-1 lg:col-span-12 p-4 border-b border-border bg-card/10 h-16 flex items-center">
            <div className="flex items-center w-full">
                <div className="flex-1 flex justify-start">
                    {showBack ? (
                        <Button onClick={onBack} aria-label="Back" variant="secondary" size="icon-sm">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                    ) : null}
                </div>
                <div className="flex-1 flex justify-center">
                    <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                </div>
                <div className="flex-1 flex justify-end items-center gap-2">
                    <ThemeToggle />
                    <Avatar className="w-9 h-9">
                        <AvatarFallback>UN</AvatarFallback>
                    </Avatar>
                </div>
            </div>
        </div>
    )
}
