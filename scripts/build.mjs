import { mkdir, copyFile } from 'node:fs/promises';
const files = ['index.html', 'icon.svg', 'src/app.js', 'src/model.js', 'src/style.css'];
for (const file of files) {
  await mkdir(`dist/${file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''}`, { recursive: true });
  await copyFile(file, `dist/${file}`);
}
console.log('Built static site in dist/');
