import React, { useRef } from 'react';
import { useNiveis } from '../hooks.js';

export default function Orb({ status, motor }) {
  const ref = useRef(null);
  useNiveis(ref, motor);
  return (
    <div className={`orb st-${status}`} ref={ref} aria-hidden="true">
      <div className="orb-brilho" />
      <div className="orb-anel" />
      <div className="orb-anel orb-anel2" />
      <div className="orb-miolo"><div className="orb-reflexo" /></div>
    </div>
  );
}
