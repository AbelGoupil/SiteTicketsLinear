export async function onRequestPost(context) {
  const { env } = context;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const body = await context.request.json();
    const { password } = body;

    // --- Auth check ---
    if (password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    const PROJECT_ID = 'bbdb4db3-1222-4e59-a521-e41ee3433b9c';
    const LABEL_VISU_CLIENT = '0bcea0c2-e93b-47b4-aae2-b5ba4fd0f25a';

    // Récupérer les tickets du projet avec le label "Visu client"
    const query = `
      query ListIssues {
        issues(
          filter: {
            project: { id: { eq: "${PROJECT_ID}" } }
            labels: { id: { in: ["${LABEL_VISU_CLIENT}"] } }
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
            url
            createdAt
            state {
              name
              color
              type
            }
            labels {
              nodes {
                name
                color
              }
            }
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
      body: JSON.stringify({ query }),
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
      JSON.stringify({ error: `Erreur serveur : ${err.message}` }),
      { status: 500, headers }
    );
  }
}
