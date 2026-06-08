const fs = require('fs');
const content = fs.readFileSync('C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\tasks\\task-3593.log', 'utf8');
const match = content.match(/\[Factus\] HTTP 201 \/v2\/credit-notes\/validate: (\{.*\})/);
if (match) {
  const data = JSON.parse(match[1]);
  console.log(JSON.stringify(data.data.links || data.links || data, null, 2));
} else {
  console.log('No match found');
}
