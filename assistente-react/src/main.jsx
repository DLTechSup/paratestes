import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { motor } from './hooks.js';

if (/[?&]demo/.test(location.search)) { window.__motor = motor(); window.__vosk = () => import('vosk-browser'); } // só na pré-visualização

createRoot(document.getElementById('raiz')).render(<App />);
