import BaseMovementState from './BaseMovementState.js';

// Remarque : nous utilisons directement les propriétés de l'agent via ctx.agent afin d'éviter de dupliquer la logique.
export default class AtHomeState extends BaseMovementState {
    onEnter() {
        this.ctx.agent.currentState = 'AT_HOME'; // Maintenir synchro avec l'ancien enum pour l'instant
        this.ctx.agent.isVisible = false;
    }

    /**
     * @param {number} dt
     */
    onUpdate(dt) {
        const agent = this.ctx.agent;
        const env = agent.experience?.world?.environment;
        if (!env) return;

        // Ne rien faire si l'agent n'est plus formellement « AT_HOME » côté modèle legacy.
        // Évite la boucle de multiples requestPath.
        if (agent.currentState !== 'AT_HOME') return;

        const currentHour = this.currentHour;
        const calendarDate = this.calendarDate;
        const timeWithinDay = this.timeWithinDay;
        const currentGameTime = this.currentGameTime;

        // Débug pour comprendre le calcul des heures
        console.log(`[FSM-${agent.id}] AtHome.onUpdate: heure=${currentHour}, timeWithinDay=${timeWithinDay}, prepareWork=${agent.prepareWorkDepartureTimeGame}`);

        // Vérifier si c'est un jour de travail
        const shouldWorkToday = agent.workScheduleStrategy ? agent.workScheduleStrategy.shouldWorkToday(calendarDate) : false;

        // Gestion éventuelle du weekend walk via stratégie
        let shouldStartWeekendWalk = false;
        if (calendarDate && ["Samedi", "Dimanche"].includes(calendarDate.jourSemaine) && this.ctx.weekendWalkStrategy) {
            this.ctx.weekendWalkStrategy.registerAgent(agent.id, calendarDate);
            shouldStartWeekendWalk = this.ctx.weekendWalkStrategy.shouldWalkNow(agent.id, calendarDate, currentHour);
        }

        if (shouldStartWeekendWalk) {
            agent._findRandomWalkDestination(currentGameTime);
            return;
        }

        // Gestion départ travail
        if (agent.workPosition && shouldWorkToday &&
            timeWithinDay >= agent.prepareWorkDepartureTimeGame &&
            currentHour < agent.departureHomeHour &&
            agent.requestedPathForDepartureTime !== currentGameTime)
        {
            console.log(`[FSM-${agent.id}] AtHome: Déclenchement requête trajet travail`);
            agent.requestedPathForDepartureTime = currentGameTime;
            agent.isInVehicle = agent.hasVehicle;

            // Gestion voiture
            if (agent.isInVehicle) {
                const carManager = agent.experience.world?.carManager;
                if (carManager && !carManager.hasCarForAgent(agent.id)) {
                    const car = carManager.createCarForAgent(agent, agent.vehicleHomePosition || agent.homePosition, agent.workPosition);
                    if (!car) {
                        console.warn(`[FSM-${agent.id}] Échec création voiture, passage en mode piéton`);
                        agent.isInVehicle = false;
                    }
                }
            }

            // Demander le chemin vers le travail
            agent.currentState = 'REQUESTING_PATH_FOR_WORK';
            agent._pathRequestTimeout = currentGameTime;
            agent.requestPath(
                agent.homePosition,
                agent.workPosition,
                null, // Pas d'override node
                null, // Pas d'override node
                'READY_TO_LEAVE_FOR_WORK', // État cible
                currentGameTime
            );
        }
    }
} 