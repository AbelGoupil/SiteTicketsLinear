// Upload un fichier (image ou vidéo) vers Linear via URL signée
// Reçoit le fichier en binary body (pas de base64)
// Retourne l'assetUrl à passer ensuite à create-ticket

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
// Types explicitement autorisés pour aperçu (screenshot / vidéo)
const ALLOWED_TYPES = [
  // Images
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  // Vidéos
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
];
// Flag depuis header X-File-Kind=document pour permettre tous types (PDF, docx, xlsx, zip...)

export async function onRequestPost(context) {
  const { env } = context;
  const headers = { 'Content-Type': 'application/json' };

  try {
    // --- Auth check via header ---
    const password = context.request.headers.get('X-App-Password');
    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    // --- Récupérer les métadonnées depuis les headers ---
    const contentType = context.request.headers.get('X-File-Type');
    const rawFilename = context.request.headers.get('X-File-Name');
    // Le client encode le nom de fichier (encodeURIComponent) pour supporter les caractères non-ASCII
    // dans les headers HTTP. On décode ici pour avoir un nom propre dans Linear.
    let filename = rawFilename;
    try { filename = rawFilename ? decodeURIComponent(rawFilename) : rawFilename; } catch (_) { filename = rawFilename; }
    const fileKind = context.request.headers.get('X-File-Kind'); // 'document' = tous types, sinon = image/vidéo seulement

    if (!contentType) {
      return new Response(
        JSON.stringify({ error: 'Type de fichier manquant.' }),
        { status: 400, headers }
      );
    }

    if (fileKind !== 'document' && !ALLOWED_TYPES.includes(contentType)) {
      return new Response(
        JSON.stringify({ error: `Type de fichier non autorisé : ${contentType}. Types acceptés : ${ALLOWED_TYPES.join(', ')}` }),
        { status: 400, headers }
      );
    }

    if (!filename || typeof filename !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Nom de fichier manquant (header X-File-Name).' }),
        { status: 400, headers }
      );
    }

    // --- Lire le body binaire ---
    const fileBuffer = await context.request.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    if (fileBytes.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Fichier vide.' }),
        { status: 400, headers }
      );
    }

    if (fileBytes.length > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `Fichier trop volumineux (${(fileBytes.length / 1024 / 1024).toFixed(1)}MB). Max : 50MB.` }),
        { status: 400, headers }
      );
    }

    // --- Étape 1 : demander une URL d'upload signée à Linear ---
    const linearHeaders = {
      'Content-Type': 'application/json',
      'Authorization': env.LINEAR_API_KEY,
    };

    const uploadMutation = `
      mutation FileUpload($size: Int!, $contentType: String!, $filename: String!) {
        fileUpload(size: $size, contentType: $contentType, filename: $filename) {
          success
          uploadFile {
            uploadUrl
            assetUrl
            headers {
              key
              value
            }
          }
        }
      }
    `;

    const uploadRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: linearHeaders,
      body: JSON.stringify({
        query: uploadMutation,
        variables: {
          size: fileBytes.length,
          contentType: contentType,
          filename: filename.substring(0, 100),
        },
      }),
    });

    const uploadData = await uploadRes.json();

    if (uploadData.errors) {
      return new Response(
        JSON.stringify({ error: `Erreur upload Linear : ${uploadData.errors.map(e => e.message).join(' | ')}` }),
        { status: 502, headers }
      );
    }

    if (!uploadData.data || !uploadData.data.fileUpload || !uploadData.data.fileUpload.success) {
      return new Response(
        JSON.stringify({ error: 'Linear a refusé l\'upload. Réponse : ' + JSON.stringify(uploadData.data) }),
        { status: 502, headers }
      );
    }

    const uploadFile = uploadData.data.fileUpload.uploadFile;
    const uploadUrl = uploadFile.uploadUrl;
    const assetUrl = uploadFile.assetUrl;
    const uploadFileHeaders = uploadFile.headers;

    // --- Étape 2 : PUT le fichier vers l'URL signée ---
    const putHeaders = {};
    for (const h of uploadFileHeaders) {
      putHeaders[h.key] = h.value;
    }
    putHeaders['Content-Type'] = contentType;

    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: putHeaders,
      body: fileBytes,
    });

    if (!putRes.ok) {
      return new Response(
        JSON.stringify({ error: `Erreur upload fichier (HTTP ${putRes.status}).` }),
        { status: 502, headers }
      );
    }

    // --- Succès ---
    return new Response(
      JSON.stringify({ success: true, assetUrl: assetUrl }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Erreur serveur : ${err.message}` }),
      { status: 500, headers }
    );
  }
}
