import * as THREE from 'three';

export const GodRaysFakeSunShader = {
    uniforms: {
        'vSunPositionScreenSpace': { value: new THREE.Vector3() },
        'fAspect': { value: 1.0 },
        'sunColor': { value: new THREE.Color(0xffee00) },
        'bgColor': { value: new THREE.Color(0x000511) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec3 vSunPositionScreenSpace;
        uniform float fAspect;
        uniform vec3 sunColor;
        uniform vec3 bgColor;
        varying vec2 vUv;
        
        void main() {
            vec2 diff = vUv - vSunPositionScreenSpace.xy;
            diff.x *= fAspect;
            float prop = clamp(length(diff) / 0.2, 0.0, 1.0);
            prop = 0.35 * pow(1.0 - 0.93 * prop, 3.0);
            gl_FragColor = vec4(mix(bgColor, sunColor, 1.0 - prop), 1.0);
        }
    `
};

export const GodRaysDepthMaskShader = {
    uniforms: {
        'tInput': { value: null }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tInput;
        varying vec2 vUv;
        
        void main() {
            vec4 val = texture2D(tInput, vUv);
            gl_FragColor = val;
        }
    `
};

export const GodRaysGenerateShader = {
    uniforms: {
        'tInput': { value: null },
        'fStepSize': { value: 1.0 },
        'vSunPositionScreenSpace': { value: new THREE.Vector3() }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tInput;
        uniform float fStepSize;
        uniform vec3 vSunPositionScreenSpace;
        varying vec2 vUv;
        
        void main() {
            vec2 delta = vUv - vSunPositionScreenSpace.xy;
            float dist = length(delta);
            delta = normalize(delta) * fStepSize;
            float illuminationDecay = 1.0;
            float samples = 100.0;
            float scale = 1.0 / samples;
            vec4 color = vec4(0.0);
            
            vec2 currentUv = vUv;
            
            for (float i = 0.0; i < samples; i++) {
                currentUv -= delta;
                vec4 texel = texture2D(tInput, currentUv);
                texel *= illuminationDecay * scale;
                color += texel;
                illuminationDecay *= 0.97;
            }
            
            gl_FragColor = color;
        }
    `
};

export const GodRaysCombineShader = {
    uniforms: {
        'tColors': { value: null },
        'tGodRays': { value: null },
        'fGodRayIntensity': { value: 0.75 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tColors;
        uniform sampler2D tGodRays;
        uniform float fGodRayIntensity;
        varying vec2 vUv;
        
        void main() {
            vec4 color = texture2D(tColors, vUv);
            vec4 godrays = texture2D(tGodRays, vUv);
            gl_FragColor = color + godrays * fGodRayIntensity;
        }
    `
}; 