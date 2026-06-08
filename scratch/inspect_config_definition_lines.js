const fs = require('fs');

const filePath = 'c:\\Users\\seguc\\Downloads\\PROYECTO POS\\components\\pos\\vender.tsx';
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log('\n--- Printing around lines 630-660 ---');
  for (let i = 630; i <= 660; i++) {
    console.log(`${i}: ${lines[i-1]}`);
  }
} else {
  console.log('vender.tsx not found.');
}
