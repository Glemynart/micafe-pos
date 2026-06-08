const fs = require('fs');
const path = require('path');

const files = [
    'clientes-module.tsx',
    'inventory-module.tsx',
    'recipes-module.tsx',
    'global-close-shift.tsx'
];

for (const file of files) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        // Add theme-pos to DialogContent if missing
        content = content.replace(/<DialogContent className="([^"]*)"/g, (match, classes) => {
            let newClasses = classes;
            if (!newClasses.includes('theme-pos')) {
                newClasses = `theme-pos ${newClasses}`;
            }
            return `<DialogContent className="${newClasses}"`;
        });

        // Add theme-pos to AlertDialogContent if missing
        content = content.replace(/<AlertDialogContent className="([^"]*)"/g, (match, classes) => {
            let newClasses = classes;
            if (!newClasses.includes('theme-pos')) {
                newClasses = `theme-pos ${newClasses}`;
            }
            return `<AlertDialogContent className="${newClasses}"`;
        });

        // Remove more premium classes that might have been left over
        const classesToRemove = [
            /bg-gradient-to-r/g,
            /from-primary\/10/g,
            /from-primary\/20/g,
            /via-background/g,
            /to-background/g,
            /bg-muted\/20/g,
            /shadow-primary\/20/g,
            /active:scale-95/g,
            /rounded-2xl/g,
            /rounded-xl/g,
            /sm:rounded-2xl/g
        ];

        for (const regex of classesToRemove) {
            content = content.replace(regex, '');
        }

        // Clean up double spaces
        content = content.replace(/className=" +/g, 'className="');
        content = content.replace(/  +/g, ' ');

        fs.writeFileSync(fullPath, content);
        console.log("Fixed " + file);
    }
}
