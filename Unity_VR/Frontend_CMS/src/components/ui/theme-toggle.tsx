import React from 'react'
import { Button } from './button'
import { useTheme } from '../../lib/theme'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button variant="outline" onClick={toggleTheme} size="icon" className="rounded-full" aria-label="Toggle Theme">
      {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
  )
}
