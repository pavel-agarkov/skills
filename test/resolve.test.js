import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSelection } from '../src/resolve.js';

const catalog = {
  skills: new Map([['a', {}], ['b', {}], ['c', {}]]),
  tags: new Map([['x', ['a', 'b']], ['y', ['b', 'c']]]),
};

test('names only, in catalog order and deduplicated', () => {
  assert.deepEqual(resolveSelection(catalog, { skills: ['c', 'a', 'a'] }), ['a', 'c']);
});

test('tag expands to every skill carrying it', () => {
  assert.deepEqual(resolveSelection(catalog, { tags: ['x'] }), ['a', 'b']);
});

test('names and tags union', () => {
  assert.deepEqual(resolveSelection(catalog, { skills: ['c'], tags: ['x'] }), ['a', 'b', 'c']);
  assert.deepEqual(resolveSelection(catalog, { tags: ['x', 'y'] }), ['a', 'b', 'c']);
});

test('empty selection resolves to nothing', () => {
  assert.deepEqual(resolveSelection(catalog, {}), []);
});

test('unknown names and tags throw listing valid values', () => {
  assert.throws(() => resolveSelection(catalog, { skills: ['nope'] }), /unknown skill: nope.*valid: a, b, c/);
  assert.throws(() => resolveSelection(catalog, { tags: ['nope'] }), /unknown tag: nope.*valid: x, y/);
  assert.throws(() => resolveSelection(catalog, { skills: ['q'], tags: ['z'] }), /unknown skill: q.*unknown tag: z/);
});
