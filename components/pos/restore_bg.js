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
        
        // Add bg-card back to Card and DialogContent if missing
        content = content.replace(/<Card className="([^"]*)"/g, (match, classes) => {
            if (!classes.includes('bg-card') && !classes.includes('bg-')) {
                return `<Card className="bg-card ${classes}"`;
            }
            return match;
        });

        content = content.replace(/<CardContent className="([^"]*)"/g, (match, classes) => {
             // CardContent usually doesn't need bg-card but let's be safe
             return match;
        });

        content = content.replace(/<DialogContent className="([^"]*)"/g, (match, classes) => {
            if (!classes.includes('bg-card') && !classes.includes('bg-')) {
                return `<DialogContent className="bg-card ${classes}"`;
            }
            return match;
        });

        fs.writeFileSync(file, content);
    }
}
