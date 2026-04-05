// Proxy sécurisé pour les fichiers Linear (images/vidéos)
// Les fichiers Linear sont privés et nécessitent une authentification
// Cette function les fetch côté serveur et les retourne au navigateur

const ALLOWED_HOSTS = ['uploads.linear.app'];

export async function onRequestGet(context) {
  const { env } = context;
  const url = new URL(context.request.url);

  // --- Auth check via query param ---
  const password = url.searchParams.get('p');
  if (!password || password !== env.APP_PASSWORD) {
    return new Response('Non autorisé.', { status: 401 });
  }

  // --- Récupérer et valider l'URL cible ---
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return new Response('Paramètre url manquant.', { status: 400 });
  }

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return new Response('URL invalide.', { status: 400 });
  }

  // --- Sécurité : n'autoriser que les URLs Linear ---
  if (!ALLOWED_HOSTS.includes(parsedTarget.hostname)) {
    return new Response('Domaine non autorisé.', { status: 403 });
  }

  // --- Fetch le fichier depuis Linear ---
  try {
    const fileRes = await fetch(targetUrl);

    if (!fileRes.ok) {
      return new Response('Erreur récupération fichier (' + fileRes.status + ').', { status: 502 });
    }

    // --- Retourner le fichier avec les bons headers ---
    const contentType = fileRes.headers.get('Content-Type') || 'application/octet-stream';

    return new Response(fileRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // cache 24h côté navigateur
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return new Response('Erreur serveur : ' + err.message, { status: 500 });
  }
}
