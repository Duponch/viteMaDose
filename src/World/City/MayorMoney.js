export default class MayorMoney {
    constructor() {
        this.money = 0;
    }

    /**
     * Ajoute de l'argent au compte du maire
     * @param {number} amount - Le montant à ajouter
     */
    addMoney(amount) {
        if (amount > 0) {
            this.money += amount;
        }
    }

    /**
     * Retourne l'argent actuel du maire
     * @returns {number} - Le montant d'argent du maire
     */
    getMoney() {
        return this.money;
    }
} 