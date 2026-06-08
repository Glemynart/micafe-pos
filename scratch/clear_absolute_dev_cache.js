const fs = require('fs');
const path = require('path');

const target = 'C:\\Users\\seguc\\Downloads\\PROYECTO POS\\out\\dev\\cache';
console.log(`Checking for target directory: ${target}`);

try {
  if (fs.existsSync(target)) {
    console.log('Found! Deleting target...');
    fs.rmSync(target, { recursive: true, force: true });
    console.log('✅ Deleted successfully.');
  } else {
    console.log('Target not found directly.');
    // Let's search inside 'out'
    const outPath = 'C:\\Users\\seguc\\Downloads\\PROYECTO POS\\out';
    if (fs.existsSync(outPath)) {
      console.log('Inspecting out directory contents...');
      const list = (p) => {
        const files = fs.readdirSync(p);
        for (const file of files) {
          const full = path.join(p, file);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            console.log(`Directory: ${full}`);
            if (file === 'cache') {
              console.log(`Found cache directory at: ${full}, deleting...`);
              fs.rmSync(full, { recursive: true, force: true });
              console.log('✅ Deleted.');
            } else {
              list(full);
            }
          }
        }
      };
      list(outPath);
    } else {
      console.log('out folder does not exist.');
    }
  }
} catch (err) {
  console.error('Error:', err.message);
}
