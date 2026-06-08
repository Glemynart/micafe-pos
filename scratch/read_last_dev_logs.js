const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\tasks\\task-4911.log';
if (fs.existsSync(logPath)) {
  console.log(`=== LAST 150 LINES OF ${logPath} ===`);
  const lines = fs.readFileSync(logPath, 'utf8').split('\n');
  console.log(lines.slice(-150).join('\n'));
} else {
  console.log('Log file not found at:', logPath);
}
