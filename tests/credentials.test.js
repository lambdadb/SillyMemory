import test from 'node:test';
import assert from 'node:assert/strict';
import { SavedKey } from '../src/credentials.js';
const owner = 'a'.repeat(32), config = { endpoint: 'https://region.example.test', project: 'synthetic' };
const memory = () => {
    const data = new Map();
    return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
test('saved keys survive a new instance but stay scoped to account, endpoint and project', () => {
    const storage = memory(), saved = new SavedKey(storage, owner);
    saved.save(config, ' synthetic-key ');
    assert.equal(new SavedKey(storage, owner).read({ ...config, endpoint: config.endpoint + '/' }), 'synthetic-key');
    for (const [account, target] of [['b'.repeat(32), config], [owner, { ...config, endpoint: 'https://other.example.test' }], [owner, { ...config, project: 'other' }]]) {
        assert.equal(new SavedKey(storage, account).read(target), null);
    }
    assert.equal(storage.data.size, 1);
    assert.ok([...storage.data.keys()].every(key => key.startsWith('sillymemory:credential:') && !key.includes('synthetic-key')));
});
test('replacing a connection retains only its current key and forgetting cannot affect another account', () => {
    const storage = memory(), saved = new SavedKey(storage, owner), other = { ...config, project: 'other' };
    saved.save(config, 'first'); saved.save(other, 'second'); new SavedKey(storage, 'b'.repeat(32)).save(config, 'third');
    assert.equal(saved.read(config), null); assert.equal(saved.read(other), 'second');
    assert.ok(!JSON.stringify([...storage.data.values()]).includes('first'));
    saved.forget(); saved.forget(); assert.equal(saved.read(other), null);
    assert.equal(new SavedKey(storage, 'b'.repeat(32)).read(config), 'third');
});
test('malformed saved records cannot be used as credentials or leaked in errors', () => {
    const storage = memory(), saved = new SavedKey(storage, owner);
    for (const raw of ['private-corrupt-record', '{', 'null', '{"version":2,"key":"private-key"}', '{"version":1,"key":123}', '{"version":1,"key":" "}']) {
        storage.setItem(saved.id(config), raw);
        assert.throws(() => saved.read(config), error => error.code === 'credential-storage' && !error.message.includes(raw) && !error.message.includes('private'));
    }
    saved.forget(config); assert.equal(saved.read(config), null);
});
test('blocked browser storage reports a safe actionable failure instead of claiming save or removal', () => {
    const storage = Object.fromEntries(['getItem', 'setItem', 'removeItem'].map(name => [name, () => { throw new Error('private-key echoed by storage'); }]));
    const saved = new SavedKey(storage, owner);
    for (const operation of [() => saved.read(config), () => saved.save(config, 'private-key'), () => saved.forget(config)]) {
        assert.throws(operation, error => error.code === 'credential-storage' && !error.message.includes('private-key'));
    }
});
test('invalid account identities and empty keys never enter storage', () => {
    const storage = memory(); assert.throws(() => new SavedKey(storage, 'invalid'), /account identity/);
    const saved = new SavedKey(storage, owner);
    for (const key of ['', ' ', null]) assert.throws(() => saved.save(config, key), /Enter your project/);
    assert.equal(storage.data.size, 0);
});

test('rejected restoration removes only the exact scoped key and preserves a newer saved value', () => {
    const storage = memory(), saved = new SavedKey(storage, owner);
    saved.save(config, 'previous');
    assert.equal(saved.forgetMatching({ ...config, project: 'other' }, 'previous'), false);
    assert.equal(saved.forgetMatching(config, 'rejected-candidate'), false);
    assert.equal(saved.read(config), 'previous');
    saved.save(config, 'newer'); assert.equal(saved.forgetMatching(config, 'previous'), false);
    assert.equal(saved.read(config), 'newer'); assert.equal(saved.forgetMatching(config, 'newer'), true);
    assert.equal(saved.read(config), null);
});

test('a failed settings or credential write preserves the exact previous connection bytes', () => {
    for (const failCredential of [false, true]) {
        const storage = memory(), saved = new SavedKey(storage, owner), stateId = `sillymemory:state:${owner}`;
        const oldState = JSON.stringify({ ...config, ready: true, enabled: true });
        storage.setItem(stateId, oldState); saved.save(config, 'previous');
        const oldCredential = storage.getItem(saved.id()), original = storage.setItem;
        let failed = false;
        storage.setItem = (id, value) => {
            if (!failed && id === (failCredential ? saved.id() : stateId)) { failed = true; throw new Error('quota contains private-new-key'); }
            return original(id, value);
        };
        assert.throws(() => saved.commit({ ...config, project: 'other' }, 'private-new-key', { endpoint: config.endpoint, project: 'other', ready: false, enabled: false }), error => error.code === 'credential-storage' && !error.message.includes('private-new-key'));
        assert.equal(storage.getItem(stateId), oldState); assert.equal(storage.getItem(saved.id()), oldCredential);
        assert.equal(saved.read(config), 'previous');
    }
});
test('failed first credential save removes draft settings, while a successful commit stores coherent records', () => {
    const storage = memory(), saved = new SavedKey(storage, owner), original = storage.setItem;
    storage.setItem = (id, value) => { if (id === saved.id()) throw new Error('quota'); return original(id, value); };
    assert.throws(() => saved.commit(config, 'new', { ...config, ready: false, enabled: false }), /Previous saved connection preserved/);
    assert.equal(storage.data.size, 0);
    storage.setItem = original;
    saved.commit(config, 'new', { ...config, ready: false, enabled: false });
    assert.equal(saved.read(config), 'new');
    assert.deepEqual(JSON.parse(storage.getItem(`sillymemory:state:${owner}`)), { ...config, ready: false, enabled: false });
});
test('unavailable rollback is reported without overwriting the previous credential', () => {
    const storage = memory(), saved = new SavedKey(storage, owner), original = storage.setItem;
    const stateId = `sillymemory:state:${owner}`; storage.setItem(stateId, JSON.stringify(config)); saved.save(config, 'previous');
    let wroteState = false;
    storage.setItem = (id, value) => {
        if (id === saved.id() || wroteState) throw new Error('private storage failure');
        wroteState = true; return original(id, value);
    };
    assert.throws(() => saved.commit({ ...config, project: 'other' }, 'new', { ...config, project: 'other' }), error => error.code === 'credential-storage' && error.message.includes('rollback could not finish') && !error.message.includes('private'));
    assert.equal(saved.read(config), 'previous');
});
