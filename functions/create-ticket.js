// Limites
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

export async function onRequestPost(context) {
  const { env } = context;

  const headers = { 'Content-Type': 'application/json' };

  try {
    // Vérifier la taille du body avant de le parser
    const contentLength = parseInt(context.request.headers.get('Content-Length') || '0');
    if (contentLength > 10 * 1024 * 1024) { // 10MB max total
      return new Response(
        JSON.stringify({ error: 'Payload trop volumineux (max 10MB).' }),
        { status: 413, headers }
      );
    }

    const body = await context.request.json();
    const { password, title, description, priority, screenshot, projectId } = body;

    // --- Auth check ---
    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    // --- Validation stricte ---
    if (!title || typeof title !== 'string' || !title.trim()) {
      return new Response(
        JSON.stringify({ error: 'Le titre est obligatoire.' }),
        { status: 400, headers }
      );
    }

    if (title.trim().length > MAX_TITLE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Le titre ne doit pas dépasser ${MAX_TITLE_LENGTH} caractères.` }),
        { status: 400, headers }
      );
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      return new Response(
        JSON.stringify({ error: 'La description est obligatoire.' }),
        { status: 400, headers }
      );
    }

    if (description.trim().length > MAX_DESCRIPTION_LENGTH) {
      return new Response(
        JSON.stringify({ error: `La description ne doit pas dépasser ${MAX_DESCRIPTION_LENGTH} caractères.` }),
        { status: 400, headers }
      );
    }

    if (typeof priority !== 'number' || ![0, 1, 2, 3].includes(priority)) {
      return new Response(
        JSON.stringify({ error: `Priorité invalide. Valeurs acceptées : 0 (Urgent), 1 (High), 2 (Medium), 3 (Low).` }),
        { status: 400, headers }
      );
    }

    const linearHeaders = {
      'Content-Type': 'application/json',
      'Authorization': env.LINEAR_API_KEY,
    };

    // --- Upload screenshot si présent ---
    let imageMarkdown = '';

    if (screenshot && screenshot.base64) {
      // Valider le contentType
      if (!screenshot.contentType || !ALLOWED_IMAGE_TYPES.includes(screenshot.contentType)) {
        return new Response(
          JSON.stringify({ error: `Type d'image non autorisé : ${screenshot.contentType}. Types acceptés : ${ALLOWED_IMAGE_TYPES.join(', ')}` }),
          { status: 400, headers }
        );
      }

      // Valider le filename
      if (!screenshot.filename || typeof screenshot.filename !== 'string') {
        return new Response(
          JSON.stringify({ error: 'Nom de fichier invalide.' }),
          { status: 400, headers }
        );
      }

      // Décoder le base64 et vérifier la taille
      let binaryData;
      try {
        binaryData = Uint8Array.from(atob(screenshot.base64), c => c.charCodeAt(0));
      } catch {
        return new Response(
          JSON.stringify({ error: 'Image invalide (base64 corrompu).' }),
          { status: 400, headers }
        );
      }

      if (binaryData.length > MAX_IMAGE_SIZE) {
        return new Response(
          JSON.stringify({ error: `Image trop volumineuse (${(binaryData.length / 1024 / 1024).toFixed(1)}MB). Max : 5MB.` }),
          { status: 400, headers }
        );
      }

      // Étape 1 : demander une URL d'upload à Linear
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
            size: binaryData.length,
            contentType: screenshot.contentType,
            filename: screenshot.filename.substring(0, 100), // limiter le nom
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

      if (!uploadData.data?.fileUpload?.success) {
        return new Response(
          JSON.stringify({ error: 'Linear a refusé l\'upload. Réponse : ' + JSON.stringify(uploadData.data) }),
          { status: 502, headers }
        );
      }

      const { uploadUrl, assetUrl, headers: uploadHeaders } = uploadData.data.fileUpload.uploadFile;

      // Étape 2 : uploader vers l'URL signée
      const putHeaders = {};
      for (const h of uploadHeaders) {
        putHeaders[h.key] = h.value;
      }
      putHeaders['Content-Type'] = screenshot.contentType;

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: putHeaders,
        body: binaryData,
      });

      if (!putRes.ok) {
        return new Response(
          JSON.stringify({ error: `Erreur upload fichier (HTTP ${putRes.status}).` }),
          { status: 502, headers }
        );
      }

      imageMarkdown = `![screenshot](${assetUrl})\n\n`;
    }

    // --- Validation projectId ---
    if (!projectId || typeof projectId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Project ID manquant.' }),
        { status: 400, headers }
      );
    }

    // --- Créer le ticket via l'API Linear ---
    const TEAM_ID = env.LINEAR_TEAM_ID || '026fd940-3b73-4990-b491-3ba49e5825dd';
    const PROJECT_ID = projectId;
    const TRIAGE_STATE_ID = env.LINEAR_TRIAGE_STATE_ID || '1a47d0a9-c3e9-4dd1-a9d7-e9ac63b099d8';
    const LABEL_VISU_CLIENT = env.LINEAR_LABEL_VISU || '0bcea0c2-e93b-47b4-aae2-b5ba4fd0f25a';
    const LABEL_RETOUR_CLIENT = env.LINEAR_LABEL_RETOUR || '51babe56-93dc-4dbf-83f9-4cc4a836b503';

    const mutation = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
          }
        }
      }
    `;

    const finalDescription = imageMarkdown + `- [ ] ${description.trim()}`;

    const variables = {
      input: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        stateId: TRIAGE_STATE_ID,
        title: title.trim(),
        description: finalDescription,
        priority: priority,
        labelIds: [LABEL_VISU_CLIENT, LABEL_RETOUR_CLIENT],
      },
    };

    const linearRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: linearHeaders,
      body: JSON.stringify({ query: mutation, variables }),
    });

    const linearData = await linearRes.json();

    if (linearData.errors) {
      const errorMessages = linearData.errors.map(e => e.message).join(' | ');
      return new Response(
        JSON.stringify({ error: `Erreur API Linear : ${errorMessages}` }),
        { status: 502, headers }
      );
    }

    if (!linearData.data?.issueCreate?.success) {
      return new Response(
        JSON.stringify({ error: 'Linear a refusé la création du ticket. Réponse : ' + JSON.stringify(linearData.data) }),
        { status: 502, headers }
      );
    }

    // --- Succès ---
    const issue = linearData.data.issueCreate.issue;
    return new Response(
      JSON.stringify({
        success: true,
        ticket: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
        },
      }),
      { status: 200, headers }
    );

  } catch (err) {
    // Ne pas exposer les détails d'erreur internes en prod
    return new Response(
      JSON.stringify({ error: `Erreur serveur : ${err.message}` }),
      { status: 500, headers }
    );
  }
}
