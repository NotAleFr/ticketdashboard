/**
 * Return the freshest Supabase access token available to the browser.
 *
 * Supabase owns the session storage and can refresh an expired access token.
 * The legacy `access_token` entry is kept as a fallback for existing sessions.
 */
export async function getAccessToken({ supabaseClient, storage = localStorage }) {
  const storedToken = storage.getItem('access_token');

  if (!supabaseClient) {
    return storedToken;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    throw error;
  }

  const refreshedToken = data.session?.access_token;
  if (refreshedToken) {
    storage.setItem('access_token', refreshedToken);
    return refreshedToken;
  }

  return storedToken;
}
