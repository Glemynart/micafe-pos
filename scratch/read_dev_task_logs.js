const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\tasks\\task-4911.log';
if (fs.existsSync(logPath)) {
  console.log(`=== SEARCHING IN ${logPath} ===`);
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  let found = false;
  
  lines.forEach((line, idx) => {
    if (line.includes('[Factus]') || line.includes('emitir') || line.includes('validation') || line.includes('DIAN:') || line.includes('validation_errors') || line.includes('errors')) {
      console.log(`Line ${idx+1}: ${line.trim()}`);
      found = true;
    }
  });
  
  if (!found) {
    console.log('No direct Factus log lines found. Printing the last 150 lines of the log instead:');
    console.log(lines.slice(-150).join('\n'));
  }
} else {
  console.log('Log file not found at:', logPath);
}
