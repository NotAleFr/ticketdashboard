import { describe, expect, it, vi } from 'vitest';
import { getAccessToken } from '../src/auth/session.js';

function createStorage(initialToken = null) {
  let token = initialToken;
  return {
    getItem: vi.fn(() => token),
    setItem: vi.fn((_, value) => { token = value; }),
  };
}

describe('getAccessToken', () => {
  it('uses the refreshed Supabase session token and updates the compatibility entry', async () => {
    const storage = createStorage('expired-token');
    const supabaseClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'fresh-token' } },
          error: null,
        }),
      },
    };

    await expect(getAccessToken({ supabaseClient, storage })).resolves.toBe('fresh-token');
    expect(storage.setItem).toHaveBeenCalledWith('access_token', 'fresh-token');
  });

  it('falls back to the stored token when no Supabase session exists', async () => {
    const storage = createStorage('stored-token');
    const supabaseClient = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    };

    await expect(getAccessToken({ supabaseClient, storage })).resolves.toBe('stored-token');
  });
});
