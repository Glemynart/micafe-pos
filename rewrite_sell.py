# -*- coding: utf-8 -*-
import sys

filepath = 'components/pos/sell-module.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# REWRITE THE RIGHT COLUMN CART
old_cart = content.find('<Card className=\"flex-[4] flex flex-col bg-white dark:bg-card')
old_cart_end = content.find('</Card>', old_cart) + 7

new_cart = r'''<Card className="flex-[4] flex flex-col bg-[#fdfaf6] dark:bg-[#1a110e] border-none rounded-2xl shadow-xl overflow-hidden relative z-10">
          {/* Selector de Mesas / Cuentas Arriba del Carrito */}
          <div className="p-4 bg-white/50 dark:bg-[#1e1410]/50 border-b border-amber-100/50 dark:border-[#3a2820]">
            <button
                className="w-full flex items-center justify-between p-3 rounded-xl border border-amber-200/60 dark:border-[#3a2820] hover:border-amber-400 dark:hover:border-amber-700/50 transition-colors bg-white dark:bg-[#1e1410] shadow-sm group"
                onClick={() => setShowMesasDialog(true)}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-[#3a2820] flex items-center justify-center text-amber-600 dark:text-amber-500">
                        <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                        <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {selectedMesaId ? mesas.find(m => m.id === selectedMesaId)?.nombre : 'Mostrador'}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Cambiar Mesa</p>
                    </div>
                </div>
                <div className="bg-amber-50 dark:bg-[#3a2820] px-3 py-1 rounded-full border border-amber-100 dark:border-[#4a362b] text-amber-700 dark:text-amber-400 font-bold text-sm">
                    {formatCurrency(subtotal)}
                </div>
            </button>
          </div>

          <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-amber-700 dark:text-amber-500" /> Tu Orden
              </h2>
              <Badge variant="secondary" className="bg-amber-200/50 dark:bg-[#3a2820] text-amber-800 dark:text-amber-400 hover:bg-amber-200/50 dark:hover:bg-[#4a362b] rounded-full font-bold px-3">{cart.length} ITEMS</Badge>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 pt-0 space-y-3">
              {cart.map((item, idx) => (
                  <div key={${item.id}-} className="flex flex-col p-4 rounded-xl border border-amber-200/50 dark:border-[#3a2820] bg-white dark:bg-[#1e1410] shadow-sm group">
                      <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-[#2a1d17] flex items-center justify-center text-amber-700 dark:text-amber-500">
                                  <DynamicIcon name={item.emoji} className="w-4 h-4" />
                              </div>
                              <div>
                                  <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-tight">{item.name}</p>
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{item.id.substring(0, 15)}</p>
                              </div>
                          </div>
                      </div>
                      <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-amber-50/50 dark:bg-[#2a1d17] rounded-lg p-1 border border-amber-100/50 dark:border-[#3a2820]">
                              <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-[#3a2820] text-slate-600 dark:text-slate-400 shadow-sm transition-all active:scale-95"><Minus className="h-4 w-4"/></button>
                              <span className="w-8 text-center font-bold text-slate-900 dark:text-slate-100">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white dark:hover:bg-[#3a2820] text-slate-600 dark:text-slate-400 shadow-sm transition-all active:scale-95"><Plus className="h-4 w-4"/></button>
                          </div>
                          <div className="flex items-center gap-4">
                              <p className="font-black text-amber-800 dark:text-amber-500">{formatCurrency(item.price * item.quantity)}</p>
                              <button onClick={() => removeFromCart(item.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4"/></button>
                          </div>
                      </div>
                  </div>
              ))}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="mt-auto p-6 bg-[#f8f5f0] dark:bg-[#1a110e] border-t border-amber-100/50 dark:border-[#3a2820]">
              <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>Subtotal</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>IVA (19%)</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalIva)}</span>
                  </div>
              </div>
              <div className="flex justify-between items-center mb-6">
                  <span className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-wide">TOTAL</span>
                  <span className="text-3xl font-black text-orange-600 dark:text-orange-500">{formatCurrency(total)}</span>
              </div>

              <div className="relative mb-4 group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                  <Input placeholder="C.C. o NIT (Consumidor Final)..." className="pl-10 bg-white dark:bg-[#1e1410] border-amber-200/60 dark:border-[#3a2820] focus:border-orange-500 focus:ring-orange-500/20 h-12 rounded-xl text-slate-900 dark:text-slate-100 font-medium placeholder:text-slate-400 dark:placeholder:text-slate-500" />
              </div>

              <div className="flex gap-3">
                  <Button variant="outline" className="h-14 flex-[1] rounded-xl border-amber-200/80 dark:border-[#3a2820] font-bold text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-[#2a1d17] hover:text-orange-700 dark:hover:text-orange-500 bg-white dark:bg-[#1e1410] shadow-sm">
                      Cocina
                  </Button>
                  <Button onClick={() => setShowPayment(true)} className="h-14 flex-[2] rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-black text-lg shadow-xl shadow-orange-500/30 dark:shadow-orange-900/20 transition-all active:scale-95 border-none">
                      <Banknote className="mr-2 h-5 w-5" /> COBRAR
                  </Button>
              </div>
          </div>
        </Card>'''

