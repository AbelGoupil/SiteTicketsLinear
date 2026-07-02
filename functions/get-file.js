// Proxy sécurisé pour les fichiers Linear (images/vidéos)
// Les fichiers Linear sont privés (URLs signées expirent en ~5min)
// Cette function fetch les fichiers côté serveur avec l'API key Linear
//
// Auth : header X-App-Password OU cookie rf_auth (posé par le front à la connexion).
// Le mot de passe ne transite JAMAIS en query string (logs, historique, referer).

import { checkAuth, serverError } from './_utils.js';

const ALLOWED_HOSTS = ['uploads.linear.app'];

function getCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try { return decodeURIComponent(v.join('=')); } catch { return v.join('='); }
    }
  }
  return null;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  // --- Auth check : header ou cookie ---
  const password = request.headers.get('X-App-Password') || getCookie(request, 'rf_auth');
  if (!checkAuth(password, env)) {
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
    // Essai 1 : avec l'URL signée telle quelle (si le token est encore valide)
    let fileRes = await fetch(targetUrl);

    // Essai 2 : si le token est expiré, re-fetch avec l'API key Linear
    if (!fileRes.ok) {
      const cleanUrl = new URL(targetUrl);
      cleanUrl.searchParams.delete('signature');
      const baseUrl = cleanUrl.toString();

      fileRes = await fetch(baseUrl, {
        headers: { 'Authorization': env.LINEAR_API_KEY },
      });

      // Essai 3 : si ça ne marche toujours pas, essayer avec Bearer
      if (!fileRes.ok) {
        fileRes = await fetch(baseUrl, {
          headers: { 'Authorization': 'Bearer ' + env.LINEAR_API_KEY },
        });
      }
    }

    if (!fileRes.ok) {
      console.error('[get-file] fetch Linear KO', fileRes.status, parsedTarget.pathname);
      return new Response('Erreur récupération fichier.', { status: 502 });
    }

    // --- Retourner le fichier avec les bons headers ---
    const contentType = fileRes.headers.get('Content-Type') || 'application/octet-stream';

    return new Response(fileRes.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400', // cache 24h navigateur uniquement (fichiers privés)
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
