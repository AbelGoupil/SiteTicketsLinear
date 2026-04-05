export async function onRequestPost(context) {
  const { env } = context;

  const headers = { 'Content-Type': 'application/json' };

  try {
    const body = await context.request.json();
    const { password, projectId } = body;

    // --- Auth check ---
    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    // --- Validation projectId ---
    if (!projectId || typeof projectId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Project ID manquant.' }),
        { status: 400, headers }
      );
    }

    if (!env.LINEAR_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LINEAR_API_KEY non configurée sur le serveur.' }),
        { status: 500, headers }
      );
    }

    const PROJECT_ID = projectId;
    const LABEL_VISU_CLIENT = env.LINEAR_LABEL_VISU || '0bcea0c2-e93b-47b4-aae2-b5ba4fd0f25a';

    const query = `
      query ListIssues($projectId: String!, $labelId: [String!]) {
        issues(
          filter: {
            project: { id: { eq: $projectId } }
            labels: { id: { in: $labelId } }
          }
          orderBy: updatedAt
          first: 50
        ) {
          nodes {
            id
            identifier
            title
            description
            priority
            createdAt
          }
        }
      }
    `;

    const linearRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.LINEAR_API_KEY,
      },
      body: JSON.stringify({
        query,
        variables: {
          projectId: PROJECT_ID,
          labelId: [LABEL_VISU_CLIENT],
        },
      }),
    });

    const linearData = await linearRes.json();

    if (linearData.errors) {
      const errorMessages = linearData.errors.map(e => e.message).join(' | ');
      return new Response(
        JSON.stringify({ error: `Erreur API Linear : ${errorMessages}` }),
        { status: 502, headers }
      );
    }

    const issues = linearData.data?.issues?.nodes || [];

    return new Response(
      JSON.stringify({ success: true, tickets: issues }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Erreur serveur list-tickets : ${err.message}` }),
      { status: 500, headers }
    );
  }
}
