import test from 'node:test';
import assert from 'node:assert/strict';

test('runtime excludes arbitrarily long preceding replies from current-message search', async () => {
    const { retrievalQueries } = await import('../src/memory.js');
    const messages = [{ user: false, text: 'Context '.repeat(10000) }, { user: true, text: 'Where is the compass?' }];
    assert.deepEqual(retrievalQueries({ messages }), ['User: Where is the compass?']);
});

test('file, media and tool turns cannot become the current query anchor', async () => {
    const { capture, retrievalQueries } = await import('../src/memory.js');
    for (const extra of [{file:{name:'synthetic.txt'}}, {media:[{url:'synthetic'}]}, {tool_invocations:[{name:'synthetic'}]}]) {
        const snapshot = capture({chat:[{mes:'Plain question',is_user:true},{mes:'Special reply',is_user:false,extra}],characterId:0,characters:[{avatar:'test.png'}],getCurrentChatId:()=> 'test'});
        for (const type of ['normal','swipe','regenerate','continue']) assert.deepEqual(retrievalQueries(snapshot,type), ['User: Plain question']);
    }
});
