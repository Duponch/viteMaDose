// src/UI/BuildingLODControlUI.js

/**
 * Interface utilisateur pour contrôler le système LOD des bâtiments
 */
export default class BuildingLODControlUI {
    constructor(experience) {
        this.experience = experience;
        this.isVisible = false;
        this.container = null;
        this.stats = null;
        
        this.createUI();
        this.bindEvents();
        
        // Mise à jour des statistiques toutes les secondes
        this.statsUpdateInterval = setInterval(() => {
            this.updateStats();
        }, 1000);
    }

    createUI() {
        // Conteneur principal
        this.container = document.createElement('div');
        this.container.className = 'building-lod-control';
        this.container.style.cssText = `
            position: fixed;
            top: 120px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            min-width: 280px;
            z-index: 1000;
            display: none;
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        `;
        this.container.setAttribute('data-ui-interactive', 'true');

        // Titre
        const title = document.createElement('h3');
        title.textContent = 'Building LOD System';
        title.style.cssText = `
            margin: 0 0 15px 0;
            color: #4CAF50;
            border-bottom: 1px solid rgba(255, 255, 255, 0.3);
            padding-bottom: 5px;
            font-size: 14px;
        `;
        this.container.appendChild(title);

        // Section des statistiques
        const statsSection = document.createElement('div');
        statsSection.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #FFC107; font-size: 12px;">Statistics</h4>
            <div id="lod-stats" style="margin-bottom: 15px; line-height: 1.4;"></div>
        `;
        this.container.appendChild(statsSection);
        this.stats = this.container.querySelector('#lod-stats');

        // Section des contrôles
        const controlsSection = document.createElement('div');
        controlsSection.innerHTML = `
            <h4 style="margin: 0 0 10px 0; color: #FFC107; font-size: 12px;">LOD Distances</h4>
        `;
        this.container.appendChild(controlsSection);

        // Contrôles des distances
        this.createDistanceControl(controlsSection, 'High Detail', 'highDetailDistance', 10, 100, 50);
        this.createDistanceControl(controlsSection, 'Medium Detail', 'mediumDetailDistance', 50, 300, 150);
        this.createDistanceControl(controlsSection, 'Low Detail', 'lowDetailDistance', 100, 500, 300);
        this.createDistanceControl(controlsSection, 'Cull Distance', 'cullDistance', 200, 1000, 500);

        // Bouton de fermeture
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            cursor: pointer;
            width: 25px;
            height: 25px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        closeButton.onclick = () => this.hide();
        this.container.appendChild(closeButton);

        document.body.appendChild(this.container);
    }

    createDistanceControl(parent, label, property, min, max, defaultValue) {
        const controlGroup = document.createElement('div');
        controlGroup.style.cssText = 'margin-bottom: 10px;';

        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.style.cssText = `
            display: block;
            margin-bottom: 3px;
            font-size: 11px;
            color: #ddd;
        `;
        controlGroup.appendChild(labelElement);

        const sliderContainer = document.createElement('div');
        sliderContainer.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min;
        slider.max = max;
        slider.value = defaultValue;
        slider.style.cssText = `
            flex: 1;
            height: 4px;
            background: #333;
            outline: none;
            border-radius: 2px;
        `;

        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = `${defaultValue}m`;
        valueDisplay.style.cssText = `
            min-width: 40px;
            font-size: 10px;
            color: #aaa;
        `;

        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            valueDisplay.textContent = `${value}m`;
            this.updateLODDistance(property, value);
        });

        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);
        controlGroup.appendChild(sliderContainer);
        parent.appendChild(controlGroup);
    }

    updateLODDistance(property, value) {
        if (this.experience.world?.cityManager) {
            const distances = {};
            distances[property] = value;
            this.experience.world.cityManager.setLODDistances(distances);
        }
    }

    updateStats() {
        if (!this.isVisible || !this.stats) return;

        const stats = this.experience.world?.cityManager?.getLODStats();
        if (stats) {
            const total = stats.totalBuildings;
            const distribution = stats.lodDistribution;
            
            this.stats.innerHTML = `
                <div style="color: #4CAF50;">Total Buildings: ${total}</div>
                <div style="margin-top: 5px;">
                    <div style="color: #2196F3;">High Detail: ${distribution[0] || 0}</div>
                    <div style="color: #FF9800;">Medium Detail: ${distribution[1] || 0}</div>
                    <div style="color: #F44336;">Low Detail (Cubes): ${distribution[2] || 0}</div>
                    <div style="color: #9E9E9E;">Culled: ${distribution[3] || 0}</div>
                </div>
                <div style="margin-top: 5px; font-size: 10px; color: #888;">
                    Performance: ${total > 0 ? Math.round(((distribution[2] || 0) + (distribution[3] || 0)) / total * 100) : 0}% optimized
                </div>
            `;
        } else {
            this.stats.innerHTML = '<div style="color: #F44336;">LOD System not available</div>';
        }
    }

    bindEvents() {
        // Raccourci clavier pour afficher/masquer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'L' && e.ctrlKey) {
                e.preventDefault();
                this.toggle();
            }
        });
    }

    show() {
        if (this.container) {
            this.container.style.display = 'block';
            this.isVisible = true;
            this.updateStats();
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
            this.isVisible = false;
        }
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    destroy() {
        if (this.statsUpdateInterval) {
            clearInterval(this.statsUpdateInterval);
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}