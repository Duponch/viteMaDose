precision mediump float;

varying vec3 vWorldDirection;

// Uniforms existants
uniform vec3 uSunDirection;
uniform float uDayFactor; // Toujours utile pour l'intensité des effets solaires

// NOUVEAUX Uniforms pour les couleurs interpolées en JS
uniform vec3 uCurrentZenithColor;
uniform vec3 uCurrentMiddleColor;
uniform vec3 uCurrentHorizonColor;

// Uniform existant pour l'effet solaire
uniform vec3 uSunInfluenceColor;

// Fonction Lerp
vec3 mixVec3(vec3 a, vec3 b, float t) {
    return a * (1.0 - t) + b * t;
}

void main() {
    vec3 viewDirection = normalize(vWorldDirection);

    // Facteur Y normalisé : 0 = horizon, 0.5 = milieu du ciel, 1 = zénith
    // On utilise directement viewDirection.y qui va de -1 à 1, on le remappe si besoin.
    // Pour simplifier, utilisons smoothstep pour créer les zones de transition.

    // Calcul du gradient à 3 arrêts
    // Interpolation entre Horizon et Milieu (pour viewDirection.y entre ~ -0.2 et 0.6)
    // Interpolation entre Milieu et Zénith (pour viewDirection.y entre ~ 0.6 et 1.0)

    // Facteur de hauteur pour l'interpolation (0 = horizon, 1 = zénith)
    // On utilise une puissance pour compresser le gradient près de l'horizon
    float yFactor = pow(max(0.0, viewDirection.y), 0.6); // Ajustez la puissance (0.6)

    // Position relative de l'arrêt "milieu" (correspond à 0.6 dans l'ancien addColorStop)
    // On peut le mapper sur notre yFactor. Si yFactor=1 est le zénith, 0.6 peut correspondre à yFactor ~0.7 ?
    float middleStop = 0.7; // Position relative du point milieu dans notre gradient [0, 1]

    vec3 skyGradient;
    if (yFactor < middleStop) {
        // Interpolation Horizon -> Milieu
        // Normaliser yFactor dans la plage [0, middleStop] -> [0, 1]
        float t = yFactor / middleStop;
        skyGradient = mixVec3(uCurrentHorizonColor, uCurrentMiddleColor, smoothstep(0.0, 1.0, t));
    } else {
        // Interpolation Milieu -> Zénith
        // Normaliser yFactor dans la plage [middleStop, 1.0] -> [0, 1]
        float t = (yFactor - middleStop) / (1.0 - middleStop);
        skyGradient = mixVec3(uCurrentMiddleColor, uCurrentZenithColor, smoothstep(0.0, 1.0, t));
    }


    // --- Influence du Soleil (Identique à avant) ---
    float dotSun = dot(viewDirection, normalize(uSunDirection));
    float sunHalo = smoothstep(0.95, 1.0, dotSun);
    sunHalo = pow(sunHalo, 10.0) * uDayFactor;
    float sunTint = smoothstep(0.6, 1.0, dotSun);
    sunTint = pow(sunTint, 2.0) * uDayFactor;

    // --- Combinaison (Identique à avant) ---
    vec3 finalColor = skyGradient;
    finalColor = mixVec3(finalColor, uSunInfluenceColor * 1.5, sunTint * 0.4); // Teinte
    finalColor += uSunInfluenceColor * sunHalo * 1.2; // Halo

    gl_FragColor = vec4(finalColor, 1.0);
}