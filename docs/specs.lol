Voici les specs du citoyen :

- Le citoyen peut avoir des besoins conditionnés par des évènements qui peuvent être déclenchés soit automatiquement soit par le joueur.

- Vieillissement naturel : Seuil de Santé Max diminue avec le temps : -1 / semaine

- Santé Max (Jauge [0-Seuil de Santé Max]) : La Santé Max ne peut jamais dépasser le Seuil de Santé Max.

- Si Santé < Santé Max alors déclenchement d'un besoin de médicament.

- Adaptation physiologique : Santé max augmente avec le temps : + 1 / jour

- Agression chimique : Santé max diminue à chaque prise de médicament : - 1 / prise

- Dépendance chimique (Jauge [0-100]) : 
	- Augmente avec prise de médicament : 1 prise = + 10
	- Diminue si pas de prise de médicament depuis un certain temps : Pas de prise depuis 7 jours = -10
	- Si Dépendance chimique atteint 100 alors le citoyen a le statut "Argile". Le statut "Argile" reste tant que la Dépendance chimique n’atteint pas 0
	- Si Dépendance chimique atteint 0 alors le citoyen a le statut "Humain". Le statut "Humain" reste tant que la Dépendance chimique n’atteint pas 100

- Statut "Argile" : bloque l’adaptation physiologique
- Statut "Humain" : autorise l’adaptation physiologique

- Santé (Jauge [0-Santé Max])

- Système immunitaire : Santé augmente avec le temps : +1 / jour

- Maladies : Un citoyen peut avoir une ou plusieurs maladies

- Dégâts de maladie : Santé diminue avec la présence de maladie(s) : -2 / jour / maladie

- Statut sanitaire : Fonction de la Santé max (4 statuts) 
	- Statut "Très bonne santé" (75-100) : Chance de choper une maladie = 1% / semaine
	- Statut "Bonne santé" (50-75) : Chance de choper une maladie = 5% / semaine
	- Statut "Mauvaise santé" (25-50) : Chance de choper une maladie = 10% / semaine
	- Statut "Très mauvaise santé" (0-25) : Chance de choper une maladie = 15% / semaine

- Traitements
	- Traitement Pharmaceutique : 
		- Soin palliatif : augmente la Santé (+2 / prise)
		- Traitement classique : 1 prise = 1 maladie supprimée
	- Traitement Naturel : 5 prises = 1 maladie supprimée

- Bonheur
	- Bonheur = [ (Bonheur Santé + Bonheur Argent) / 2 ] * 100
	- Bonheur Santé = (Santé / Santé Max)
	- Bonheur Argent = (Salaire quotidien / 100 €)

- Compte bancaire
	- Salaire : + 100 € / jour
	- Achat médicament : - 10€ / médicament






- Pathfinding : faire qu'on peut aller de n'importe ou à n'importe ou (et non uniquement de X vers maison ou maison vers X)
- Ajouter horaires de travail de base à chaque agent, et chaque X et Y d'horaire a un intervalle d'aléa (plus ou moins une demi heure avant ou après X et Y par exemple)
- Si pour aller par exemple à la pharmacie, le temps d'y aller ça sera fermé, alors il ne doit pas y aller pour rien.
- Ajouter notion de priorité des Strategies / Routines
- Ajouter attribut divertissement (jauge 0 à 100)
- Ajouter statut burnout oui / non
- Ajouter type de besoin décompresser : dépend du statut burnout
	-> si Oui : changer priorité des Strategies / Routines (en priorisant routines divertissements sur le reste (à voir ce que veux dire le reste))











- ajouter condition, ne pas acheter médoc si il en possède déjà
- vérifier si il gagne pas un salaire le weekend

- probabilité de choper maladie : test la fonctionnalité








- ajouter score de cohésion sociale (exemple : ajouter pronoms = diminution du score)