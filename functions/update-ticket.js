// Met à jour un ticket Linear (titre, description, priorité, labels/type)
// Appelé depuis le mode édition du popup detail

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

export async function onRequestPost(context) {
  var headers = { 'Content-Type': 'application/json' };

  try {
    var env = context.env;
    var body = await context.request.json();
    var { password, issueId, title, description, priority, ticketType } = body;

    // --- Auth ---
    if (!password || password !== env.APP_PASSWORD) {
      return new Response(
        JSON.stringify({ error: 'Mot de passe incorrect.' }),
        { status: 401, headers }
      );
    }

    // --- Validation issueId ---
    if (!issueId || typeof issueId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Issue ID manquant.' }),
        { status: 400, headers }
      );
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(issueId)) {
      return new Response(
        JSON.stringify({ error: 'Issue ID invalide.' }),
        { status: 400, headers }
      );
    }

    // --- Validation des champs ---
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
        JSON.stringify({ error: 'Priorité invalide.' }),
        { status: 400, headers }
      );
    }

    // --- Mapping ticketType → labelId ---
    var TYPE_LABELS = {
      bug: '7d309bb5-6855-4088-9cc7-9cb534ed1868',
      amelioration: 'c27e7bee-464a-4621-88cc-a96ac8eedb02',
      idee: '7958f0fe-ef75-4a74-bd24-f88abde1edbf',
    };

    if (!ticketType || !TYPE_LABELS[ticketType]) {
      return new Response(
        JSON.stringify({ error: 'Type de ticket invalide.' }),
        { status: 400, headers }
      );
    }

    var typeLabelId = TYPE_LABELS[ticketType];
    var LABEL_VISU_CLIENT = env.LINEAR_LABEL_VISU || '0bcea0c2-e93b-47b4-aae2-b5ba4fd0f25a';
    var LABEL_RETOUR_CLIENT = env.LINEAR_LABEL_RETOUR || '51babe56-93dc-4dbf-83f9-4cc4a836b503';

    if (!env.LINEAR_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LINEAR_API_KEY non configurée.' }),
        { status: 500, headers }
      );
    }

    // --- Mutation GraphQL ---
    var mutation = `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            title
            description
            priority
          }
        }
      }
    `;

    var variables = {
      id: issueId,
      input: {
        title: title.trim(),
        description: description.trim(),
        priority: priority,
        labelIds: [LABEL_VISU_CLIENT, LABEL_RETOUR_CLIENT, typeLabelId],
      },
    };

    var linearRes = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': env.LINEAR_API_KEY,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    var linearData = await linearRes.json();

    if (linearData.errors) {
      return new Response(
        JSON.stringify({ error: 'Erreur API Linear : ' + linearData.errors.map(function(e) { return e.message; }).join(' | ') }),
        { status: 502, headers }
      );
    }

    if (!(linearData.data && linearData.data.issueUpdate && linearData.data.issueUpdate.success)) {
      return new Response(
        JSON.stringify({ error: 'Linear a refusé la mise à jour.' }),
        { status: 502, headers }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Erreur serveur : ' + (err && err.message ? err.message : String(err)) }),
      { status: 500, headers }
    );
  }
}
