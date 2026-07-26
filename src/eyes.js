// Eye → three.js layer mapping. In WebXR, three enables layer 1 on the
// left-eye camera and layer 2 on the right-eye camera; layer 0 is both.
import config from './config.js';

export const LAYER_BOTH = 0;
export const LAYER_LEFT = 1;
export const LAYER_RIGHT = 2;

export const weakLayer = config.amblyopicEye === 'left' ? LAYER_LEFT : LAYER_RIGHT;
export const strongLayer = config.amblyopicEye === 'left' ? LAYER_RIGHT : LAYER_LEFT;

export const weakEyeName = config.amblyopicEye;
export const strongEyeName = config.amblyopicEye === 'left' ? 'right' : 'left';
