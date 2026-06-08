const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\logs';
const transcriptPath = path.join(logsDir, 'transcript.jsonl');

if (!fs.existsSync(transcriptPath)) {
  console.log('No se encontro transcript.jsonl');
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
console.log(`Total lineas: ${lines.length}`);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  try {
    const obj = JSON.parse(line);
    const content = JSON.stringify(obj.content || '');
    const toolCalls = JSON.stringify(obj.tool_calls || '');
    if (content.includes('productName') || content.includes('MiTienda') || toolCalls.includes('productName')) {
      console.log(`--- [Paso ${obj.step_index}] ---`);
      console.log(`Type: ${obj.type}, Status: ${obj.status}`);
      if (obj.content) console.log(`Content: ${obj.content.substring(0, 300)}...`);
      if (obj.tool_calls) console.log(`Tool Calls: ${JSON.stringify(obj.tool_calls).substring(0, 300)}...`);
    }
  } catch (e) {
    // Ignore parse errors
  }
}
