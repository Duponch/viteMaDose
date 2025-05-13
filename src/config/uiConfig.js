/**
 * Configuration des états par défaut des interfaces utilisateur
 */
export const defaultUIStates = {
    weather: false,      // WeatherControlUI
    environment: false,  // EnvironmentControlUI
    agentStats: false,  // AgentStatsUI
    fps: false,        // FpsControlUI
    agent: false,      // AgentUI
    debug: false,      // Debug UI
    cityMap: false     // City Map
};

/**
 * Sauvegarde les états des UI dans le localStorage
 * @param {Object} states - Les états actuels des UI
 */
export function saveUIStates(states) {
    localStorage.setItem('uiStates', JSON.stringify(states));
}

/**
 * Charge les états des UI depuis le localStorage
 * @returns {Object} Les états sauvegardés ou les états par défaut
 */
export function loadUIStates() {
    const savedStates = localStorage.getItem('uiStates');
    return savedStates ? JSON.parse(savedStates) : defaultUIStates;
} 