const fs = require('fs');

const files = [
    'clientes-module.tsx',
    'inventory-module.tsx',
    'recipes-module.tsx',
    'global-close-shift.tsx'
];

for (const file of files) {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        
        // Remove the glassmorphism and gradient classes we added
        const classesToRemove = [
            /bg-gradient-to-br/g,
            /from-white\/5/g,
            /to-transparent/g,
            /border-white\/10/g,
            /border-white\/20/g,
            /backdrop-blur-md/g,
            /backdrop-blur-xl/g,
            /bg-card\/40/g,
            /bg-card\/50/g,
            /bg-card\/60/g,
            /bg-card\/80/g,
            /shadow-2xl/g,
            /shadow-xl/g,
            /text-amber-500/g,
            /text-amber-400/g,
            /bg-amber-500\/10/g,
            /bg-amber-500\/20/g,
            /border-amber-500\/20/g,
            /border-amber-500\/50/g,
            /from-amber-500\/20/g,
            /via-transparent/g,
            /bg-black\/40/g,
            /text-white/g,
            /text-white\/70/g,
            /text-white\/50/g,
            /text-zinc-400/g,
            /text-zinc-500/g,
            /hover:bg-white\/5/g,
            /hover:bg-white\/10/g,
            /hover:bg-amber-500\/20/g,
            /data-\[state=active\]:bg-amber-500/g,
            /data-\[state=active\]:text-white/g
        ];

        for (const regex of classesToRemove) {
            content = content.replace(regex, '');
        }

        // Fix double spaces inside classNames
        content = content.replace(/className=" +/g, 'className="');
        content = content.replace(/  +/g, ' ');

        fs.writeFileSync(file, content);
        console.log('Restored ' + file);
    }
}
