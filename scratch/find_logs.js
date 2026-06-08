const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\logs\\transcript.jsonl';

if (!fs.existsSync(logPath)) {
  console.log('Transcript file does not exist at:', logPath);
  process.exit(1);
}

console.log('Reading transcript.jsonl...');
const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

console.log('Searching for auto_habilitacion...');
let count = 0;
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    const contentStr = obj.content || '';
    const toolCalls = JSON.stringify(obj.tool_calls || {});
    
    // Check if auto_habilitacion is mentioned
    if (contentStr.includes('auto_habilitacion.js') || toolCalls.includes('auto_habilitacion.js')) {
      console.log(`\n--- Step ${obj.step_index || 'Unknown'} (Source: ${obj.source}, Type: ${obj.type}) ---`);
      if (obj.content) console.log('Content snippet:', obj.content.slice(0, 1000));
      if (obj.tool_calls) console.log('Tool calls:', JSON.stringify(obj.tool_calls, null, 2).slice(0, 1000));
      count++;
      if (count > 20) {
        console.log('Too many matches, stopping search.');
        break;
      }
    }
  } catch (e) {
    // Ignore invalid JSON lines
  }
}
