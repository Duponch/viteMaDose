export default class VehicleController {
    /**
     * @param {import('./AgentContext').default} ctx
     */
    constructor(ctx) {
        this.ctx = ctx;
        this.currentVehicle = null;
    }

    enter(vehicle) {
        this.currentVehicle = vehicle;
        this.ctx.isInVehicle = true;
        // TODO : cacher la représentation piéton, activer la voiture…
    }

    exit() {
        // TODO : positionner l'agent au point de sortie, gérer l'animation…
        this.currentVehicle = null;
        this.ctx.isInVehicle = false;
    }
} 