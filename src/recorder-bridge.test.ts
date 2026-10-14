import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { apnsAuthorization, RecorderBridge, recorderDigest } from './recorder-bridge.ts';

test('recorder credentials require HTTPS; notification JWT uses Apple ES256 format', () => {
  assert.throws(() => new RecorderBridge({ api_url: 'http://example.test', token: 'test', project: 'p' }), /HTTPS/);
  const credentialURL = new URL('https://example.test'); credentialURL.username = 'user'; credentialURL.password = 'password';
  assert.throws(() => new RecorderBridge({ api_url: credentialURL.href, token: 'test', project: 'p' }), /HTTPS/);
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const key = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const token = apnsAuthorization(key, 'TESTKEY123', 'TESTTEAM12', 1700000000000);
  const [header, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'ES256', kid: 'TESTKEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url').toString()), { iss: 'TESTTEAM12', iat: 1700000000 });
  assert.equal(Buffer.from(signature, 'base64url').length, 64);
  assert.ok(verify('sha256', Buffer.from(`${header}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
});

test('bridge sends scoped credentials, persists request UUIDs, and verifies original checksums', async () => {
  const originalFetch = globalThis.fetch;
  const id = randomUUID(), deviceID = randomUUID(), bytes = Buffer.from('original take');
  const calls: { url: string; options: RequestInit }[] = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/studio/devices')) return Response.json({ items: [{ id: deviceID, name: 'Phone', paired: true, push_token: '', environment: 'sandbox' }] });
    if (String(url).endsWith('/audio')) return new Response(bytes);
    return Response.json({ id });
  };
  try {
    const bridge = new RecorderBridge({ api_url: 'https://example.test/mobile/recorder/v1', token: 'test-credential', project: 'p' });
    const data = { id, device_id: deviceID, scene: 'greeting', language: 'Waray', text: 'Maupay nga aga.', instructions: 'Pause after aga.' };
    const result = await bridge.request(data);
    assert.match(result.notification, /not configured/);
    await bridge.request(data);
    const mutations = calls.filter((call) => call.options.method === 'PUT');
    assert.equal(mutations.length, 2);
    assert.equal(mutations[0].url, mutations[1].url);
    assert.equal(mutations[0].options.body, mutations[1].options.body);
    assert.equal(JSON.parse(String(mutations[0].options.body)).instructions, data.instructions);
    for (const call of calls) {
      assert.equal(call.options.redirect, 'error');
      assert.equal((call.options.headers as Record<string, string>)['X-Recorder-Studio-Token'], 'test-credential');
    }
    const take = { id, scene: 'greeting', text: data.text, language: 'Waray', created: new Date().toISOString(), sha256: recorderDigest(bytes) };
    assert.deepEqual(await bridge.audio(take), bytes);
    await assert.rejects(() => bridge.audio({ ...take, sha256: 'f'.repeat(64) }), /checksum/);
    await bridge.ack(id);
    assert.ok(calls.at(-1)!.url.endsWith(`/studio/takes/${id}/ack`));
    await assert.rejects(() => bridge.request({ ...data, device_id: randomUUID() }), /paired iPhone/);
  } finally { globalThis.fetch = originalFetch; }
});
