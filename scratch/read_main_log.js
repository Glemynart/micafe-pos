const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\logs\\main.log';
if (fs.existsSync(logPath)) {
  console.log(`=== READING ${logPath} ===`);
  const lines = fs.readFileSync(logPath, 'utf8').split('\n');
  console.log(`Total lines: ${lines.length}`);
  // Let's print the last 80 lines
  console.log(lines.slice(-80).join('\n'));
} else {
  console.log(`Log file not found at: ${logPath}`);
  // Let's check other log files in that folder
  const logDir = 'C:\\Users\\seguc\\AppData\\Roaming\\pos-tienda-barrio\\logs';
  if (fs.existsSync(logDir)) {
    console.log(`Contents of log directory ${logDir}:`, fs.readdirSync(logDir));
  } else {
    console.log(`Log directory not found: ${logDir}`);
  }
}
