/**
 * Le chargement des films des cinématiques (l'ouverture, la traversée) : le fichier entier d'abord, en mémoire, puis la
 * lecture. Mesuré le 24 nov. 2026 : la vidéo démarrait au moment même où la construction du monde prenait le processeur
 * (3 à 9 s d'un seul tenant). Le navigateur ne montre la première image d'une vidéo qu'après un passage du fil principal :
 * le joueur voyait l'image d'attente immobile (la nuée, le navire en ombre dans la brume), puis le film sautait de plusieurs
 * secondes. Maintenant : le film se télécharge en entier (rien ne peut plus l'arrêter en route), il démarre, ses premières
 * images sont à l'écran, et alors seulement le jeu se bâtit derrière lui
 */

/** Un film pas téléchargé au bout de ce temps (ms, réseau lent) : l'image de remplacement à sa place */
export const FILM_WAIT = 20000;

/** Les deux fichiers d'un film : la WebM (VP9), puis le MP4 (H.264) de secours */
export interface FilmFiles { webm: string; mp4: string }

/**
 * Les fichiers à essayer, dans l'ordre : la WebM si le navigateur sait la lire, puis le MP4. `can` : `canPlayType` d'une
 * vidéo (une chaîne vide : non)
 */
export function filmOrder(f: FilmFiles, can: (type: string) => string): string[] {
  const webm = !!can('video/webm; codecs="vp9"') || !!can('video/webm');
  return webm ? [f.webm, f.mp4] : [f.mp4];
}

/**
 * Télécharge le film en entier et rend l'adresse de sa copie en mémoire (à rendre avec `URL.revokeObjectURL`), ou null :
 * aucun fichier lisible, ou trop lent (`signal` arrêté). `progress` : l'avancée de 0 à 1 (sans taille connue, rien)
 */
export async function fetchFilm(urls: string[], progress: (k: number) => void, signal: AbortSignal): Promise<string | null> {
  for (const url of urls) {
    if (signal.aborted) return null;
    try {
      const res = await fetch(url, { signal });
      if (!res.ok || !res.body) continue;
      const total = Number(res.headers.get('content-length')) || 0, reader = res.body.getReader(), parts: BlobPart[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        got += value.length;
        if (total) progress(Math.min(1, got / total));
      }
      const type = url.endsWith('.webm') ? 'video/webm' : 'video/mp4';
      progress(1);
      return URL.createObjectURL(new Blob(parts, { type }));
    } catch {
      // (coupé, ou réseau en panne : le fichier suivant)
    }
  }
  return null;
}

/**
 * Tenu quand la vidéo, lancée, a ses premières images à l'écran (`requestVideoFrameCallback`, puis une image de plus), ou
 * au bout de `ms` : un panneau caché ne montre aucune image, et le chargement ne doit pas attendre pour rien
 */
export function firstFrames(v: HTMLVideoElement | null, ms = 1200): Promise<void> {
  return new Promise((done) => {
    let over = false;
    const end = () => { if (over) return; over = true; clearTimeout(t); done(); };
    const t = window.setTimeout(end, ms);
    const after = () => requestAnimationFrame(() => requestAnimationFrame(end));
    // (sans vidéo, le fondu de remplacement : deux images, le temps que ses animations partent)
    if (!v) { after(); return; }
    const rv = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    if (rv) {
      // (deux images de la vidéo montrées : la première peut l'être avant que la lecture ne parte vraiment)
      rv.call(v, () => rv.call(v, after));
    } else if (!v.paused && v.readyState >= 3) after();
    else v.addEventListener('playing', after, { once: true });
  });
}
