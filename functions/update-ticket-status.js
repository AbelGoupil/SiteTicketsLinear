// Change le statut d'un ticket (drag & drop entre colonnes).
// Change aussi son milestone quand le front en envoie un :
//   - drop dans "Prochaine version" -> milestoneId = milestone de la prochaine version
//   - drop dans "Backlog"           -> milestoneId = null (aucun milestone)
// Champ absent du body = milestone inchangé.

import { UUID_RE, checkAuth, jsonError, jsonResponse, serverError, linearError, linearFetch } from './_utils.js';

export async function onRequestPost(context) {
  try {
    var env = context.env;
    var body = await context.request.json();
    var password = body.password;
    var issueId = body.issueId;
    var stateId = body.stateId;
    // hasMilestone : le front demande explicitement un changement de milestone.
    // milestoneId null = retirer le milestone du ticket.
    var hasMilestone = Object.prototype.hasOwnProperty.call(body, 'milestoneId');
    var milestoneId = hasMilestone ? body.milestoneId : undefined;

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

    // Milestone : soit null (on le retire), soit un UUID valide.
    if (hasMilestone && milestoneId !== null) {
      if (typeof milestoneId !== 'string' || !UUID_RE.test(milestoneId)) {
        return jsonError('Milestone ID invalide.', 400);
      }
    }

    if (!env.LINEAR_API_KEY) {
      return jsonError('LINEAR_API_KEY non configurée.', 500);
    }

    // Mutation avec variables GraphQL (pas d'interpolation de chaînes).
    // projectMilestoneId n'est envoyé que si le front demande un changement de milestone :
    // la valeur null retire le milestone, une valeur absente le laisse tel quel.
    var mutation = hasMilestone
      ? 'mutation UpdateIssueState($id: String!, $stateId: String!, $milestoneId: String) { issueUpdate(id: $id, input: { stateId: $stateId, projectMilestoneId: $milestoneId }) { success issue { id state { name } projectMilestone { id name } } } }'
      : 'mutation UpdateIssueState($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { id state { name } } } }';

    var variables = { id: issueId, stateId: stateId };
    if (hasMilestone) variables.milestoneId = milestoneId;

    var linearRes = await linearFetch(env, mutation, variables);
    var linearData = await linearRes.json();

    if (linearData.errors || !(linearData.data && linearData.data.issueUpdate && linearData.data.issueUpdate.success)) {
      return linearError(linearData);
    }

    return jsonResponse({ success: true }, 200);

  } catch (err) {
    return serverError(err);
  }
}
