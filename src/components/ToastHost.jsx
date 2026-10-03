// ToastHost.jsx — Dibuja las notificaciones. Se monta una sola vez en el Layout.
import { useToastStore } from '../store/useToastStore';

export default function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 200 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: t.tipo === 'error' ? '#2e1f0a' : '#2a1208',
            border: `1px solid ${t.tipo === 'error' ? '#ffb020' : '#ff4425'}`,
            color: '#eef1f6',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: '0.9rem',
            minWidth: 220,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          {t.mensaje}
        </div>
      ))}
    </div>
  );
}
