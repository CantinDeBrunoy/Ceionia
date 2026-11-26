/**
 * Rend la main à Node le temps d'un tour de boucle. Un long test sans pause bloque son processus : la réponse de vitest à
 * « onTaskUpdate » attend, et passé 60 s son délai expire avant qu'elle soit lue. Le test passe, mais vitest compte une
 * erreur « Timeout calling onTaskUpdate » et sort avec le code 1 (le déploiement GitHub échouait ainsi).
 * `setImmediate` passe après la lecture des messages, à la différence de `setTimeout(0)`.
 * À appeler à chaque tour d'une boucle qui dure plus de quelques secondes.
 */
export const souffle = () => new Promise<void>((r) => setImmediate(r));
