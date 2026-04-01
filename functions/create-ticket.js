export async function onRequestPost(context) {
  const { env } = context;

  // Headers CORS (même domaine, mais au cas où)
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await context.request.json();
    const { password, title, description, priority } = body;

    // --- Auth check ---
    if (password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    // --- Validation ---
    if (!title || !title.trim()) {
      return new Response(
        JSON.stringify({ error: 'Le titre est obligatoire.' }),
        { status: 400, headers }
      );
    }

    if (!description || !description.trim()) {
      return new Response(
        JSON.stringify({ error: 'La description est obligatoire.' }),
        { status: 400, headers }
      );
    }

    if (![0, 1, 2, 3].includes(priority)) {
      return new Response(
        JSON.stringify({ error: `Priorité invalide : ${priority}. Valeurs acceptées : 0 (Urgent), 1 (High), 2 (Medium), 3 (Low).` }),
        { status: 400, headers }
      );
    }

    // --- Créer le ticket via l'API Linear (GraphQL) ---
    const TEAM_ID = '026fd940-3b73-4990-b491-3ba49e5825dd';
    const PROJECT_ID = 'bbdb4db3-1222-4e59-a521-e41ee3433b9c';
    const TRIAGE_STATE_ID = '1a47d0a9-c3e9-4dd1-a9d7-e9ac63b099d8';

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

    const variables = {
      input: {
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
        stateId: TRIAGE_STATE_ID,
        title: title.trim(),
        description: description.trim(),
        priority: priority,
      },
    };

    const linearRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.LINEAR_API_KEY,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const linearData = await linearRes.json();

    // Gestion erreurs Linear
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
    return new Response(
      JSON.stringify({ error: `Erreur serveur : ${err.message}` }),
      { status: 500, headers }
    );
  }
}
