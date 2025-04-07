import Experience from './Experience.js';

// Cible le canvas dans notre HTML
const canvas = document.querySelector('canvas.webgl');

// Crée l'instance principale de notre application Three.js
const experience = new Experience(canvas);

// Pour débogage facile dans la console du navigateur
window.experience = experience;