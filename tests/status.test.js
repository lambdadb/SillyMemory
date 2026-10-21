import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationStatus, failureText } from '../src/status.js';
import { ConnectionError } from '../src/client.js';

test('newer sync, terminal states and source invalidation reject stale progress and errors', () => {
    const rendered = [], view = new OperationStatus((...args) => rendered.push(args));
    const old = view.start(); old.update({ phase: 'uploading', completed: 0, total: 120 });
    let valid = true; const current = view.start(() => valid);
    current.update({ phase: 'searching', completed: 0, total: 2 });
    const count = rendered.length;
    old.update({ phase: 'uploading', completed: 120, total: 120 }); old.fail(new Error('old failure')); old.finish('old done');
    assert.equal(rendered.length, count);
    assert.deepEqual(view.progress, { phase: 'searching', completed: 0, total: 2 });
    assert.equal(view.error, false);
    valid = false; current.update({ phase: 'searching', completed: 2, total: 2 }); current.finish('stale done');
    assert.equal(rendered.length, count);
    view.show('Memory disabled.'); assert.deepEqual(rendered.at(-1), ['Memory disabled.', null]);
    current.fail(new Error('late failure')); assert.equal(rendered.at(-1)[0], 'Memory disabled.');
    const fresh = view.start(); fresh.finish('Current chat synchronized.'); fresh.update({ phase: 'uploading', completed: 0, total: 4 });
    assert.deepEqual(rendered.at(-1), ['Current chat synchronized.', null]);
});

test('partial failure retains the last confirmed count, hides progress and gives recovery guidance', () => {
    const rendered = [], view = new OperationStatus((...args) => rendered.push(args));
    const operation = view.start();
    operation.update({ phase: 'uploading', completed: 50, total: 120 });
    operation.fail(new ConnectionError('Memory request timed out.', 0, 'timeout'));
    assert.match(rendered.at(-1)[0], /50 \/ 120.*timed out.*Sync this chat.*may still have reached/);
    assert.equal(rendered.at(-1)[1], null);
    assert.equal(view.progress, null);
    assert.equal(view.error, true);
    operation.update({ phase: 'uploading', completed: 100, total: 120 });
    assert.match(rendered.at(-1)[0], /50 \/ 120/);
    assert.equal(view.progress, null);
    view.start().finish('Current chat synchronized.');
    assert.equal(view.error, false);
});

test('failure guidance separates reconnect, rate limiting, network and unknown errors', () => {
    assert.match(failureText(new ConnectionError('Authentication failed.', 401)), /Save and connect/);
    assert.match(failureText(new ConnectionError('Authentication failed.', 401)), /[Mm]emory is disabled/);
    const setupFailure = failureText(new ConnectionError('Authentication failed.', 401), { sync: false });
    assert.match(setupFailure, /Save and connect/); assert(!setupFailure.includes('Sync this chat'));
    assert.match(failureText(new ConnectionError('Rate limited.', 429)), /Wait.*Sync this chat/);
    assert.match(failureText(new ConnectionError('Memory service returned HTTP 503.', 503)), /HTTP 503.*Wait/);
    assert.match(failureText(new ConnectionError('Network failed.', 0, 'network')), /Check the connection/);
    assert(!failureText(new Error('private chat and key')).includes('private'));
});

test('commit readiness progress preserves ownership of the synchronization completion', () => {
    const rendered = [], view = new OperationStatus(text => rendered.push(text));
    const operation = view.start(); operation.update({ phase: 'committing' });
    assert.match(rendered.at(-1), /waiting for inherited writes to commit/);
    assert(operation.current()); operation.finish('Current chat synchronized.');
    assert.equal(rendered.at(-1), 'Current chat synchronized.');
});

test('generation failure prefix distinguishes stopped generation from background sync', () => {
    const rendered = [], view = new OperationStatus(text => rendered.push(text));
    view.start().fail(new ConnectionError('Unavailable.', 503), 'Generation stopped. ', true);
    assert.match(rendered.at(-1), /^Generation stopped\./);
    assert.match(rendered.at(-1), /Wait, then regenerate to retry this request/);
    assert(!rendered.at(-1).includes('Sync this chat'));

    assert.match(rendered.at(-1), /Local chat preserved/);
    view.start().fail(new ConnectionError('Unavailable.', 503));
    assert(!rendered.at(-1).includes('Generation stopped'));
    assert.match(rendered.at(-1), /Local chat preserved/);
});

test('generation recovery targets the pending input across failure categories', () => {
    const failures = [new ConnectionError('Authentication failed.', 401),
        new ConnectionError('Permission denied.', 403), new ConnectionError('Rate limited.', 429),
        new ConnectionError('Unavailable.', 503), new ConnectionError('Timed out.', 0, 'timeout'),
        new ConnectionError('Network failed.', 0, 'network'), new ConnectionError('Query too large.', 0, 'query-limit'),
        new Error('private key and chat')];
    for (const error of failures) {
        const text = failureText(error, { generation: true });
        assert.match(text, /regenerate to retry this request/);
        assert(!text.includes('Sync this chat'));
        assert(!text.includes('private'));
    }
    assert.match(failureText(failures[0], { generation: true }), /Save and connect.*Memory is disabled/);
    assert.match(failureText(failures[4], { generation: true }), /timed-out write may still have reached/);
    assert.match(failureText(failures[3]), /Wait, then click Sync this chat/);
});
