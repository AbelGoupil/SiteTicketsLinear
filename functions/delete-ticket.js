// Supprime (archive) un ticket Linear
// Appelé depuis le bouton Supprimer du popup detail

export async function onRequestPost(context) {
  var headers = { 'Content-Type': 'application/json' };

  try {
    var env = context.env;
    var body = await context.request.json();
    var { password, issueId } = body;

    // --- Auth ---
    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    // --- Validation ---
    if (!issueId || typeof issueId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Issue ID manquant.' }),
        { status: 400, headers }
      );
    }

    // --- Archive (soft delete) via Linear GraphQL ---
    var mutation = `mutation { issueArchive(id: "${issueId}") { success } }`;

    var linearRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.LINEAR_API_KEY,
      },
      body: JSON.stringify({ query: mutation }),
    });

    var linearData = await linearRes.json();

    if (linearData.errors) {
      return new Response(
        JSON.stringify({ error: 'Erreur Linear : ' + linearData.errors[0].message }),
        { status: 500, headers }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erreur serveur : ' + err.message }),
      { status: 500, headers }
    );
  }
}
