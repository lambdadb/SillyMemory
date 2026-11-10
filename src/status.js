import { ConnectionError, sameAnalyzers } from './client.js';

// A story keeps the analyzers it was created with; report a changed setting without blocking.
export function analyzerNotice(actual, configured) {
    return sameAnalyzers(actual, configured) ? '' : `This story's memory is indexed with: ${actual.join(', ')}. Rebuild to apply the current setting: ${configured.join(', ')}.`;
}

export function progressText(value) {
    const count = `${value.completed} / ${value.total}`;
    switch (value.phase) {
        case 'preparing': return 'Getting older messages ready to save…';
        case 'queued': return 'Finishing an earlier memory save…';
        case 'committing': return 'Preparing the branch’s memory; finishing saves from the original chat…';
        case 'checking': return 'Checking this chat’s memory…';
        case 'deleting': return `Removing outdated memory: ${count} passages done.`;
        case 'uploading': return `Saving memory: ${count} passages done.`;
        case 'searching': return `Searching memory: ${count} searches done.`;
        case 'budgeting': return 'Choosing memory that fits the token budget…';
        default: return 'Working on memory…';
    }
}

export function failureText(error, { sync = true, generation = false } = {}) {
    const retry = generation ? 'regenerate to retry this request' : sync ? 'click Retry synchronization in the Memory panel' : 'retry this action';
    if (!(error instanceof ConnectionError)) return `Memory operation failed. Check browser storage${sync ? ' and token counting' : ''}, then ${retry}. Your local chat is kept.`;
    let next = '';
    if (error.status === 401) next = 'Replace your project key in Connection settings, then reconnect. Memory is off; an invalid key is not saved.';
    else if (error.status === 403 || error.status === 400) next = `Check connection settings and permissions, reconnect${sync ? ' and turn memory on' : ''}, then ${retry}.`;
    else if (error.code === 'timeout') next = `Wait, then ${retry}. A timed-out write may still have reached the service.`;
    else if (error.status === 429 || error.status >= 500) next = `Wait, then ${retry}.`;
    else if (error.code === 'network') next = `Check the connection, then ${retry}.`;
    else if (error.code === 'embedding') next = `Check the embedding endpoint in SillyMemory settings, then ${retry}.`;
    if (generation && (!next || error.status === 401)) next += `${next ? ' ' : ''}After recovery, ${retry}.`;
    return `${error.message}${next ? ` ${next}` : ''} Your local chat is kept.`;
}

// Per-operation display ownership is separate from prompt validity: a newer
// manual sync may replace the display without aborting an otherwise valid prompt.
export class OperationStatus {
    constructor(render) { this.render = render; this.revision = 0; }
    show(text, { error = false } = {}) {
        this.revision++; this.progress = null; this.error = error;
        this.render(text, null);
    }
    start(valid = () => true) {
        const revision = ++this.revision;
        let last;
        const current = () => revision === this.revision && valid();
        return {
            current,
            update: value => {
                if (!current()) return;
                last = { ...value };
                this.progress = last; this.error = false;
                this.render(progressText(last), last);
            },
            finish: text => { if (current()) this.show(text); },
            fail: (error, prefix = '', generation = false) => { if (current()) this.show(`${prefix}${last ? `${progressText(last)} ` : ''}${failureText(error, { generation })}`, { error: true }); },
        };
    }
}

// Private memory can be turned on only after Test endpoint succeeded for the saved
// settings; turning it off is always allowed. Returns why the switch is unavailable.
export function privateMemoryLock(enabled, tested) {
    return enabled || tested ? '' : 'Test endpoint first: Private memory needs a tested embedding endpoint.';
}

// A memory mode or embedding mismatch offers only Rebuild story memory (and turning
// memory off): retrying synchronization or the reply cannot succeed before a rebuild.
export function recoveryActions({ mismatch = false, notice = '', sync = false, retry = false }) {
    return { rebuild: Boolean(mismatch || notice), sync: Boolean(sync && !mismatch), retry: Boolean(retry && !mismatch) };
}
