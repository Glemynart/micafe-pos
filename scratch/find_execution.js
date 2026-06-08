const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\logs\\transcript.jsonl';

if (!fs.existsSync(logPath)) {
  console.log('Transcript file does not exist at:', logPath);
  process.exit(1);
}

const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log('Searching for auto_habilitacion.js in steps...');
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    const contentStr = obj.content || '';
    const toolCallsStr = JSON.stringify(obj.tool_calls || {});
    if (contentStr.includes('auto_habilitacion') || toolCallsStr.includes('auto_habilitacion')) {
      console.log(`\n--- Step ${obj.step_index} (Source: ${obj.source}, Type: ${obj.type}) ---`);
      if (obj.content) console.log('Content snippet:', obj.content.slice(0, 1500));
    }
  } catch (e) {
    // Ignore
  }
}
