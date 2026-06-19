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
  assert.equal(resolveAcwScV2Cookie(html), 'd2c7186598ab1a508a4f6064e4fa746323ab17c6');
});

test('calculates acw_sc__v2 cookie from captured upstream challenge arg1', () => {
  const html = "<html><script>var arg1='362C5C9AEF9E9450300E167586693D9A61A651A6';</script></html>";
  assert.equal(extractAcwArg1(html), '362C5C9AEF9E9450300E167586693D9A61A651A6');
  assert.equal(resolveAcwScV2Cookie(html), '6a357751fe8c06618fdca1b971a5049c12a91693');
});
