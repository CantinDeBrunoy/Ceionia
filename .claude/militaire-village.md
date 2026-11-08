# Le militaire au village : remparts, tour, caserne, patrouilles

Décisions prises (le plus simple, cohérent avec l'existant) :

- **Déblocage** : tout l'onglet Militaire s'ouvre avec l'expédition « Le portail de l'autre rive » (Antiquité), comme
  aujourd'hui ; la caserne demande toujours une première tour de garde. Remparts et portes : même expédition.
- **Où bâtir** : tour de garde, caserne, rempart et porte se posent partout sur la terre ferme (village et île du portail).
  Sur l'île, on ne bâtit toujours que ces défenses, portail ouvert (`World.portalRule` inchangé pour le reste).
- **Les murs et les habitants** : un rempart ne se pose jamais sur une route (`canPlace`) : le tracé libre saute les cases de
  route et reprend derrière, le mur s'interrompt donc de lui-même là où passe une route (les habitants et les véhicules ne
  marchent que sur les routes : rien ne change pour eux). La **porte** se pose sur une case de route (comme un lampadaire) et
  enjambe la rue, battants ouverts. Rien ne bloque personne.
- **Tracé libre** : clic au point A, clic au point B (ou glissé) ; le mur suit la ligne de `wallLine` (ui/wallPlan.ts,
  réutilisée telle quelle), case par case ; les cases refusées (route, bâtiment, eau) sont sautées ; B devient le point A du
  mur suivant ; Échap oublie A. Prix par case : un tiers d'un petit bâtiment en Normal, rien en Facile et au bac à sable.
- **Rôle au village** : la caserne du village ajoute ses places à la garnison (`War.barracks()` la compte, une fois qu'il y a
  une caserne sur l'île pour accueillir les recrues) ; la tour de garde compte comme un poste de police pour la jauge
  Sécurité (`coverage.ts`, même portée que la police) ; les remparts ferment la ville (décor, sans effet de simulation).
- **Patrouilles** : un groupe par tour ou caserne du village (hors île), 2 soldats par tour, 3 par caserne, 6 groupes au
  plus. Ils marchent sur les routes à 10 cases au plus de leur bâtiment, sur le trottoir dès l'âge industriel, font demi-tour
  au bout des rues et parfois aux carrefours, s'arrêtent parfois au garde-à-vous, portent une torche la nuit. Tenue de l'âge
  (`makeSoldier` : lancier antique, chevalier, fusilier, fantassin moderne, soldat futuriste). Pas des troupes du joueur :
  ni sélection, ni recrutement. Hors `MAX_AGENTS` (ce ne sont pas des habitants), cachés loin de la caméra comme les
  habitants (`FOLK_FAR`).
- **Modèles** : tour et caserne : ceux de `defenses.ts` tels quels. Remparts et portes : `render/ramparts.ts`, un modèle
  par âge (palissade, muraille de pierre, enceinte de brique, mur de béton, mur d'énergie), un pan par case raccordé à ses
  voisins (nœud + bras, comme `hellWallAges.ts`), poteaux, tourelles ou pylônes aux bouts et aux angles, torches ou lampes
  la nuit, drapeaux de la faction (rouge à liseré d'or).
- **Les Enfers** gardent leurs bâtiments et leurs murs : rien n'y change.
