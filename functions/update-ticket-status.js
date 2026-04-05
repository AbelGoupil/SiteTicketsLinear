export async function onRequestPost(context) {
  var headers = { 'Content-Type': 'application/json' };

  try {
    var env = context.env;
    var body = await context.request.json();
    var password = body.password;
    var issueId = body.issueId;
    var stateId = body.stateId;

    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers: headers }
      );
    }

    if (!issueId || typeof issueId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Issue ID manquant.' }),
        { status: 400, headers: headers }
      );
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(issueId)) {
      return new Response(
        JSON.stringify({ error: 'Issue ID invalide.' }),
        { status: 400, headers: headers }
      );
    }

    if (!stateId || typeof stateId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'State ID manquant.' }),
        { status: 400, headers: headers }
      );
    }

    // Seuls les statuts Shaping et Next version sont autorisés
    var ALLOWED_STATES = {
      'e27cf1cb-4c2c-47d1-848b-5205c8dbe4fb': true,
      '446dc244-5df8-4e48-90b2-c75401b62d08': true,
    };

    if (!ALLOWED_STATES[stateId]) {
      return new Response(
        JSON.stringify({ error: 'Changement de statut non autorisé.' }),
        { status: 403, headers: headers }
      );
    }

    if (!env.LINEAR_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LINEAR_API_KEY non configurée.' }),
        { status: 500, headers: headers }
      );
    }

    var mutation = 'mutation { issueUpdate(id: "' + issueId + '", input: { stateId: "' + stateId + '" }) { success issue { id state { name } } } }';

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
        JSON.stringify({ error: 'Erreur API Linear : ' + linearData.errors.map(function(e) { return e.message; }).join(' | ') }),
        { status: 502, headers: headers }
      );
    }

    if (!(linearData.data && linearData.data.issueUpdate && linearData.data.issueUpdate.success)) {
      return new Response(
        JSON.stringify({ error: 'Linear a refusé la mise à jour.' }),
        { status: 502, headers: headers }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erreur serveur : ' + (err && err.message ? err.message : String(err)) }),
      { status: 500, headers: headers }
    );
  }
}
