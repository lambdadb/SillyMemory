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
    operation.update({ phase: 'uploading', completed: 100, total: 120 });
    assert.match(rendered.at(-1)[0], /50 \/ 120/);
});

test('failure guidance separates reconnect, rate limiting, network and unknown errors', () => {
    assert.match(failureText(new ConnectionError('Authentication failed.', 401)), /Use key for this session/);
    assert.match(failureText(new ConnectionError('Authentication failed.', 401)), /memory is enabled/);
    const setupFailure = failureText(new ConnectionError('Authentication failed.', 401), { sync: false });
    assert.match(setupFailure, /retry this action/); assert(!setupFailure.includes('Sync this chat'));
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
