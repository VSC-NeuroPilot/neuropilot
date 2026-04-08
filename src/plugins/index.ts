import { RegistryError } from '@vsc-neuropilot/api-types';

export const registry: Record<string, string | undefined> = {};

const BANNED_NAMES = ['NeuroPilot', 'NeuroPilot Base', 'NeuroPilot (Base)'];

export function addToRegistry(name: string, token: string) {
    if (BANNED_NAMES.includes(name) || Object.values(registry).includes(name)) {
        throw new RegistryError('Name is in use.', 'registering to the companion registry');
    }
    if (Object.keys(registry).includes(token)) {
        throw new RegistryError('Another companion is already using this UUID.', 'registering to the companion registry');
    }
    registry[token] = name;
};

export function removeFromRegistry(token: string) {
    registry[token] = undefined;
}

export function findByName(name?: string) {
    if (name === undefined) return 'NeuroPilot (Base)';
    return Object.keys(registry).find(k => registry[k] === name);
}

export function findByToken(token?: string) {
    if (!token) return;
    return registry[token];
}
