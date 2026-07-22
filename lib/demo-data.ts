// Datos demo para el sistema POS

import type { ImpuestoTipo } from '@/lib/impuestos-service'

export interface Product {
  id: string
  name: string
  code: string
  price: number
  cost: number
  category: string
  emoji: string
  stock: number
  // ADR-TRIB-001 D3: clasificación tributaria del ítem (reemplaza iva/impoconsumo).
  impuestoTipo: ImpuestoTipo
  // Legado (IMP-6): ya no se leen para calcular impuesto; opcionales por
  // compatibilidad con datos/tipos preexistentes.
  iva?: number
  impoconsumo?: number
  hasRecipe: boolean
}

export interface CartItem extends Product {
  quantity: number
}

export interface Ingredient {
  id: string
  name: string
  stock: number
  unit: string
  costPerUnit: number
  lastPurchasePrice: number
  minStock: number
  status: 'ok' | 'low' | 'critical'
}

export interface Recipe {
  id: string
  name: string
  productId: string
  ingredients: {
    ingredientId: string
    ingredientName: string
    quantity: number
    unit: string
    cost: number
  }[]
  totalCost: number
}

export interface Purchase {
  id: string
  date: string
  supplier: string
  total: number
  items: number
}

export interface Shift {
  id: string
  cashier: string
  date: string
  startTime: string
  endTime: string | null
  duration: string
  totalSales: number
  cashDifference: number
  status: 'active' | 'closed'
}

export interface Waste {
  id: string
  date: string
  ingredient: string
  quantity: number
  unit: string
  reason: string
  cost: number
  registeredBy: string
}

export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'cashier' | 'supervisor'
  avatar?: string
}

export const currentUser: User = {
  id: '1',
  name: 'María García',
  email: 'maria@cafepos.co',
  role: 'admin'
}

export const products: Product[] = [
  { id: '1', name: 'Café Americano', code: '100001', price: 4500, cost: 1200, category: 'Bebidas', emoji: 'Coffee', stock: 50, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '2', name: 'Cappuccino', code: '100002', price: 6500, cost: 1800, category: 'Bebidas', emoji: 'Coffee', stock: 45, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '3', name: 'Latte', code: '100003', price: 7000, cost: 2000, category: 'Bebidas', emoji: 'CupSoda', stock: 40, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '4', name: 'Espresso', code: '100004', price: 3500, cost: 900, category: 'Bebidas', emoji: 'Coffee', stock: 60, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '5', name: 'Mocaccino', code: '100005', price: 7500, cost: 2200, category: 'Bebidas', emoji: 'CupSoda', stock: 35, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '6', name: 'Sándwich Jamón y Queso', code: '200001', price: 12000, cost: 4500, category: 'Sándwiches', emoji: 'Sandwich', stock: 20, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '7', name: 'Sándwich Pollo', code: '200002', price: 14000, cost: 5200, category: 'Sándwiches', emoji: 'Sandwich', stock: 18, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '8', name: 'Croissant', code: '200003', price: 5500, cost: 1800, category: 'Sándwiches', emoji: 'Croissant', stock: 25, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '9', name: 'Torta de Chocolate', code: '300001', price: 8000, cost: 2800, category: 'Postres', emoji: 'CakeSlice', stock: 15, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '10', name: 'Cheesecake', code: '300002', price: 9000, cost: 3200, category: 'Postres', emoji: 'CakeSlice', stock: 12, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '11', name: 'Brownie', code: '300003', price: 6000, cost: 2000, category: 'Postres', emoji: 'IceCream', stock: 22, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '12', name: 'Combo Desayuno', code: '400001', price: 18000, cost: 6500, category: 'Combos', emoji: 'Utensils', stock: 30, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '13', name: 'Combo Almuerzo', code: '400002', price: 22000, cost: 8000, category: 'Combos', emoji: 'Utensils', stock: 25, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 8, hasRecipe: true },
  { id: '14', name: 'Jugo Natural', code: '100006', price: 5000, cost: 1500, category: 'Bebidas', emoji: 'CupSoda', stock: 40, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: true },
  { id: '15', name: 'Agua Mineral', code: '100007', price: 3000, cost: 800, category: 'Bebidas', emoji: 'GlassWater', stock: 100, impuestoTipo: 'inc_8', iva: 19, impoconsumo: 0, hasRecipe: false },
]

