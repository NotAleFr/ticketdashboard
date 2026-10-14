// Devuelve el token de la sesión actual.
// Si el usuario no ha iniciado sesión, devuelve null.
export async function getAccessToken(supabaseClient) {
  if (!supabaseClient) {
    return null;
  }

  const result = await supabaseClient.auth.getSession();

  if (result.error) {
    throw result.error;
  }

  const session = result.data.session;

  if (!session) {
    return null;
  }

  return session.access_token;
}
