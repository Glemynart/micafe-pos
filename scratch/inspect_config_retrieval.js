const fs = require('fs');

const filePath = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS\\components\\pos\\vender.tsx';
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log('\n--- Printing around line 330-420 ---');
  for (let i = 330; i <= 420; i++) {
    console.log(`${i}: ${lines[i-1]}`);
  }
} else {
  console.log('vender.tsx not found.');
}
