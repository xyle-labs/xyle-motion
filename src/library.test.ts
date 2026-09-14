import assert from 'node:assert/strict';
import test from 'node:test';
import { assetId, distance, scan, statesOf, suggest } from './library.ts';

test('asset ids are derived from the path, not a registry', () => {
  assert.equal(assetId('energy/coal-powerplant.svg'), 'energy.coal_powerplant');
  assert.equal(assetId('generic/arrow.svg'), 'generic.arrow');
});

test('states are read off the art', () => {
  assert.deepEqual(statesOf('<g data-state="on"/><g data-state="off"/>'), ['on', 'off']);
  assert.deepEqual(statesOf('<g/>'), []);
});

test('distance counts single edits', () => {
  assert.equal(distance('bill', 'bill'), 0);
  assert.equal(distance('bill', 'bull'), 1);
  assert.equal(distance('', 'abc'), 3);
});

test('a near miss is suggested, an unrelated id is not', () => {
  const known = ['money.electricity_bill', 'energy.coal_powerplant'];
  assert.equal(suggest('money.electricity_invoice', known), 'money.electricity_bill');
  assert.equal(suggest('transport.jeepney', known), undefined);
});

test('the library on disk scans and every asset is real SVG', () => {
  const found = scan();
  assert.ok(found.size >= 10, `expected a library, found ${found.size}`);
  assert.ok(found.has('household.lightbulb'));
  for (const [id, path] of found) assert.match(path, /\.svg$/, id);
});
