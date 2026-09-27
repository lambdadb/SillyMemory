import { ConnectionError } from './client.js';

export function progressText(value) {
    const count = `${value.completed} / ${value.total}`;
    switch (value.phase) {
        case 'preparing': return 'Preparing older messages for synchronization…';
        case 'queued': return 'Waiting for an earlier memory write to finish…';
        case 'checking': return 'Checking memory collection ownership…';
        case 'deleting': return `Removing outdated memory: ${count} chunks confirmed.`;
        case 'uploading': return `Uploading memory: ${count} chunks confirmed.`;
        case 'searching': return `Searching memory: ${count} queries completed.`;
        case 'budgeting': return 'Selecting current passages within the token budget…';
        default: return 'Working on memory…';
    }
}

export function failureText(error, { sync = true } = {}) {
    const retry = sync ? 'click Sync this chat' : 'retry this action';
    if (!(error instanceof ConnectionError)) return `Memory operation failed. Check browser storage${sync ? ' and token counting' : ''}, then ${retry}. Original prompt retained.`;
    let next = '';
    if (error.status === 401) next = `Enter your project key and click Use key for this session. ${sync ? 'Make sure memory is enabled, then click Sync this chat.' : 'Then retry this action.'}`;
    else if (error.status === 403 || error.status === 400) next = `Check connection settings and permissions, reconnect${sync ? ' and enable memory' : ''}, then ${retry}.`;
    else if (error.code === 'timeout') next = `Wait, then ${retry}. A timed-out write may still have reached the service.`;
    else if (error.status === 429 || error.status >= 500) next = `Wait, then ${retry}.`;
    else if (error.code === 'network') next = `Check the connection, then ${retry}.`;
    return `${error.message}${next ? ` ${next}` : ''} Original prompt retained.`;
}

// Per-operation display ownership is separate from prompt validity: a newer
// manual sync may replace the display without aborting an otherwise valid prompt.
export class OperationStatus {
    constructor(render) { this.render = render; this.revision = 0; }
    show(text) { this.revision++; this.render(text, null); }
    start(valid = () => true) {
        const revision = ++this.revision;
        let last;
        const current = () => revision === this.revision && valid();
        return {
            current,
            update: value => {
                if (!current()) return;
                last = { ...value };
                this.render(progressText(last), last);
            },
            finish: text => { if (current()) this.show(text); },
            fail: error => { if (current()) this.show(`${last ? `${progressText(last)} ` : ''}${failureText(error)}`); },
        };
    }
}
