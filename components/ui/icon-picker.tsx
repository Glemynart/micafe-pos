import * as React from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DynamicIcon } from './dynamic-icon'
import { Input } from './input'
import { Search } from 'lucide-react'

// A curated list of useful icons for POS
const COMMON_ICONS = [
  'Coffee', 'CupSoda', 'Pizza', 'Sandwich', 'Croissant', 'CakeSlice', 'IceCream', 'Apple',
  'Beef', 'Carrot', 'Beer', 'Wine', 'GlassWater', 'Martini', 'Utensils', 'ChefHat',
  'Store', 'ShoppingCart', 'ShoppingBag', 'Package', 'Box', 'Tag', 'Ticket',
  'Monitor', 'Laptop', 'Smartphone', 'Gamepad2', 'Tv', 'Headphones', 'Mouse',
  'Printer', 'Book', 'FileText', 'Pen', 'Scissors', 'Shirt', 'Watch',
  'Star', 'Heart', 'Sun', 'Moon', 'Zap', 'Flame', 'Droplet', 'Leaf',
  'Globe', 'MapPin', 'Home', 'Building', 'Car', 'Truck', 'Bike',
  'DollarSign', 'CreditCard', 'Wallet', 'Coins', 'Banknote', 'PiggyBank',
  'Armchair', 'Timer', 'Clock', 'Activity', 'Smile', 'Gift', 'Info', 'Camera'
]

export function IconPicker({
  value,
  onChange,
  className
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)

  const filteredIcons = COMMON_ICONS.filter(i => i.toLowerCase().includes(search.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`w-[60px] h-[60px] flex items-center justify-center p-0 ${className}`}>
          {value ? <DynamicIcon name={value} className="h-8 w-8 text-primary" /> : <span className="text-muted-foreground text-xs">Ícono</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2 bg-card border-border" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Buscar ícono..." 
            className="pl-8 h-8 text-sm"
          />
        </div>
        <ScrollArea className="h-[200px]">
          <div className="grid grid-cols-6 gap-1">
            {filteredIcons.map(iconName => (
              <Button
                key={iconName}
                variant="ghost"
                className={`p-0 h-10 w-10 flex items-center justify-center ${value === iconName ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                onClick={() => {
                  onChange(iconName)
                  setOpen(false)
                }}
                title={iconName}
              >
                <DynamicIcon name={iconName} className="h-5 w-5" />
              </Button>
            ))}
          </div>
          {filteredIcons.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">No se encontraron íconos</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
