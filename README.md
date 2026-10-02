# Stats, Stats

Application HTML autonome de suivi des séances, performances et mesures corporelles, avec fonctionnement hors ligne. Ouvrir `index.html` ou servir ce dossier avec un serveur HTTP.

## Programme d’octobre 2026

| Jour indicatif | Séance | Volume |
| --- | --- | --- |
| Lundi | Haut du corps | 23 séries, dont 4 au couché et 4 aux relevés de jambes |
| Mardi | Bas du corps | 21 séries, abdos compris |
| Jeudi | Corps entier, priorité jambes | 24 séries, avec hack squat et leg curl |
| Samedi | Circuit poids du corps + escalier | 3 tours, puis 10–15 min d’escalier et gainage |

Les repos, consignes et plages de répétitions sont affichés dans le programme. Les lignes de saisie sont préparées selon le nombre de séries prévu. Le gainage se saisit en secondes et l’escalier en minutes ; les exercices au poids du corps permettent de suivre les répétitions avec un lest facultatif.

### Mise à jour et données existantes

Au premier chargement de cette version, les quatre nouveaux modèles sont ajoutés une seule fois. Les anciens modèles Upper/Lower sont archivés et restent consultables, modifiables et réactivables dans Programme. Les séances enregistrées, mesures corporelles, noms d’exercices existants et modèles personnalisés sont conservés. Les modifications ultérieures des nouveaux modèles ne sont pas réinitialisées au rechargement.

Les données utilisent toujours la clé locale `statsstats.db.v1`. Elles restent sur le même appareil et la même origine web ; exporter une sauvegarde JSON depuis Programme permet de les transférer ou de les restaurer. L’import d’une ancienne sauvegarde applique aussi la mise à jour du programme.

### Mise à jour depuis le raccourci du téléphone

L’application recherche une nouvelle version à l’ouverture, au retour au premier plan et au rétablissement de la connexion. Le bouton **Vérifier les mises à jour** dans Programme permet aussi de lancer la recherche. Un bandeau **Nouvelle version disponible** permet de l’appliquer. Une séance non enregistrée ou un formulaire ouvert bloque le rechargement jusqu’à la fin de la saisie. Les données locales sont conservées.

Le premier passage depuis l’ancienne version peut demander de fermer complètement puis rouvrir l’application connectée, pour que l’ancien cache laisse place à cette version. Les ouvertures suivantes privilégient la version en ligne et gardent une copie pour le hors-ligne. Chaque publication doit modifier la constante `CACHE` de `sw.js` pour déclencher la détection d’une nouvelle version pendant que l’application est ouverte.

## Vérifications

Avec Node.js :

```sh
node --test tests/*.test.cjs
```

Ces vérifications couvrent les volumes, la migration sans perte de données, l’absence de doublons, la conservation des modifications, la réactivation des archives, le suivi des exercices au poids du corps et des durées, la protection des saisies pendant une mise à jour et le cache hors ligne.
