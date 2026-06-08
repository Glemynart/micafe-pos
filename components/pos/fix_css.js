const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', '..', 'app', 'globals.css');
let content = fs.readFileSync(cssPath, 'utf8');

const correctTop = `@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

:root {
  /* Tema Azul Marino/Dorado - Institucional y Premium (Landing) */
  --background: hsl(210, 40%, 98%);
  --foreground: hsl(213, 86%, 14%);
  --card: hsl(0, 0%, 100%);
  --card-foreground: hsl(213, 86%, 14%);
  --popover: hsl(0, 0%, 100%);
  --popover-foreground: hsl(213, 86%, 14%);
  --primary: hsl(213, 86%, 14%);
  --primary-foreground: hsl(0, 0%, 100%);
  --secondary: hsl(42, 97%, 50%);
  --secondary-foreground: hsl(213, 86%, 14%);
  --muted: hsl(210, 40%, 96%);
  --muted-foreground: hsl(215, 16%, 47%);
  --accent: hsl(197, 100%, 25%);
  --accent-foreground: hsl(0, 0%, 100%);
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(0, 0%, 100%);
  --border: hsl(214, 32%, 91%);
  --input: hsl(214, 32%, 91%);
  --ring: hsl(213, 86%, 14%);
  --chart-1: hsl(213, 86%, 14%);
  --chart-2: hsl(42, 97%, 50%);
  --chart-3: hsl(197, 100%, 25%);
  --chart-4: hsl(215, 16%, 47%);
  --chart-5: hsl(210, 40%, 96%);
  --radius: 0.75rem;
  --sidebar: hsl(213, 86%, 14%);
  --sidebar-foreground: hsl(0, 0%, 100%);
  --sidebar-primary: hsl(42, 97%, 50%);
  --sidebar-primary-foreground: hsl(213, 86%, 14%);
  --sidebar-accent: hsl(213, 80%, 20%);
  --sidebar-accent-foreground: hsl(0, 0%, 100%);
  --sidebar-border: hsl(213, 80%, 25%);
  --sidebar-ring: hsl(42, 97%, 50%);
  --success: hsl(142, 71%, 45%);
  --success-foreground: hsl(0, 0%, 100%);
  --warning: hsl(42, 97%, 50%);
  --warning-foreground: hsl(213, 86%, 14%);
}

.theme-pos {
  /* Tema Minimalista Crema/Café Claro - Pro Max */
  /* Fondo Crema Muy Claro */
  --background: hsl(38, 40%, 97%);
  --foreground: hsl(20, 20%, 25%);
  --card: hsl(0, 0%, 100%);
  --card-foreground: hsl(20, 20%, 25%);
  --popover: hsl(0, 0%, 100%);
  --popover-foreground: hsl(20, 20%, 25%);
  
  /* Café Au Lait */
  --primary: hsl(20, 29%, 53%);
  --primary-foreground: hsl(0, 0%, 100%);
  
  /* Hazelnut */
  --secondary: hsl(27, 33%, 65%);
  --secondary-foreground: hsl(0, 0%, 100%);
  
  --muted: hsl(38, 30%, 92%);
  --muted-foreground: hsl(20, 10%, 45%);
  
  --accent: hsl(27, 33%, 65%);
  --accent-foreground: hsl(0, 0%, 100%);
  
  --destructive: hsl(0, 84%, 60%);
  --destructive-foreground: hsl(0, 0%, 100%);
  --border: hsl(38, 30%, 88%);
  --input: hsl(38, 30%, 88%);
  --ring: hsl(20, 29%, 53%);
  
  --chart-1: hsl(20, 29%, 53%);
  --chart-2: hsl(27, 33%, 65%);
  --chart-3: hsl(20, 20%, 25%);
  --chart-4: hsl(20, 10%, 45%);
  --chart-5: hsl(38, 30%, 88%);
  --radius: 1rem;
  
  /* Sidebar Café Espresso (Mejor Contraste) */
  --sidebar: hsl(20, 30%, 20%); /* Café oscuro profesional */
  --sidebar-foreground: hsl(38, 40%, 97%); /* Texto crema claro (alto contraste) */
  --sidebar-primary: hsl(38, 40%, 97%); /* Fondo activo crema */
  --sidebar-primary-foreground: hsl(20, 30%, 20%); /* Texto café oscuro sobre activo */
  --sidebar-accent: hsl(20, 25%, 28%); /* Hover sutil */
  --sidebar-accent-foreground: hsl(0, 0%, 100%); /* Texto blanco puro al pasar el mouse */
  --sidebar-border: hsl(20, 25%, 25%);
  --sidebar-ring: hsl(38, 40%, 97%);
}

.dark {
  /* Tema oscuro opcional - Azul profundo */
  --background: hsl(222, 47%, 11%);
  --foreground: hsl(210, 40%, 98%);
  --card: hsl(222, 47%, 11%);
  --card-foreground: hsl(210, 40%, 98%);
  --popover: hsl(222, 47%, 11%);
  --popover-foreground: hsl(210, 40%, 98%);
  --primary: hsl(42, 97%, 50%);
  --primary-foreground: hsl(213, 86%, 14%);
  --secondary: hsl(217, 32%, 17%);
  --secondary-foreground: hsl(210, 40%, 98%);
  --muted: hsl(217, 32%, 17%);
  --muted-foreground: hsl(215, 20%, 65%);
  --accent: hsl(197, 100%, 35%);
  --accent-foreground: hsl(210, 40%, 98%);
  --destructive: hsl(0, 62%, 30%);
  --destructive-foreground: hsl(210, 40%, 98%);
  --border: hsl(217, 32%, 17%);
  --input: hsl(217, 32%, 17%);
  --ring: hsl(42, 97%, 50%);
  --chart-1: hsl(42, 97%, 50%);
  --chart-2: hsl(197, 100%, 35%);
  --chart-3: hsl(213, 86%, 14%);
  --chart-4: hsl(215, 20%, 65%);
  --chart-5: hsl(217, 32%, 17%);
  --sidebar: hsl(222, 47%, 11%);
  --sidebar-foreground: hsl(210, 40%, 98%);
  --sidebar-primary: hsl(42, 97%, 50%);
  --sidebar-primary-foreground: hsl(213, 86%, 14%);
  --sidebar-accent: hsl(217, 32%, 17%);
  --sidebar-accent-foreground: hsl(210, 40%, 98%);
  --sidebar-border: hsl(217, 32%, 17%);
  --sidebar-ring: hsl(42, 97%, 50%);
  --success: hsl(142, 71%, 45%);
  --success-foreground: hsl(213, 86%, 14%);
  --warning: hsl(42, 97%, 50%);
  --warning-foreground: hsl(213, 86%, 14%);
}`;

// Find where @theme inline { starts
const themeInlineIndex = content.indexOf('@theme inline {');
if (themeInlineIndex !== -1) {
    content = correctTop + "\n\n" + content.substring(themeInlineIndex);
} else {
    // If somehow lost, just put it at the end
    const lastThemeIndex = content.lastIndexOf('}');
    content = correctTop + "\n\n" + content.substring(lastThemeIndex + 1);
}

fs.writeFileSync(cssPath, content);
