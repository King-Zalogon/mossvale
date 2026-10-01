import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css = readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
const token = name => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
const channel = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
const luminance = hex => {
  const [r, g, b] = channel(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the colour tokens used for text have at least AA contrast (4.5:1) on the backgrounds they sit on', () => {
  const bg = token('bg'),
    card = token('card');
  for (const [name, fg, back] of [
    ['cream on page', token('cream'), bg],
    ['cream on card', token('cream'), card],
    ['muted on page', token('muted'), bg],
    ['muted on card', token('muted'), card],
    ['lime on page', token('lime'), bg],
    ['lime on card', token('lime'), card],
  ]) {
    assert.ok(ratio(fg, back) >= 4.5, `${name}: ${ratio(fg, back).toFixed(2)}:1`);
  }
});

test('keyboard focus is visibly outlined', () => {
  assert.match(css, /button:focus-visible[\s\S]*?outline:\s*2px solid var\(--lime\)/);
});
