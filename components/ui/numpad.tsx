import { Button } from "@/components/ui/button"
import { Delete } from "lucide-react"

interface NumpadProps {
  value: string
  onChange: (value: string) => void
  onEnter?: () => void
  maxLength?: number
}

export function Numpad({ value, onChange, onEnter, maxLength = 10 }: NumpadProps) {
  const handlePress = (key: string) => {
    if (value.length >= maxLength && key !== 'backspace' && key !== 'clear') return

    if (key === 'backspace') {
      onChange(value.slice(0, -1))
    } else if (key === 'clear') {
      onChange('')
    } else {
      onChange(value + key)
    }
  }

  const buttons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    'clear', '0', 'backspace'
  ]

  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-[300px] mx-auto p-4 bg-secondary/50 rounded-xl border border-border">
      {buttons.map((btn) => {
        if (btn === 'backspace') {
          return (
            <Button
              key={btn}
              type="button"
              variant="outline"
              className="h-16 text-xl bg-background hover:bg-destructive/10 hover:text-destructive transition-all"
              onClick={() => handlePress(btn)}
            >
              <Delete className="w-6 h-6" />
            </Button>
          )
        }
        if (btn === 'clear') {
          return (
            <Button
              key={btn}
              type="button"
              variant="outline"
              className="h-16 text-lg font-medium bg-background text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-all"
              onClick={() => handlePress(btn)}
            >
              C
            </Button>
          )
        }
        return (
          <Button
            key={btn}
            type="button"
            variant="outline"
            className="h-16 text-2xl font-semibold bg-background hover:bg-primary hover:text-primary-foreground transition-all shadow-sm"
            onClick={() => handlePress(btn)}
          >
            {btn}
          </Button>
        )
      })}
      
      {onEnter && (
        <Button
          type="button"
          className="col-span-3 h-14 mt-2 text-lg font-bold shadow-md"
          onClick={onEnter}
        >
          Confirmar
        </Button>
      )}
    </div>
  )
}
