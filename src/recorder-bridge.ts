import { createHash, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { connect } from 'node:http2';

export type PhoneDevice = { id: string; name: string; paired: boolean; push_token: string; environment: string };
export type PhoneTake = { id: string; scene: string; text: string; language: string; sha256: string; created: string; request_id?: string };
type Config = { api_url: string; project: string; token: string };
export const recorderDigest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export class RecorderBridge {
  private config: Config;
  constructor(config: Config) {
    const url = new URL(config.api_url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !config.token)
      throw new Error('Recorder config needs an HTTPS API URL and a Studio token.');
    this.config = config;
  }

  static fromEnvironment(project: string) {
    const file = process.env.XYLE_RECORDER_CONFIG;
    if (!file) return undefined;
    const config = JSON.parse(readFileSync(file, 'utf8')) as Config;
    if (config.project !== project) throw new Error('Recorder config belongs to a different video project.');
    return new RecorderBridge(config);
  }

  private async response(path: string, method = 'GET', data?: unknown) {
    const response = await fetch(`${this.config.api_url.replace(/\/$/, '')}/${path}`, {
      method, redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { 'X-Recorder-Studio-Token': this.config.token, 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(result.error ?? `Recorder API returned ${response.status}.`);
    }
    return response;
  }

  async devices(): Promise<PhoneDevice[]> {
    return ((await (await this.response('studio/devices')).json()) as { items: PhoneDevice[] }).items;
  }

  async pair(name: string) {
    const result = await (await this.response('studio/devices', 'POST', { name })).json() as { pairing_code: string; expires_in: number };
    return { ...result, api_url: this.config.api_url };
  }

  async request(data: { id: string; device_id: string; scene: string; text: string; language: string; instructions: string }) {
    if (!/^[a-f0-9-]{36}$/i.test(data.id)) throw new Error('Invalid recording request ID.');
    const device = (await this.devices()).find((item) => item.id === data.device_id && item.paired);
    if (!device) throw new Error('Choose a paired iPhone.');
    const { id, ...body } = data;
    const result = await (await this.response(`studio/requests/${id}`, 'PUT', body)).json();
    let notification = 'Request saved. Push is not configured; it will appear when the app refreshes.';
    if (device.push_token && process.env.XYLE_APNS_KEY_FILE && process.env.XYLE_APNS_KEY_ID && process.env.XYLE_APNS_TEAM_ID) {
      try { await notifyPhone(device, id); notification = 'Request saved and accepted by Apple for notification delivery.'; }
      catch (error) { notification = `Request saved. Notification failed: ${(error as Error).message}`; }
    }
    return { request: result, notification };
  }

  async takes(): Promise<PhoneTake[]> {
    return ((await (await this.response('studio/takes')).json()) as { items: PhoneTake[] }).items;
  }

  async audio(take: PhoneTake) {
    if (!/^[a-f0-9-]{36}$/i.test(take.id) || !/^[a-f0-9]{64}$/.test(take.sha256)) throw new Error('Invalid recorder take.');
    const response = await this.response(`studio/takes/${take.id}/audio`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!response.body) throw new Error('Recorder audio is missing.');
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new Error('Recorder take exceeds 25 MB.'); }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (recorderDigest(bytes) !== take.sha256) throw new Error('Recorder take checksum did not match. Original remains queued.');
    return bytes;
  }

  async ack(id: string) { await this.response(`studio/takes/${id}/ack`, 'POST', {}); }
}

export function apnsAuthorization(key: string, keyID: string, teamID: string, now = Date.now()) {
  const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url');
  const content = `${encode({ alg: 'ES256', kid: keyID })}.${encode({ iss: teamID, iat: Math.floor(now / 1000) })}`;
  return `${content}.${sign('sha256', Buffer.from(content), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

let cachedPush: { identity: string; token: string; expires: number } | undefined;
async function notifyPhone(device: PhoneDevice, requestID: string) {
  if (!/^[a-f0-9]{32,200}$/.test(device.push_token)) throw new Error('Invalid Apple device token.');
  const identity = [process.env.XYLE_APNS_KEY_FILE, process.env.XYLE_APNS_KEY_ID, process.env.XYLE_APNS_TEAM_ID].join(':');
  if (!cachedPush || cachedPush.identity !== identity || cachedPush.expires <= Date.now()) {
    cachedPush = { identity, expires: Date.now() + 40 * 60_000,
      token: apnsAuthorization(readFileSync(process.env.XYLE_APNS_KEY_FILE!, 'utf8'), process.env.XYLE_APNS_KEY_ID!, process.env.XYLE_APNS_TEAM_ID!) };
  }
  const authorization = cachedPush.token;
  const client = connect(device.environment === 'production' ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com');
  try {
    await new Promise<void>((resolve, reject) => {
      client.once('error', reject);
      const stream = client.request({ ':method': 'POST', ':path': `/3/device/${device.push_token}`,
        authorization: `bearer ${authorization}`, 'apns-topic': process.env.XYLE_APNS_TOPIC ?? 'com.waraywaray.voice-recorder',
        'apns-push-type': 'alert', 'apns-priority': '10', 'apns-id': randomUUID(), 'apns-collapse-id': requestID });
      let code = 0, reply = '';
      stream.setTimeout(10_000, () => { stream.close(); reject(new Error('Apple push timed out.')); });
      stream.on('response', (headers) => { code = Number(headers[':status']); });
      stream.on('data', (chunk) => { reply += chunk; });
      stream.on('error', reject);
      stream.on('end', () => code === 200 ? resolve() : reject(new Error(`Apple push ${code}: ${reply.slice(0, 200)}`)));
      stream.end(JSON.stringify({ aps: { alert: { title: 'New recording request', body: 'Open Voice Recorder to see the script and speaking instructions.' }, sound: 'default' }, request_id: requestID }));
    });
  } finally { client.destroy(); }
}
