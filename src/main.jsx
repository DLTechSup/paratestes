import React from 'react';
import { createRoot } from 'react-dom/client';
import NoteWindow from './components/NoteWindow.jsx';
import Manager from './components/Manager.jsx';
import './styles.css';

const hash = window.location.hash.replace(/^#/, '');
const m = hash.match(/^\/note\/(.+)$/);
document.body.dataset.view = m ? 'note' : 'manager';

createRoot(document.getElementById('root')).render(m ? <NoteWindow id={m[1]} /> : <Manager />);
