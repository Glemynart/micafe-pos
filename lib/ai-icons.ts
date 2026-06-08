/**
 * lib/ai-icons.ts
 *
 * Un motor de heurística sencilla ("IA local") para asignar íconos
 * automáticamente a los productos según su nombre.
 */

const iconRules = [
  {
    icon: 'Coffee',
    keywords: ['cafe', 'café', 'tinto', 'espresso', 'cappuccino', 'latte', 'macchiato', 'americano', 'mocaccino', 'ceramica', 'taza', 'vaso', 'mug']
  },
  {
    icon: 'CupSoda',
    keywords: ['frio', 'frío', 'frappe', 'frappé', 'jugo', 'gaseosa', 'bebida', 'soda', 'limonada', 'batido', 'smoothie', 'te', 'té', 'agua', 'botella', 'refresco']
  },
  {
    icon: 'CakeSlice',
    keywords: ['torta', 'postre', 'brownie', 'galleta', 'cheesecake', 'pie', 'alfajor', 'pastel', 'dulce', 'muffin', 'cupcake', 'donut', 'dona']
  },
  {
    icon: 'Sandwich',
    keywords: ['sandwich', 'sándwich', 'hamburguesa', 'pan', 'croissant', 'empanada', 'arepa', 'buñuelo', 'pandebono', 'hojaldre', 'wrap', 'burrito']
  },
  {
    icon: 'Pizza',
    keywords: ['pizza', 'porción', 'porcion', 'tajada']
  },
  {
    icon: 'IceCream',
    keywords: ['helado', 'paleta', 'cono', 'sundae', 'gelato']
  },
  {
    icon: 'Apple',
    keywords: ['manzana', 'fruta', 'ensalada', 'banano', 'fresa', 'naranja', 'mango', 'limon']
  },
  {
    icon: 'Utensils',
    keywords: ['almuerzo', 'comida', 'plato', 'menu', 'menú', 'sopa', 'crema', 'carne', 'pollo', 'pescado', 'desayuno']
  },
  {
    icon: 'Book',
    keywords: ['libro', 'cuaderno', 'manga', 'comic', 'revista', 'enciclopedia', 'diccionario', 'agenda', 'libreta']
  },
  {
    icon: 'Pen',
    keywords: ['lapiz', 'lápiz', 'esfero', 'boligrafo', 'bolígrafo', 'marcador', 'color', 'colores', 'crayola', 'borrador', 'sacapuntas', 'resaltador', 'plumon']
  },
  {
    icon: 'FileText',
    keywords: ['resma', 'papel', 'cartulina', 'hoja', 'impresion', 'impresión', 'fotocopia', 'copia', 'documento', 'carpeta', 'sobre', 'sobremanila']
  },
  {
    icon: 'Scissors',
    keywords: ['tijera', 'tijeras', 'bisturi', 'regla', 'pegante', 'colbon', 'cinta', 'grapadora', 'clip', 'clips']
  },
  {
    icon: 'Printer',
    keywords: ['tinta', 'toner', 'cartucho', 'impresora', 'escanner', 'scanner', 'escaneo']
  },
  {
    icon: 'Shirt',
    keywords: ['camisa', 'camiseta', 'ropa', 'tejido', 'buso', 'sueter', 'pantalón', 'pantalon', 'prenda', 'chaqueta', 'gorra', 'sombrero', 'bufanda', 'guantes']
  },
  {
    icon: 'ShoppingBag',
    keywords: ['bolso', 'cartera', 'mochila', 'morral', 'maleta', 'equipaje', 'tote', 'bolsa', 'tula']
  },
  {
    icon: 'Gem',
    keywords: ['anillo', 'collar', 'pulsera', 'arete', 'joya', 'bisuteria', 'bisutería', 'artesania', 'dije', 'cadena']
  },
  {
    icon: 'Brush',
    keywords: ['pintura', 'pincel', 'acuarela', 'oleo', 'óleo', 'lienzo', 'cuadro', 'arte', 'escultura', 'ceramica', 'maceta', 'vasija']
  },
  {
    icon: 'Gift',
    keywords: ['regalo', 'ancheta', 'detalle', 'sorpresa', 'caja', 'empaque', 'souvenir', 'recuerdo']
  },
  {
    icon: 'Sparkles',
    keywords: ['crema', 'locion', 'perfume', 'maquillaje', 'labial', 'jabon', 'shampoo', 'acondicionador', 'belleza', 'cuidado', 'esencia', 'aroma']
  },
  {
    icon: 'Droplet',
    keywords: ['miel', 'almibar', 'jarabe', 'sirope', 'aceite', 'salsa', 'mermelada']
  },
  {
    icon: 'Laptop',
    keywords: ['computador', 'laptop', 'portatil', 'teclado', 'mouse', 'pantalla', 'monitor']
  },
  {
    icon: 'Smartphone',
    keywords: ['celular', 'telefono', 'cargador', 'cable', 'funda', 'carcasa']
  },
  {
    icon: 'Headphones',
    keywords: ['audifonos', 'auriculares', 'diadema', 'parlante', 'bocina']
  },
  {
    icon: 'Gamepad2',
    keywords: ['juego', 'juguete', 'consola', 'control', 'peluche', 'muneco', 'muñeco', 'rompecabezas', 'figura']
  }
];

/**
 * Analiza el nombre de un producto y sugiere el mejor ícono de Lucide.
 * Retorna null si no encuentra coincidencias, para mantener el ícono actual.
 */
export function sugerirIconoBasadoEnNombre(nombre: string): string | null {
  if (!nombre || nombre.trim() === '') return null;
  
  // Normalizar: a minúsculas y quitar acentos básicos para mejor coincidencia
  const nombreNormalizado = nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const palabras = nombreNormalizado.split(/\s+/);

  for (const regla of iconRules) {
    for (const keyword of regla.keywords) {
      const keywordNormalizada = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      // Si el nombre completo incluye la palabra clave completa
      // Usar regex con \b para buscar palabras completas y evitar que "papel" coincida con "papelera"
      const regex = new RegExp(`\\b${keywordNormalizada}\\b`, 'i');
      if (regex.test(nombreNormalizado)) {
        return regla.icon;
      }
    }
  }

  // Si no hay coincidencias fuertes (palabra completa), hacemos una búsqueda por subcadena
  for (const regla of iconRules) {
    for (const keyword of regla.keywords) {
      const keywordNormalizada = keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (nombreNormalizado.includes(keywordNormalizada)) {
        return regla.icon;
      }
    }
  }

  return null;
}
