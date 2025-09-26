/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';

const pkgPath = path.resolve(process.cwd(), 'package.json');

if (!fs.existsSync(pkgPath)) {
    console.error(`package.json not found at ${pkgPath}`);
    process.exit(1);
}

const raw = fs.readFileSync(pkgPath, 'utf8');
let pkg: any;
try {
    pkg = JSON.parse(raw);
} catch (erm) {
    console.error('Failed to parse package.json:', erm);
    process.exit(1);
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const bakName = `package.json.bak.${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
fs.writeFileSync(path.join(path.dirname(pkgPath), bakName), raw, 'utf8');
console.log(`Backup written to ${bakName}`);

function localeSort(a: any, b: any) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

const targetSetting = 'neuropilot.disabledActions';
let found = false;

function trySortEnumOnProps(props: Record<string, any>): boolean {
    console.log('hi 1');
    if (!props || typeof props !== 'object') return false;
    const prop = props[targetSetting];
    console.log('hi 2');
    if (!prop) return false;
    // We expect the enum to live under prop.items.enum
    if (prop.items && Array.isArray(prop.items.enum)) {
        const original = prop.items.enum.slice();
        const sorted = original.slice().sort(localeSort);
        const arraysEqual = (a: any[], b: any[]) =>
            a.length === b.length && a.every((v, i) => v === b[i]);
        if (!arraysEqual(original, sorted)) {
            prop.items.enum = sorted;
            console.log(`Sorted enum for ${targetSetting}`);
            return true;
        } else {
            console.log(`Enum for ${targetSetting} already sorted`);
            return false;
        }
    }
    return false;
}

// 1) Search in contributes.configuration.properties
if (pkg.contributes && pkg.contributes.configuration && pkg.contributes.configuration.properties) {
    found = trySortEnumOnProps(pkg.contributes.configuration.properties) || found;
}

found = trySortEnumOnProps(pkg.contributes.configuration[0].properties) || found;

if (!found) {
    console.warn(`Did not find an items.enum array for setting '${targetSetting}'. Nothing changed.`);
    process.exit(0);
}

// Write back
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('package.json updated.');