if old_cart != -1:
    content = content[:old_cart] + new_cart + content[old_cart_end:]

# REWRITE THE MESAS DIALOG
old_mesas = content.find('<Dialog open={showMesasDialog}')
old_mesas_end = content.find('</Dialog>', old_mesas) + 9

new_mesas = r'''<Dialog open={showMesasDialog} onOpenChange={setShowMesasDialog}>
        <DialogContent className="max-w-4xl bg-white dark:bg-[#1a110e] border-none h-[80vh] flex flex-col p-0 overflow-hidden shadow-2xl rounded-3xl">
          <DialogHeader className="px-6 py-5 border-b border-amber-100/50 dark:border-[#3a2820] bg-white dark:bg-[#1e1410]">
            <DialogTitle className="text-2xl font-black flex items-center gap-3 text-slate-800 dark:text-slate-100">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-[#3a2820] flex items-center justify-center shadow-inner">
                <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              </div>
              Gestión de Mesas y Cuentas
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 mt-2 font-medium text-base">
              Selecciona una mesa para ver su pedido activo o crear uno nuevo.
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 bg-slate-50/50 dark:bg-[#140e0b]/50 p-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 pb-8">
              {/* Mostrador option */}
              <button 
                className={cn(
                  "relative flex items-center gap-4 p-5 rounded-2xl border-2 border-dashed transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/30",
                  selectedMesaId === null 
                    ? "bg-amber-50 dark:bg-[#2a1d17] border-amber-400 dark:border-amber-600 ring-4 ring-amber-500/20" 
                    : "bg-white dark:bg-[#1e1410] border-amber-200/60 dark:border-[#3a2820] hover:border-amber-400 dark:hover:border-amber-700/50 hover:bg-amber-50/50 dark:hover:bg-[#2a1d17] hover:-translate-y-1 hover:shadow-lg"
                )}
                onClick={() => { setSelectedMesaId(null); setShowMesasDialog(false) }}
              >
                <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-[#3a2820] flex items-center justify-center text-amber-600 dark:text-amber-500 shrink-0 shadow-sm">
                    <ShoppingCart className="h-6 w-6" />
                </div>
                <div className="text-left">
                    <p className="font-black text-slate-800 dark:text-slate-100 text-base leading-tight">Venta</p>
                    <p className="font-black text-slate-800 dark:text-slate-100 text-base leading-tight">Mostrador</p>
                </div>
              </button>

              {/* Mesas List */}
              {mesas.map(mesa => {
                const mesaTienePedido = pedidosActivos.some(p => p.mesaId === mesa.id)
                const pedidoMesa = pedidosActivos.find(p => p.mesaId === mesa.id)
                const isActive = selectedMesaId === mesa.id
                
                return (
                  <button
                    key={mesa.id}
                    onClick={() => { setSelectedMesaId(mesa.id); setShowMesasDialog(false) }}
                    className={cn(
                      "relative flex flex-col p-5 rounded-2xl border transition-all text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/30",
                      isActive ? "ring-4 ring-amber-500/20" : "",
                      mesaTienePedido 
                        ? "bg-amber-50/80 dark:bg-[#2a1d17] border-amber-300 dark:border-amber-700/50 hover:border-amber-500 shadow-sm hover:shadow-md hover:-translate-y-1" 
                        : "bg-white dark:bg-[#1e1410] border-slate-200 dark:border-[#3a2820] hover:border-slate-300 dark:hover:border-[#4a362b] hover:shadow-md hover:-translate-y-1",
                      mesaTienePedido && isActive && "bg-amber-100/80 dark:bg-[#3a2820] border-amber-500 dark:border-amber-600"
                    )}
                  >
                    <div className="flex items-start justify-between w-full mb-4">
                      <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-inner",
                          mesaTienePedido ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white" : "bg-slate-100 dark:bg-[#2a1d17] text-slate-400 dark:text-slate-500"
                      )}>
                        M
                      </div>
                      <Badge variant="secondary" className={cn(
                          "text-[10px] font-black px-2.5 py-1 rounded-full tracking-wider",
                          mesaTienePedido ? "bg-orange-500 text-white shadow-sm" : "bg-slate-100 dark:bg-[#2a1d17] text-slate-400 dark:text-slate-500"
                      )}>
                        {mesaTienePedido ? 'OCUPADA' : 'LIBRE'}
                      </Badge>
                    </div>
                    <p className="font-black text-slate-800 dark:text-slate-100 text-lg mb-1 truncate w-full">{mesa.nombre}</p>
                    {mesaTienePedido ? (
                      <div className="flex items-center justify-between w-full mt-auto pt-3 border-t border-amber-200/50 dark:border-[#3a2820]">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-500 flex items-center gap-1 bg-amber-100/50 dark:bg-[#3a2820] px-2 py-0.5 rounded-md">
                          {pedidoMesa?.items.length || 0} ITEMS 🍽️
                        </span>
                        <span className="font-black text-orange-700 dark:text-orange-500 text-base">
                          {formatCurrency(pedidoMesa?.items.reduce((acc, i) => acc + (i.price * i.quantity), 0) || 0)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-auto pt-3 border-t border-slate-100 dark:border-[#2a1d17]">Toca para abrir</p>
                    )}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>'''

