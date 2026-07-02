// Utilitaires partagés par toutes les Cloudflare Functions
// (le préfixe _ empêche Cloudflare Pages de créer une route pour ce fichier)

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Mapping type de ticket → labelId Linear (source unique)
export const TYPE_LABELS = {
  bug: '7d309bb5-6855-4088-9cc7-9cb534ed1868',
  amelioration: 'c27e7bee-464a-4621-88cc-a96ac8eedb02',
  idee: '7958f0fe-ef75-4a74-bd24-f88abde1edbf',
};

export function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonError(message, status) {
  return jsonResponse({ error: message }, status);
}

// Retourne 'admin' | 'client' | null
export function checkAuth(password, env) {
  if (!password) return null;
  if (env.APP_PASSWORD && password === env.APP_PASSWORD) return 'admin';
  if (env.CLIENT_PASSWORD && password === env.CLIENT_PASSWORD) return 'client';
  return null;
}

// Erreur serveur : log détaillé côté Cloudflare, message générique côté client
export function serverError(err) {
  console.error('[server-error]', err && err.stack ? err.stack : err);
  return jsonError('Erreur serveur.', 500);
}

// Erreur API Linear : log détaillé côté Cloudflare, message générique côté client
export function linearError(linearData) {
  console.error('[linear-error]', JSON.stringify(linearData));
  return jsonError('Erreur lors de la communication avec Linear.', 502);
}

// Appel GraphQL Linear
export function linearFetch(env, query, variables) {
  return fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': env.LINEAR_API_KEY,
    },
    body: JSON.stringify(variables ? { query: query, variables: variables } : { query: query }),
  });
}