export const ingredients: Ingredient[] = [
  { id: '1', name: 'Café en grano', stock: 5000, unit: 'g', costPerUnit: 0.08, lastPurchasePrice: 80000, minStock: 1000, status: 'ok' },
  { id: '2', name: 'Leche entera', stock: 15000, unit: 'ml', costPerUnit: 0.004, lastPurchasePrice: 4000, minStock: 5000, status: 'ok' },
  { id: '3', name: 'Azúcar', stock: 3000, unit: 'g', costPerUnit: 0.003, lastPurchasePrice: 3000, minStock: 500, status: 'ok' },
  { id: '4', name: 'Chocolate en polvo', stock: 800, unit: 'g', costPerUnit: 0.025, lastPurchasePrice: 25000, minStock: 300, status: 'low' },
  { id: '5', name: 'Pan de sándwich', stock: 40, unit: 'unidades', costPerUnit: 500, lastPurchasePrice: 500, minStock: 20, status: 'ok' },
  { id: '6', name: 'Jamón', stock: 500, unit: 'g', costPerUnit: 0.035, lastPurchasePrice: 35000, minStock: 200, status: 'ok' },
  { id: '7', name: 'Queso', stock: 150, unit: 'g', costPerUnit: 0.028, lastPurchasePrice: 28000, minStock: 200, status: 'critical' },
  { id: '8', name: 'Pollo desmenuzado', stock: 800, unit: 'g', costPerUnit: 0.022, lastPurchasePrice: 22000, minStock: 300, status: 'ok' },
  { id: '9', name: 'Harina', stock: 2500, unit: 'g', costPerUnit: 0.004, lastPurchasePrice: 4000, minStock: 1000, status: 'ok' },
  { id: '10', name: 'Huevos', stock: 48, unit: 'unidades', costPerUnit: 600, lastPurchasePrice: 600, minStock: 24, status: 'ok' },
]

export const recipes: Recipe[] = [
  {
    id: '1',
    name: 'Café Americano',
    productId: '1',
    ingredients: [
      { ingredientId: '1', ingredientName: 'Café en grano', quantity: 18, unit: 'g', cost: 1440 }
    ],
    totalCost: 1440
  },
  {
    id: '2',
    name: 'Cappuccino',
    productId: '2',
    ingredients: [
      { ingredientId: '1', ingredientName: 'Café en grano', quantity: 18, unit: 'g', cost: 1440 },
      { ingredientId: '2', ingredientName: 'Leche entera', quantity: 150, unit: 'ml', cost: 600 }
    ],
    totalCost: 2040
  },
  {
    id: '3',
    name: 'Sándwich Jamón y Queso',
    productId: '6',
    ingredients: [
      { ingredientId: '5', ingredientName: 'Pan de sándwich', quantity: 2, unit: 'unidades', cost: 1000 },
      { ingredientId: '6', ingredientName: 'Jamón', quantity: 80, unit: 'g', cost: 2800 },
      { ingredientId: '7', ingredientName: 'Queso', quantity: 50, unit: 'g', cost: 1400 }
    ],
    totalCost: 5200
  }
]

export const purchases: Purchase[] = [
  { id: '1', date: '2024-01-15', supplier: 'Distribuidora ABC', total: 450000, items: 8 },
  { id: '2', date: '2024-01-12', supplier: 'Café Premium SAS', total: 320000, items: 3 },
  { id: '3', date: '2024-01-10', supplier: 'Lácteos del Valle', total: 180000, items: 5 },
  { id: '4', date: '2024-01-08', supplier: 'Panadería Don José', total: 95000, items: 4 },
  { id: '5', date: '2024-01-05', supplier: 'Distribuidora ABC', total: 520000, items: 12 },
]

