varying vec3 vWorldDirection; // Direction interpolée depuis le vertex shader

uniform vec3 uSunDirection;   // Direction normalisée du soleil
uniform float uDayFactor;     // Facteur jour/nuit (0 = nuit, 1 = plein jour)

// Couleurs de base (vous pouvez les rendre plus complexes)
uniform vec3 uZenithColorDay;
uniform vec3 uHorizonColorDay;
uniform vec3 uZenithColorNight;
uniform vec3 uHorizonColorNight;
uniform vec3 uSunInfluenceColor; // Couleur pour l'effet du soleil (halo, teinte)

// Fonction pour le mix linéaire (lerp)
vec3 mixVec3(vec3 a, vec3 b, float t) {
    return a * (1.0 - t) + b * t;
}

void main() {
    // Normaliser la direction vue depuis la caméra
    vec3 viewDirection = normalize(vWorldDirection);

    // --- Calculer les couleurs de base Jour/Nuit ---
    vec3 zenithColor = mixVec3(uZenithColorNight, uZenithColorDay, uDayFactor);
    vec3 horizonColor = mixVec3(uHorizonColorNight, uHorizonColorDay, uDayFactor);

    // --- Calculer le gradient du ciel basé sur la hauteur ---
    // viewDirection.y va de -1 (bas) à +1 (haut)
    // On le mappe sur 0 (horizon) à 1 (zénith)
    float skyFactor = smoothstep(0.0, 0.6, viewDirection.y); // Ajustez 0.6 pour la transition
    vec3 skyGradient = mixVec3(horizonColor, zenithColor, skyFactor);

    // --- Calculer l'influence du soleil ---
    // Angle entre la direction du pixel et la direction du soleil
    float dotSun = dot(viewDirection, normalize(uSunDirection)); // Assurer que uSunDirection est normalisé

    // Halo du soleil (plus fort quand on regarde vers le soleil)
    float sunHalo = smoothstep(0.95, 1.0, dotSun); // Halo très proche du soleil
    sunHalo = pow(sunHalo, 10.0) * uDayFactor; // Plus intense et visible seulement le jour

    // Teinte générale du ciel près du soleil (plus large)
    float sunTint = smoothstep(0.6, 1.0, dotSun);
    sunTint = pow(sunTint, 2.0) * uDayFactor; // Moins intense que le halo

    // --- Combiner les couleurs ---
    // Commence avec le gradient de base
    vec3 finalColor = skyGradient;

    // Ajoute la teinte du soleil (mélange la couleur d'influence)
    finalColor = mixVec3(finalColor, uSunInfluenceColor * 1.5, sunTint * 0.4); // Ajustez les multiplicateurs

    // Ajoute le halo brillant (additionne la couleur d'influence)
    finalColor += uSunInfluenceColor * sunHalo * 1.2; // Ajustez le multiplicateur

    // Simuler une légère diffusion atmosphérique à l'horizon au lever/coucher
    // (Optionnel, plus avancé)
    // float horizonScatter = pow(max(0.0, viewDirection.y), 0.5) * (1.0 - uDayFactor); // Plus fort la nuit? Non plutôt jour
    // vec3 scatterColor = vec3(1.0, 0.6, 0.2) * uSunDirection.y * uDayFactor; // Couleur chaude si soleil bas
    // finalColor = mix(finalColor, scatterColor, smoothstep(0.0, 0.1, viewDirection.y) * 0.5);


    gl_FragColor = vec4(finalColor, 1.0);
}