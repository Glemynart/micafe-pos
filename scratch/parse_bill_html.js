const fs = require('fs');

const filePath = 'C:\\Users\\seguc\\.gemini\\antigravity\\brain\\eb5bfbb0-1273-43db-a1b2-075e4866bbf9\\.system_generated\\steps\\4499\\content.md';
const content = fs.readFileSync(filePath, 'utf8');

const match = content.match(/data-page="([^"]+)"/);
if (match) {
  const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  try {
    const pageData = JSON.parse(decoded);
    console.log('=== DOCUMENT PROPS ===');
    console.log(JSON.stringify(pageData.props?.document, null, 2));
    console.log('=== DIGITAL RESOURCES PROPS ===');
    console.log(JSON.stringify(pageData.props?.digitalResources, null, 2));
  } catch (err) {
    console.error('Failed to parse JSON:', err.message);
  }
} else {
  console.log('Inertia data-page attribute not found in HTML.');
}
