import { connectionConfig } from './client.js';

// A persisted generation prevents old native ON flags from reviving after reset.
export function activationBinding(state) {
    const { endpoint, project } = connectionConfig(state);
    return { generation: state.activationGeneration, endpoint, project };
}

export function chatActivated(metadata, state) {
    if (metadata?.sillymemoryEnabled !== true || !/^[a-f0-9]{32}$/.test(state?.activationGeneration || '')) return false;
    try {
        const expected = activationBinding(state), actual = metadata.sillymemoryActivation;
        return actual?.generation === expected.generation && actual.endpoint === expected.endpoint && actual.project === expected.project;
    } catch { return false; }
}
