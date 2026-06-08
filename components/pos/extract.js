const fs = require('fs');

const logPath = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\52976e21-0d8f-480c-af1f-a488fd028518\\.system_generated\\logs\\transcript.jsonl';
const targetFiles = ['clientes-module.tsx', 'inventory-module.tsx', 'recipes-module.tsx', 'global-close-shift.tsx', 'globals.css'];
const contents = {};

const lines = fs.readFileSync(logPath, 'utf-8').split('\n');

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const entry = JSON.parse(line);
        if (entry.type === 'TOOL_RESPONSE') {
            const responses = entry.tool_responses || [];
            for (const tr of responses) {
                if (tr.name === 'default_api:view_file') {
                    const content = tr.content || '';
                    for (const tf of targetFiles) {
                        if (content.includes(tf) && content.includes('The following code has been modified to include a line number')) {
                            // Extract original code
                            const fileLines = content.split('\n');
                            const originalCode = [];
                            let inCode = false;
                            for (const l of fileLines) {
                                if (l.startsWith('1: ')) {
                                    inCode = true;
                                }
                                if (inCode) {
                                    const match = l.match(/^(\d+):\s(.*)$/);
                                    if (match) {
                                        originalCode.push(match[2]);
                                    } else if (!l.includes('The above content shows the entire')) {
                                        originalCode.push(l);
                                    } else {
                                        inCode = false;
                                    }
                                }
                            }
                            if (!contents[tf]) {
                                contents[tf] = originalCode.join('\n');
                                console.log(`Extracted original ${tf}`);
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        // ignore JSON parse errors
    }
}

for (const tf of targetFiles) {
    if (contents[tf]) {
        let name = tf;
        if (tf === 'globals.css') {
            name = '../../app/globals.css';
        }
        fs.writeFileSync(name, contents[tf]);
        console.log(`Saved ${tf}`);
    } else {
        console.log(`Could not find ${tf}`);
    }
}