if old_mesas != -1:
    content = content[:old_mesas] + new_mesas + content[old_mesas_end:]

# ADD DARK MODE TO PRODUCT GRID (Left column)
old_products = content.find('<div className=\"grid grid-cols-4 gap-3 pr-4\">')
old_products_end = content.find('</div>', old_products) + 6

new_products = r'''<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pr-4 pb-8">
                {filteredProducts.map((product, idx) => (
                  <Card 
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10 hover:border-amber-400/50 bg-white dark:bg-[#1a110e] backdrop-blur-md border-slate-200 dark:border-[#2a1d17] rounded-[1.5rem] animate-fade-in active:scale-95 group overflow-hidden",
                      product.stock <= (product.stockMinimo || 5) && "border-red-500/50 hover:border-red-500/80"
                    )}
                    style={{ animationDelay: ${idx * 30}ms }}
                  >
                    <CardContent className="p-4 flex flex-col h-full relative">
                      {/* Imagen o icono de placeholder */}
                      {product.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imagenUrl}
                          alt={product.nombre}
                          className="w-full h-24 object-cover rounded-xl mb-4 shadow-inner"
                        />
                      ) : (
                        <div className="w-full h-20 mb-4 flex items-center justify-center bg-gradient-to-br from-amber-50 dark:from-[#2a1d17] to-amber-100/50 dark:to-[#1e1410] rounded-xl text-amber-600 dark:text-amber-500 group-hover:scale-110 transition-transform duration-500 shadow-inner border border-amber-200/30 dark:border-[#3a2820]/50">
                          <DynamicIcon name={product.icono} className="w-8 h-8 opacity-80" />
                        </div>
                      )}

                      <div className="flex flex-col flex-1">
                          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight mb-2 line-clamp-2">{product.nombre}</h3>
                          <div className="mt-auto flex items-end justify-between">
                            <p className="font-black text-amber-600 dark:text-amber-500 text-lg">{formatCurrency(product.precio)}</p>
                            <Badge variant="secondary" className="bg-slate-100 dark:bg-[#2a1d17] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#3a2820] font-bold text-[10px]">
                              {product.stock}
                            </Badge>
                          </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>'''

if old_products != -1:
    content = content[:old_products] + new_products + content[old_products_end:]

# Update the main container background
old_container = content.find('<div className=\"flex h-full gap-4 p-4 bg-slate-50 dark:bg-background\">')
new_container = '<div className="flex h-full gap-4 p-4 bg-[#fdfaf6] dark:bg-[#140e0b]">'
if old_container != -1:
    old_container_end = old_container + len('<div className=\"flex h-full gap-4 p-4 bg-slate-50 dark:bg-background\">')
    content = content[:old_container] + new_container + content[old_container_end:]
else:
    # try alternative background
    old_container2 = content.find('<div className=\"flex h-full gap-4 p-4 bg-slate-50\">')
    if old_container2 != -1:
        old_container_end = old_container2 + len('<div className=\"flex h-full gap-4 p-4 bg-slate-50\">')
        content = content[:old_container2] + new_container + content[old_container_end:]
    else:
        old_container3 = content.find('<div className=\"flex h-full gap-4 p-4\">')
        if old_container3 != -1:
            old_container_end = old_container3 + len('<div className=\"flex h-full gap-4 p-4\">')
            content = content[:old_container3] + new_container + content[old_container_end:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print('Rewrite complete.')