import { describe, expect, it } from 'vitest';
import { resolveApiUrl } from '../src/api.js';

describe('resolveApiUrl', () => {
  it('uses IPv4 loopback for a host-and-port local API URL', () => {
    expect(resolveApiUrl('localhost:8000')).toBe('http://127.0.0.1:8000');
  });

  it('keeps a same-origin API path for the Vite development proxy', () => {
    expect(resolveApiUrl('/api')).toBe('/api');
  });
});
