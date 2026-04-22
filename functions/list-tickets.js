export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const { env } = context;
    const body = await context.request.json();
    const { password, projectId } = body;

    // --- Auth check ---
    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    if (!projectId || typeof projectId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Project ID manquant.' }),
        { status: 400, headers }
      );
    }

    // Valider format UUID pour éviter injection GraphQL
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(projectId)) {
      return new Response(
        JSON.stringify({ error: 'Project ID invalide.' }),
        { status: 400, headers }
      );
    }

    if (!env.LINEAR_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LINEAR_API_KEY non configurée sur le serveur.' }),
        { status: 500, headers }
      );
    }

    const LABEL_VISU_CLIENT = env.LINEAR_LABEL_VISU || '0bcea0c2-e93b-47b4-aae2-b5ba4fd0f25a';

    const graphqlBody = JSON.stringify({
      query: `query { issues(filter: { project: { id: { eq: "${projectId}" } }, labels: { id: { in: ["${LABEL_VISU_CLIENT}"] } } }, orderBy: updatedAt, first: 250) { nodes { id identifier title description priority estimate createdAt url state { name } labels { nodes { name color } } } } }`
    });

    const linearRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.LINEAR_API_KEY,
      },
      body: graphqlBody,
    });

    const linearData = await linearRes.json();

    if (linearData.errors) {
      return new Response(
        JSON.stringify({ error: 'Erreur API Linear : ' + linearData.errors.map(function(e) { return e.message; }).join(' | ') }),
        { status: 502, headers }
      );
    }

    var issues = [];
    if (linearData.data && linearData.data.issues && linearData.data.issues.nodes) {
      issues = linearData.data.issues.nodes;
    }

    return new Response(
      JSON.stringify({ success: true, tickets: issues }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erreur serveur list-tickets : ' + (err && err.message ? err.message : String(err)) }),
      { status: 500, headers }
    );
  }
}
