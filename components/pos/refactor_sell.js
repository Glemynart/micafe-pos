const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'sell-module.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Replace Category Tabs
const oldTabsList = `<TabsList className="bg-card border border-border h-auto flex-wrap p-1 gap-1">`;
const newTabsList = `<TabsList className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 bg-transparent border-none h-auto">`;
content = content.replace(oldTabsList, newTabsList);

const oldTabsTrigger1 = `className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 h-11 text-base font-medium rounded-lg"`;
const newTabsTrigger1 = `className="px-6 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl font-medium text-sm whitespace-nowrap shadow-sm border border-border data-[state=active]:border-primary flex items-center gap-2 h-[48px] transition-colors"`;
content = content.replace(oldTabsTrigger1, newTabsTrigger1);

const oldTabsTrigger2 = `className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 h-11 text-base font-medium rounded-lg flex items-center gap-2"`;
const newTabsTrigger2 = `className="px-6 py-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-xl font-medium text-sm whitespace-nowrap shadow-sm border border-border data-[state=active]:border-primary flex items-center gap-2 h-[48px] transition-colors"`;
content = content.replace(oldTabsTrigger2, newTabsTrigger2);


// 2. Replace Product Card Grid
const oldCardGridRegex = /<Card[\s\S]*?className=\{cn\([\s\S]*?"cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg bg-card border-border hover:border-primary\/50 rounded-\[1\.5rem\] animate-fade-in active:scale-95 group overflow-hidden",[\s\S]*?product\.stock <= \(product\.stockMinimo \|\| 5\) && "border-destructive\/50 hover:border-destructive"[\s\S]*?\)\}[\s\S]*?style=\{\{ animationDelay: `\$\{idx \* 30\}ms` \}\}[\s\S]*?>[\s\S]*?<CardContent className="p-4 flex flex-col h-full relative">[\s\S]*?\{\/\* Imagen o icono de placeholder \*\/\}[\s\S]*?\{product\.imagenUrl \? \([\s\S]*?\/\/ eslint-disable-next-line @next\/next\/no-img-element[\s\S]*?<img[\s\S]*?src=\{product\.imagenUrl\}[\s\S]*?alt=\{product\.nombre\}[\s\S]*?className="w-full h-24 object-cover rounded-xl mb-4 shadow-inner"[\s\S]*?\/>[\s\S]*?\) : \([\s\S]*?<div className="w-full h-20 mb-4 flex items-center justify-center bg-muted\/50 rounded-xl text-muted-foreground group-hover:scale-110 transition-transform duration-500 border border-border\/50">[\s\S]*?<DynamicIcon name=\{product\.icono\} className="w-8 h-8 opacity-80" \/>[\s\S]*?<\/div>[\s\S]*?\)\}[\s\S]*?<div className="flex flex-col flex-1">[\s\S]*?<h3 className="font-bold text-foreground text-sm leading-tight mb-2 line-clamp-2">\{product\.nombre\}<\/h3>[\s\S]*?<div className="mt-auto flex items-end justify-between">[\s\S]*?<p className="font-black text-primary text-lg">\{formatCurrency\(product\.precio\)\}<\/p>[\s\S]*?<Badge variant="secondary" className="bg-secondary text-secondary-foreground font-bold text-\[10px\]">[\s\S]*?\{product\.stock\}[\s\S]*?<\/Badge>[\s\S]*?<\/div>[\s\S]*?<\/div>[\s\S]*?<\/CardContent>[\s\S]*?<\/Card>/;

const newCardGrid = `<Card 
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className={cn(
                      "bg-card border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group flex flex-col active:scale-95 shadow-md relative h-48",
                      product.stock <= (product.stockMinimo || 5) && "border-destructive/50 hover:border-destructive"
                    )}
                    style={{ animationDelay: \`\${idx * 30}ms\` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-10"></div>
                    <div className="h-24 bg-muted/20 w-full relative overflow-hidden border-b border-border/50">
                      {product.imagenUrl ? (
                        <img
                          src={product.imagenUrl}
                          alt={product.nombre}
                          className="object-cover w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted/10 text-muted-foreground group-hover:text-primary transition-colors">
                          <DynamicIcon name={product.icono} className="w-10 h-10 opacity-70" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3 flex flex-col flex-1 justify-between bg-card z-10">
                      <h3 className="font-bold text-foreground text-sm leading-tight line-clamp-2">{product.nombre}</h3>
                      <div className="mt-auto flex items-end justify-between pt-2">
                        <p className="font-black text-primary text-[15px]">{formatCurrency(product.precio)}</p>
                        <Badge variant="secondary" className="bg-secondary/20 text-secondary-foreground font-bold text-[10px] border-none shadow-none">
                          {product.stock}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>`;

content = content.replace(oldCardGridRegex, newCardGrid);

// 3. Receipt Sidebar
const oldSidebar = `<Card className="flex-[4] flex flex-col bg-card border-border shadow-xl overflow-hidden relative z-10 rounded-2xl min-h-0">`;
const newSidebar = `<Card className="w-80 lg:w-96 flex flex-col bg-card border-l border-border shadow-[-4px_0_15px_rgba(0,0,0,0.1)] overflow-hidden relative z-20 rounded-none border-y-0 border-r-0 min-h-0 shrink-0">`;
content = content.replace(oldSidebar, newSidebar);

// 4. Pay Button
const oldPayButton = `<Button onClick={() => setShowPayment(true)} className="h-16 flex-[2] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xl shadow-lg transition-all active:scale-95 border-none">
                      <Banknote className="mr-2 h-6 w-6" /> COBRAR
                  </Button>`;
const newPayButton = `<Button onClick={() => setShowPayment(true)} className="h-16 flex-[2] rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xl shadow-[0_4px_14px_rgba(var(--primary),0.3)] transition-all active:scale-95 border-none relative overflow-hidden group">
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      <Banknote className="mr-2 h-6 w-6 relative z-10" /> <span className="relative z-10">COBRAR</span>
                  </Button>`;
content = content.replace(oldPayButton, newPayButton);

// 5. Layout wrapper padding/gap adjustment to fit the new flush sidebar
const oldLayout = `<div className="flex-1 flex gap-4 p-4 md:p-6 bg-background min-h-0 overflow-hidden">`;
const newLayout = `<div className="flex-1 flex gap-0 p-0 bg-background min-h-0 overflow-hidden">`;
content = content.replace(oldLayout, newLayout);

const oldLeftCol = `<div className="flex-[6] flex flex-col gap-4 min-h-0">`;
const newLeftCol = `<div className="flex-1 flex flex-col gap-4 min-h-0 p-4 md:p-6">`;
content = content.replace(oldLeftCol, newLeftCol);

fs.writeFileSync(targetFile, content);
console.log("Refactored sell-module.tsx successfully");
