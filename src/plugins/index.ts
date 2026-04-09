import { CompanionMeta, RegistryError } from '@vsc-neuropilot/api-types';

export const registry: Record<string, CompanionMeta> = {};

const BANNED_NAMES = ['NeuroPilot', 'NeuroPilot Base', 'NeuroPilot (Base)'];

export function addToRegistry(data: CompanionMeta, token: string) {
    if (BANNED_NAMES.includes(data.name) || Object.values(registry).some(meta => meta?.name === data.name)) {
        throw new RegistryError('Name is in use.', 'registering to the companion registry');
    }
    if (Object.keys(registry).includes(token)) {
        throw new RegistryError('Another companion is already using this UUID.', 'registering to the companion registry');
    }
    registry[token] = data;
};

export function removeFromRegistry(token: string) {
    delete registry[token];
}

export function findByName(name?: string) {
    if (name === undefined) return 'NeuroPilot (Base)';
    return Object.keys(registry).find(k => registry[k]?.name === name);
}

export function findByToken(token?: string) {
    if (!token) return;
    return registry[token];
}
