import test from 'node:test';
import assert from 'node:assert/strict';
import { promptRegex, USER_INPUT, AI_OUTPUT } from '../src/prompt-regex.js';

// Mirrors the host's regexFromString for "/pattern/flags" strings.
const compile = value => { const m = /^\/(.+)\/([a-z]*)$/i.exec(value); try { return m ? new RegExp(m[1], m[2]) : new RegExp(value); } catch { return null; } };
const script = fields => ({ findRegex: '/<Blocks>[\\s\\S]*?<\\/Blocks>/g', replaceString: '', trimStrings: [], placement: [AI_OUTPUT], promptOnly: true, disabled: false, substituteRegex: 0, minDepth: null, maxDepth: null, ...fields });
const reply = 'Story.<Blocks>tracker</Blocks>';

test('applies enabled prompt-only scripts by placement', () => {
    assert.equal(promptRegex([script()], compile)(reply, false, 3), 'Story.');
    assert.equal(promptRegex([script()], compile)(reply, true, 3), reply);
    assert.equal(promptRegex([script({ placement: [USER_INPUT] })], compile)(reply, true, 3), 'Story.');
    for (const fields of [{ promptOnly: false }, { disabled: true }, { findRegex: '' }, { findRegex: '/(/' }]) {
        assert.equal(promptRegex([script(fields)], compile)(reply, false, 3), reply);
    }
});

test('follows the host depth bounds', () => {
    const apply = (fields, depth) => promptRegex([script(fields)], compile)(reply, false, depth);
    assert.equal(apply({ minDepth: 4 }, 3), reply);
    assert.equal(apply({ minDepth: 4 }, 4), 'Story.');
    assert.equal(apply({ maxDepth: 5 }, 6), reply);
    assert.equal(apply({ maxDepth: 5 }, 5), 'Story.');
    assert.equal(apply({ minDepth: -1, maxDepth: -1 }, 0), 'Story.');
});

test('replaces groups like the host without running macros', () => {
    const apply = (fields, text) => promptRegex([script(fields)], compile)(text, false, 0);
    assert.equal(apply({ findRegex: '/<b>(?<inner>.*?)<\\/b>/g', replaceString: '[$1|$<inner>|{{match}}|$2]', trimStrings: ['x'] }, '<b>axb</b>'), '[ab|ab|<b>ab</b>|]');
    // Matched chat text keeps its macros literal; native generation runs them, memory capture must not.
    assert.equal(apply({ findRegex: '/<b>(.*?)<\\/b>/g', replaceString: '$1' }, '<b>{{setvar::x::1}}</b>'), '{{setvar::x::1}}');
    // Scripts whose own strings use macros could have side effects or vary per capture.
    for (const fields of [{ replaceString: '{{incvar::count}}' }, { replaceString: '{{time}}' }, { trimStrings: ['{{char}}'] }, { substituteRegex: 1 }]) {
        assert.equal(apply(fields, reply), reply);
    }
});
