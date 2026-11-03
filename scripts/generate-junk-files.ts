import fs from 'node:fs';
import path from 'node:path';

const FILE_COUNT = 308;

const writePathFolder = path.resolve(process.cwd(), 'playground', 'paginate');
const countDigits = String(FILE_COUNT).length;

fs.mkdirSync(writePathFolder, { recursive: true });

let count = 0;

while (count < FILE_COUNT) {
    count += 1;
    const paddedCount = String(count).padStart(countDigits, '0');
    fs.writeFileSync(path.resolve(writePathFolder, `file-${paddedCount}.txt`), '');
}
