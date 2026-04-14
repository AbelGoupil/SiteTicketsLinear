// Limites
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

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
    const { password, title, description, priority, assetUrl, assetType, projectId, ticketType } = body;

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

    // --- Validation et mapping ticketType → labelId ---
    var TYPE_LABELS = {
      bug: '7d309bb5-6855-4088-9cc7-9cb534ed1868',
      amelioration: 'c27e7bee-464a-4621-88cc-a96ac8eedb02',
      idee: '7958f0fe-ef75-4a74-bd24-f88abde1edbf',
    };

    if (!ticketType || !TYPE_LABELS[ticketType]) {
      return new Response(
        JSON.stringify({ error: 'Type de ticket invalide. Valeurs acceptées : bug, amelioration, idee.' }),
        { status: 400, headers }
      );
    }

    var typeLabelId = TYPE_LABELS[ticketType];

    const linearHeaders = {
      'Content-Type': 'application/json',
      'Authorization': env.LINEAR_API_KEY,
    };

    // --- Fichier joint (déjà uploadé via /upload-file) ---
    let attachmentMarkdown = '';

    if (assetUrl && typeof assetUrl === 'string') {
      // Valider que c'est bien une URL Linear
      if (!assetUrl.startsWith('https://')) {
        return new Response(
          JSON.stringify({ error: 'URL de fichier invalide.' }),
          { status: 400, headers }
        );
      }
      const altTag = (assetType && assetType.startsWith('video/')) ? 'video' : 'screenshot';
      attachmentMarkdown = `![${altTag}](${assetUrl})\n\n`;
    }

    // --- Validation projectId ---
    if (!projectId || typeof projectId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Project ID manquant.' }),
        { status: 400, headers }
      );
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(projectId)) {
      return new Response(
        JSON.stringify({ error: 'Project ID invalide.' }),
        { status: 400, headers }
      );
    }

    // --- Créer le ticket via l'API Linear ---
    const TEAM_ID = env.LINEAR_TEAM_ID || '026fd940-3b73-4990-b491-3ba49e5825dd';
    const PROJECT_ID = projectId;
    const BACKLOG_STATE_ID = env.LINEAR_BACKLOG_STATE_ID || 'e27cf1cb-4c2c-47d1-848b-5205c8dbe4fb';
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

    const finalDescription = attachmentMarkdown + `- [ ] ${description.trim()}`;

    const variables = {
      input: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        stateId: BACKLOG_STATE_ID,
        title: title.trim(),
        description: finalDescription,
        priority: priority,
        labelIds: [LABEL_VISU_CLIENT, LABEL_RETOUR_CLIENT, typeLabelId],
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

    if (!linearData.data && linearData.data.issueCreate && linearData.data.issueCreate.success) {
      return new Response(
        JSON.stringify({ error: 'Linear a refusé la création du ticket. Réponse : ' + JSON.stringify(linearData.data) }),
        { status: 502, headers }
      );
    }

    // --- Succès ---
    var issue = linearData.data.issueCreate.issue;
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

