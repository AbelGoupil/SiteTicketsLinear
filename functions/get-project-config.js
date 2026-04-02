// Mapping slug URL → configuration Linear du projet
const PROJECTS = {
  myfnbpass: {
    name: 'myFnB Pass',
    projectId: 'bbdb4db3-1222-4e59-a521-e41ee3433b9c',
  },
  vroom: {
    name: 'Vroom',
    projectId: '871f0e06-56d1-4b96-80c1-982d6a375509',
  },
  koa: {
    name: 'Koa',
    projectId: '3784adf6-3aa0-42aa-bc89-012d2d87ca57',
  },
  safecircle: {
    name: 'SafeCircle',
    projectId: '46fd9905-4ec1-4067-98e1-2fc2c7d1c4db',
  },
  calmi: {
    name: 'Calmi',
    projectId: '2bd659ce-0532-4e8c-94dc-bc258dcabc64',
  },
  rivieraflow: {
    name: 'Riviera Flow',
    projectId: 'b1c5b9f9-c233-45e2-92a8-31ce1185846e',
  },
};

export async function onRequestPost(context) {
  const headers = { 'Content-Type': 'application/json' };

  try {
    const body = await context.request.json();
    const { slug } = body;

    if (!slug || typeof slug !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Slug de projet manquant.' }),
        { status: 400, headers }
      );
    }

    const project = PROJECTS[slug.toLowerCase()];

    if (!project) {
      return new Response(
        JSON.stringify({
          error: 'Projet introuvable.',
        }),
        { status: 404, headers }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        project: {
          slug: slug.toLowerCase(),
          name: project.name,
          projectId: project.projectId,
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
