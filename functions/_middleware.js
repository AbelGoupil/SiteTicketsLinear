// Middleware global pour toutes les Cloudflare Functions
// Gère : CORS, headers de sécurité, rate limiting basique

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 15; // max 15 requêtes par minute par IP
const requestCounts = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    requestCounts.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Nettoyage lazy : supprimer les entrées périmées à chaque requête
function cleanupOldEntries() {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      requestCounts.delete(ip);
    }
  }
}

// Routes API protégées par le middleware
const API_ROUTES = ['/create-ticket', '/list-tickets', '/get-project-config', '/update-ticket-status', '/upload-file', '/get-file'];

// Routes qui acceptent GET (les autres n'acceptent que POST)
const GET_ROUTES = ['/get-file'];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Ne filtrer que les routes API — laisser passer le reste (pages HTML, assets)
  const isApiRoute = API_ROUTES.some(route => url.pathname === route);
  if (!isApiRoute) {
    return await context.next();
  }

  // Nettoyage lazy à chaque requête (pas de setInterval en global scope)
  cleanupOldEntries();

  // --- CORS : restreindre à notre domaine ---
  const allowedOrigins = [
    url.origin, // même domaine (Cloudflare Pages)
  ];
  if (env.ALLOWED_ORIGIN) {
    allowedOrigins.push(env.ALLOWED_ORIGIN);
  }

  const origin = request.headers.get('Origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  // Preflight OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-App-Password, X-File-Type, X-File-Name',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Vérifier la méthode HTTP selon la route
  const isGetRoute = GET_ROUTES.some(route => url.pathname === route);
  const allowedMethod = isGetRoute ? 'GET' : 'POST';

  if (request.method !== allowedMethod) {
    return new Response(
      JSON.stringify({ error: 'Méthode non autorisée.' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // --- Rate limiting (exclure get-file car les images sont cachées côté navigateur) ---
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (url.pathname !== '/get-file' && isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Trop de requêtes. Réessayez dans une minute.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      }
    );
  }

  // --- Exécuter la function ---
  const response = await context.next();

  // --- Ajouter les headers de sécurité ---
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', corsOrigin);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (newHeaders.get('Access-Control-Allow-Origin') === '*') {
    newHeaders.set('Access-Control-Allow-Origin', corsOrigin);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