export const shifts: Shift[] = [
  { id: '1', cashier: 'Carlos Rodríguez', date: '2024-01-15', startTime: '06:00', endTime: '14:00', duration: '8h', totalSales: 1250000, cashDifference: 0, status: 'closed' },
  { id: '2', cashier: 'Ana Martínez', date: '2024-01-15', startTime: '14:00', endTime: '22:00', duration: '8h', totalSales: 980000, cashDifference: -5000, status: 'closed' },
  { id: '3', cashier: 'María García', date: '2024-01-16', startTime: '06:00', endTime: null, duration: '4h 30m', totalSales: 650000, cashDifference: 0, status: 'active' },
]

export const wastes: Waste[] = [
  { id: '1', date: '2024-01-15', ingredient: 'Leche entera', quantity: 500, unit: 'ml', reason: 'Vencido', cost: 2000, registeredBy: 'Carlos Rodríguez' },
  { id: '2', date: '2024-01-14', ingredient: 'Pan de sándwich', quantity: 4, unit: 'unidades', reason: 'Dañado', cost: 2000, registeredBy: 'Ana Martínez' },
  { id: '3', date: '2024-01-13', ingredient: 'Café en grano', quantity: 50, unit: 'g', reason: 'Quemado', cost: 4000, registeredBy: 'María García' },
]

export const categories = ['Todos', 'Bebidas', 'Sándwiches', 'Postres', 'Combos']

export const paymentMethods = [
  { id: 'cash', name: 'Efectivo', icon: 'Banknote' },
  { id: 'card', name: 'Tarjeta', icon: 'CreditCard' },
  { id: 'transfer', name: 'Transferencia', icon: 'Smartphone' },
]

export const billDenominations = [
  { value: 100000, label: '$100.000' },
  { value: 50000, label: '$50.000' },
  { value: 20000, label: '$20.000' },
  { value: 10000, label: '$10.000' },
  { value: 5000, label: '$5.000' },
  { value: 2000, label: '$2.000' },
]

export const coinDenominations = [
  { value: 1000, label: '$1.000' },
  { value: 500, label: '$500' },
  { value: 200, label: '$200' },
  { value: 100, label: '$100' },
  { value: 50, label: '$50' },
]

export const modules = [
  { id: 'sell', name: 'Vender', icon: 'ShoppingCart', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'salon', name: 'Salón', icon: 'Armchair', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'kitchen', name: 'Cocina (KDS)', icon: 'ChefHat', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'alquiler_dashboard', name: 'Alquileres', icon: 'Timer', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'reservas', name: 'Reservas Web', icon: 'CalendarDays', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'cuentas_cobro', name: 'Cuentas de Cobro', icon: 'ClipboardList', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'clientes', name: 'Clientes', icon: 'Users', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'consignaciones', name: 'Consignadores', icon: 'Handshake', roles: ['admin', 'supervisor'] },
  { id: 'inventory', name: 'Inventario', icon: 'Package', roles: ['admin', 'supervisor'] },
  { id: 'recipes', name: 'Recetas', icon: 'ChefHat', roles: ['admin', 'supervisor'] },
  { id: 'purchases', name: 'Compras', icon: 'Truck', roles: ['admin', 'supervisor'] },
  { id: 'reports', name: 'Reportes', icon: 'BarChart3', roles: ['admin', 'supervisor'] },
  { id: 'finanzas', name: 'Finanzas', icon: 'Landmark', roles: ['admin'] },
  { id: 'gastos', name: 'Gastos', icon: 'TrendingDown', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'shifts', name: 'Turnos', icon: 'Clock', roles: ['admin', 'cashier', 'supervisor'] },
  { id: 'waste', name: 'Mermas', icon: 'Trash2', roles: ['admin', 'supervisor'] },
  { id: 'permissions', name: 'Permisos', icon: 'Shield', roles: ['admin'] },
  { id: 'settings', name: 'Configuración', icon: 'Settings', roles: ['admin'] },
  { id: 'historial', name: 'Historial', icon: 'History', roles: ['admin', 'supervisor'] },
]

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export const calculateMargin = (price: number, cost: number): number => {
  if (price === 0) return 0
  return Math.round(((price - cost) / price) * 100)
}
