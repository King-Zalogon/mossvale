import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import Ajv from 'ajv';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const schema = read('../content/catalogue/schema.json');
const examples = read('../content/catalogue/examples.json');
const validate = new Ajv({allErrors: true}).compile(schema);

test('six reviewed kinds conform to the versioned authoring contract and reference existing files', () => {
  assert.equal(validate(examples), true, JSON.stringify(validate.errors));
  assert.equal(new Set(examples.entries.map(entry => entry.kind)).size, 6);
  assert.equal(new Set(examples.entries.map(entry => entry.id)).size, examples.entries.length);
  for (const entry of examples.entries) {
    for (const path of [...entry.references, ...entry.evidence.map(value => value.path), ...(entry.previews ?? []).map(value => value.path)]) {
      assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `${entry.id}: missing ${path}`);
    }
  }
});

test('incomplete, speculative and unsafe fiches cannot masquerade as structurally valid available resources', () => {
  const cases = [
    value => delete value.entries[0].details.animations,
    value => (value.entries[0].status = 'missing'),
    value => (value.entries[0].evidence = []),
    value => (value.entries[0].previews[0].path = '../private.png'),
    value => (value.entries[0].previews[0].path = 'C:\\private.png'),
    value => (value.format = 2),
    value => (value.entries[0].details.walkSpeed = 'invented setting'),
  ];
  for (const mutate of cases) {
    const value = structuredClone(examples);
    mutate(value);
    assert.equal(validate(value), false);
  }
});

test('proposed capability can explicitly lack implementation evidence', () => {
  const value = structuredClone(examples);
  value.entries[0].status = 'proposed';
  value.entries[0].evidence = [];
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});
