// Change le statut d'un ticket (drag & drop entre colonnes)

import { UUID_RE, checkAuth, jsonError, jsonResponse, serverError, linearError, linearFetch } from './_utils.js';

export async function onRequestPost(context) {
  try {
    var env = context.env;
    var body = await context.request.json();
    var password = body.password;
    var issueId = body.issueId;
    var stateId = body.stateId;

    if (!checkAuth(password, env)) {
      return jsonError('Mot de passe incorrect.', 401);
    }

    if (!issueId || typeof issueId !== 'string') {
      return jsonError('Issue ID manquant.', 400);
    }

    if (!UUID_RE.test(issueId)) {
      return jsonError('Issue ID invalide.', 400);
    }

    if (!stateId || typeof stateId !== 'string') {
      return jsonError('State ID manquant.', 400);
    }

    // Seuls les statuts Backlog et Next version sont autorisés
    var ALLOWED_STATES = {
      'e27cf1cb-4c2c-47d1-848b-5205c8dbe4fb': true,
      'd881e3d3-0f3a-43a8-9470-62e935b10bd6': true,
    };

    if (!ALLOWED_STATES[stateId]) {
      return jsonError('Changement de statut non autorisé.', 403);
    }

    if (!env.LINEAR_API_KEY) {
      return jsonError('LINEAR_API_KEY non configurée.', 500);
    }

    // Mutation avec variables GraphQL (pas d'interpolation de chaînes)
    var mutation = 'mutation UpdateIssueState($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { id state { name } } } }';

    var linearRes = await linearFetch(env, mutation, { id: issueId, stateId: stateId });
    var linearData = await linearRes.json();

    if (linearData.errors || !(linearData.data && linearData.data.issueUpdate && linearData.data.issueUpdate.success)) {
      return linearError(linearData);
    }

    return jsonResponse({ success: true }, 200);

  } catch (err) {
    return serverError(err);
  }
}
