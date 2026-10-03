// ProductDetail.jsx — Tema: portales + fetching + useTransition.
// Parte robusta hecha para el módulo de Ficha de producto: se muestra como
// modal encima del catálogo (no navega a otra pantalla), valida cantidad
// contra el stock real, y reintenta si la consulta falla.
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { graphqlRequest, QUERY_PRODUCTO } from '../api/client';
import { resolveImage } from '../data/imageMap';
import { useCartStore } from '../store/useCartStore';
import SkeletonProducto from './SkeletonProducto';

// El campo infoNutricional llega como JSON crudo desde el backend y su
// forma cambia según la categoría: { tallas: [...] } para ropa/accesorios,
// o claves nutrimentales (porcion, proteina, calorias, etc.) para suplementos.
function renderInfoExtra(infoNutricionalRaw) {
  if (!infoNutricionalRaw) return null;

  let info;
  try {
    info = JSON.parse(infoNutricionalRaw);
  } catch {
    return <p>{infoNutricionalRaw}</p>;
  }

  if (Array.isArray(info.tallas)) {
    return <p>📏 Tallas disponibles: {info.tallas.join(', ')}</p>;
  }

  const claves = Object.keys(info);
  if (claves.length === 0) return null;

  return (
    <p>
      🥤 Info nutricional:{' '}
      {claves.map((k, i) => (
        <span key={k}>
          {k}: {info[k]}
          {i < claves.length - 1 ? ' · ' : ''}
        </span>
      ))}
    </p>
  );
}

export default function ProductDetail({ productoId, onCerrar, onAgregado }) {
  const [producto, setProducto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [isPending, startTransition] = useTransition();
  const addItem = useCartStore((s) => s.addItem);

  const cargarProducto = () => {
    setCargando(true);
    setError(null);
    graphqlRequest(QUERY_PRODUCTO, { id: productoId })
      .then((data) => {
        if (!data.producto) {
          setError('No encontramos este producto.');
        } else {
          setProducto(data.producto);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarProducto();
    setCantidad(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId]);

  const handleAgregar = () => {
    startTransition(() => {
      addItem(producto, cantidad);
      onAgregado();
    });
  };

  const imagen = producto ? resolveImage(producto.imagenUrl) : null;

  const contenido = (
    <div className="modal-overlay" onClick={onCerrar} role="presentation">
      <div
        className="modal-box"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de producto"
      >
        <button onClick={onCerrar} className="modal-close" aria-label="Cerrar">
          ✕
        </button>

        {cargando && <SkeletonProducto />}

        {!cargando && error && (
          <>
            <p style={{ color: 'var(--color-danger)' }}>{error}</p>
            <button className="btn btn-secondary" onClick={cargarProducto}>Reintentar</button>
          </>
        )}

        {!cargando && !error && producto && (
          <>
            {imagen && (
              <img
                src={imagen}
                alt={producto.nombre}
                style={{ width: '100%', height: '220px', objectFit: 'contain', background: '#f2f2f2', borderRadius: 8, marginBottom: 16 }}
              />
            )}

            <h2 style={{ marginTop: 0 }}>{producto.nombre}</h2>
            <p style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>
              ${producto.precio.toFixed(2)}
            </p>
            <p style={{ color: 'var(--color-text-dim)' }}>Categoría: {producto.categoria.nombre}</p>
            {producto.descripcion && <p>{producto.descripcion}</p>}

            {renderInfoExtra(producto.infoNutricional)}

            <p>
              {producto.stock > 0 ? `${producto.stock} disponibles` : 'Sin stock por el momento'}
            </p>

            <label style={{ display: 'block', margin: '0.75rem 0' }}>
              Cantidad:{' '}
              <input
                type="number"
                min={1}
                max={producto.stock}
                value={cantidad}
                onChange={(e) =>
                  setCantidad(Math.max(1, Math.min(producto.stock, Number(e.target.value) || 1)))
                }
                disabled={producto.stock === 0}
                style={{ width: '60px' }}
              />
            </label>

            <button
              onClick={handleAgregar}
              disabled={producto.stock === 0 || isPending}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {isPending ? 'Agregando...' : 'Agregar al carrito'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(contenido, document.getElementById('modal-root') || document.body);
}
