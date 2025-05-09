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







MedicationPurchaseStrategy.js:152 Agent citizen_0: Arrivé au commerce mais il est maintenant fermé (22h).
AgentMedicationBehavior.js:115 Agent citizen_0: Échec de l'achat au magasin bldg_948. Retour à la maison.