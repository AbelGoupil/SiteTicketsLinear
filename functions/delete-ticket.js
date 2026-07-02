// Supprime définitivement un ticket Linear
// Appelé depuis le bouton Supprimer du popup detail

import { UUID_RE, checkAuth, jsonError, jsonResponse, serverError, linearError, linearFetch } from './_utils.js';

export async function onRequestPost(context) {
  try {
    var env = context.env;
    var body = await context.request.json();
    var { password, issueId } = body;

    // --- Auth ---
    if (!checkAuth(password, env)) {
      return jsonError('Mot de passe incorrect.', 401);
    }

    // --- Validation ---
    if (!issueId || typeof issueId !== 'string') {
      return jsonError('Issue ID manquant.', 400);
    }

    if (!UUID_RE.test(issueId)) {
      return jsonError('Issue ID invalide.', 400);
    }

    // --- Suppression définitive via Linear GraphQL (variables, pas d'interpolation) ---
    var mutation = 'mutation DeleteIssue($id: String!) { issueDelete(id: $id) { success } }';

    var linearRes = await linearFetch(env, mutation, { id: issueId });
    var linearData = await linearRes.json();

    if (linearData.errors || !(linearData.data && linearData.data.issueDelete && linearData.data.issueDelete.success)) {
      return linearError(linearData);
    }

    return jsonResponse({ success: true }, 200);

  } catch (err) {
    return serverError(err);
  }
}
