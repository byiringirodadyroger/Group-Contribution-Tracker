const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (file.endsWith('.js')) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
  }
}

visit(path.join(__dirname, '..', 'src'));
visit(path.join(__dirname, '..', 'tests'));
console.log('JavaScript syntax is valid.');
