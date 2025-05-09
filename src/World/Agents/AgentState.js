// src/World/AgentState.js

// Énumération des états possibles pour un agent
const AgentState = {
    IDLE: 'IDLE',
    AT_HOME: 'AT_HOME',
    AT_WORK: 'AT_WORK',
    READY_TO_LEAVE_FOR_WORK: 'READY_TO_LEAVE_FOR_WORK',
    REQUESTING_PATH_FOR_WORK: 'REQUESTING_PATH_FOR_WORK',
    WAITING_FOR_PATH: 'WAITING_FOR_PATH',
    IN_TRANSIT_TO_WORK: 'IN_TRANSIT_TO_WORK',
    READY_TO_LEAVE_FOR_HOME: 'READY_TO_LEAVE_FOR_HOME',
    REQUESTING_PATH_FOR_HOME: 'REQUESTING_PATH_FOR_HOME',
    IN_TRANSIT_TO_HOME: 'IN_TRANSIT_TO_HOME',
    WEEKEND_WALKING: 'WEEKEND_WALKING',
    WEEKEND_WALK_REQUESTING_PATH: 'WEEKEND_WALK_REQUESTING_PATH',
    WEEKEND_WALK_READY: 'WEEKEND_WALK_READY',
    WEEKEND_WALK_RETURNING_TO_SIDEWALK: 'WEEKEND_WALK_RETURNING_TO_SIDEWALK',
    // États pour la gestion des voitures
    DRIVING_TO_WORK: 'DRIVING_TO_WORK',
    DRIVING_HOME: 'DRIVING_HOME',
    // Nouveaux états pour la gestion de l'achat de médicament
    REQUESTING_PATH_FOR_COMMERCIAL: 'REQUESTING_PATH_FOR_COMMERCIAL',
    READY_TO_LEAVE_FOR_COMMERCIAL: 'READY_TO_LEAVE_FOR_COMMERCIAL',
    IN_TRANSIT_TO_COMMERCIAL: 'IN_TRANSIT_TO_COMMERCIAL',
    AT_COMMERCIAL: 'AT_COMMERCIAL',
};

// Exporter l'objet pour qu'il puisse être importé ailleurs
export default AgentState;