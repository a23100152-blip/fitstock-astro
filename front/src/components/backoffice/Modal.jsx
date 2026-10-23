// Modal.jsx — Ventana emergente reutilizable para los formularios del BackOffice.
import { useEffect } from 'react';

export default function Modal({ titulo, onCerrar, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal-box bo-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <h3 className="bo-modal-titulo">{titulo}</h3>
        {children}
      </div>
    </div>
  );
}
