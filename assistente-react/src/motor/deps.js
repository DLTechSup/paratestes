import { GoogleGenAI } from '@google/genai';
import { abrirMic, criarSaida, criarWake, bip } from './audio.js';
import { Motor } from './Motor.js';
import { api } from '../api.js';

export function criarMotorReal() {
  return new Motor({ api, criarGenAI: (apiKey) => new GoogleGenAI({ apiKey }), abrirMic, criarSaida, criarWake, bip });
}
