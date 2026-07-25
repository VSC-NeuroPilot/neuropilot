import { CompanionRegistryError } from '@vsc-neuropilot/api-types';
import { CompanionMetaWithName } from './utility-types';

export const registry: Record<string, CompanionMetaWithName> = {};

const BANNED_NAMES = ['NeuroPilot', 'NeuroPilot Base', 'NeuroPilot (Base)'];

export function addToRegistry(data: CompanionMetaWithName, token: string) {
    if (BANNED_NAMES.includes(data.name) || Object.values(registry).some(meta => meta?.name === data.name)) {
        throw new CompanionRegistryError('Name is in use.', 'registering to the companion registry');
    }
    if (Object.keys(registry).includes(token)) {
        throw new CompanionRegistryError('Another companion is already using this UUID.', 'registering to the companion registry');
    }
    registry[token] = data;
};

export function removeFromRegistry(token: string) {
    delete registry[token];
}

export function findByName(name?: string) {
    if (name === undefined) return undefined;
    return Object.keys(registry).find(k => registry[k]?.name === name);
}

export function findByToken(token?: string) {
    if (!token) return;
    return registry[token];
}
