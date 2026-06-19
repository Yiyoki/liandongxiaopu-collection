import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAcwArg1, resolveAcwScV2Cookie } from './ldxpClient.js';

test('extracts acw challenge arg1 from upstream HTML', () => {
  const html = '<html><script>var arg1="0123456789abcdef0123456789abcdef01234567";</script></html>';
  assert.equal(extractAcwArg1(html), '0123456789abcdef0123456789abcdef01234567');
});

test('returns null when upstream HTML has no acw challenge', () => {
  assert.equal(resolveAcwScV2Cookie('<html><body>blocked</body></html>'), null);
});

test('calculates acw_sc__v2 cookie from challenge arg1', () => {
  const html = '<html><script>var arg1="0123456789abcdef0123456789abcdef01234567";</script></html>';
  assert.equal(resolveAcwScV2Cookie(html), '5c2f058798b3780303b39fa03bd044ba63975439');
});
