// Checkout.jsx — Orquestador del Checkout: máquina de estados de 3 pasos
// (envío → pago → revisión) + confirmación. Es la parte que me toca entregar
// completa y lista para producción.
import { useRef, useState } from 'react';
import styles from './Checkout.module.css';
import ShippingStep, { validarEnvio } from './ShippingStep.jsx';
import PaymentStep, { validarPago } from './PaymentStep.jsx';
import ReviewStep from './ReviewStep.jsx';
import ConfirmationModal from './ConfirmationModal.jsx';
import OrderSummarySidebar from './OrderSummarySidebar.jsx';
import { useCartStore } from '../../store/useCartStore.js';
import { useToast } from '../../store/useToastStore.js';
import {
  graphqlRequest,
  MUTATION_CREAR_PEDIDO,
  MUTATION_INICIAR_PAGO,
  MUTATION_CANCELAR_PAGO,
  MUTATION_PAGAR_TARJETA_MP,
} from '../../api/client.js';
import { useCartTotals } from '../../hooks/useCartTotals.js';

const PASOS = ['envio', 'pago', 'revision'];
const PASO_LABEL = { envio: 'Envío', pago: 'Pago', revision: 'Revisión' };
const NOMBRE_PASARELA = { paypal: 'PayPal' }; // pasarelas que REDIRIGEN. Mercado Pago se paga aquí mismo.

export default function Checkout({ usuario }) {
  const items = useCartStore((s) => s.items);
  const vaciarCarrito = useCartStore((s) => s.vaciarCarrito);
  const irAHome = () => {
    window.location.href = '/';
  };
  const { showToast } = useToast();

  const [paso, setPaso] = useState('envio');
  const [datos, setDatos] = useState({
    nombreContacto: usuario?.nombre ?? '', emailContacto: usuario?.email ?? '', calle: '', numero: '', ciudad: '', estado: '', cp: '', pais: 'México', telefono: '',
    metodoPago: 'tarjeta', nombreTarjeta: '', numeroTarjeta: '', vencimiento: '', cvv: '',
    mpPago: null, // token de tarjeta de Mercado Pago ya generado (nunca el número de tarjeta)
  });
  const mpRef = useRef(null);
  const { totalConEnvio } = useCartTotals();
  const [validando, setValidando] = useState(false);
  // Pedido ya creado y pendiente de pago (para reintentar con otra tarjeta sin duplicar pedidos)
  const [pedidoPendiente, setPedidoPendiente] = useState(null);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null);
  const [textoEnviando, setTextoEnviando] = useState('');
  const [redirigiendo, setRedirigiendo] = useState(false);

  const onChange = (name, value) => setDatos((prev) => ({ ...prev, [name]: value }));

  const irAPago = () => {
    const errs = validarEnvio(datos);
    setErrores(errs);
    if (Object.keys(errs).length === 0) setPaso('pago');
  };

  const irARevision = async () => {
    const errs = validarPago(datos);
    setErrores(errs);
    if (Object.keys(errs).length > 0) return;

    // Mercado Pago: aquí se valida la tarjeta y se obtiene el token (solo el token sale del navegador).
    if (datos.metodoPago === 'mercadopago' && !datos.mpPago) {
      setValidando(true);
      try {
        const mpPago = await mpRef.current?.tokenizar();
        if (!mpPago) return; // el formulario ya muestra qué campo corregir
        onChange('mpPago', mpPago);
      } finally {
        setValidando(false);
      }
    }
    setPaso('revision');
  };

  const confirmarPedido = async () => {
    setEnviando(true);
    setTextoEnviando('Registrando pedido…');
    setErrorEnvio(null);
    try {
      const input = {
        nombreContacto: datos.nombreContacto,
        emailContacto: datos.emailContacto,
        metodoPago: datos.metodoPago,
        direccion: {
          calle: datos.calle,
          numero: datos.numero || null,
          ciudad: datos.ciudad,
          estado: datos.estado,
          cp: datos.cp,
          pais: datos.pais,
          telefono: datos.telefono,
        },
        items: items.map((i) => ({ productoId: i.id, cantidad: i.cantidad })),
      };

      // Si quedó un pedido pendiente de un intento anterior, se reutiliza solo si sigue siendo con Mercado Pago;
      // si el cliente cambió de método, se cancela (devuelve stock) y se crea uno nuevo.
      let pedidoId;
      let pedidoCreado = null;
      if (pedidoPendiente && datos.metodoPago === 'mercadopago') {
        pedidoId = pedidoPendiente;
      } else {
        if (pedidoPendiente) {
          await graphqlRequest(MUTATION_CANCELAR_PAGO, { pedidoId: pedidoPendiente }).catch(() => {});
          setPedidoPendiente(null);
        }
        const data = await graphqlRequest(MUTATION_CREAR_PEDIDO, { input });
        pedidoId = data.crearPedido.id;
        pedidoCreado = data.crearPedido;
      }

      // Mercado Pago (formulario propio): se cobra con el token, sin redirigir a ningún lado.
      if (datos.metodoPago === 'mercadopago') {
        setPedidoPendiente(pedidoId);
        setTextoEnviando('Procesando pago…');
        const { pagarConTarjetaMP: res } = await graphqlRequest(MUTATION_PAGAR_TARJETA_MP, {
          pedidoId,
          input: {
            token: datos.mpPago.token,
            metodoPagoId: datos.mpPago.metodoPagoId,
            cuotas: datos.mpPago.cuotas,
            emisorId: datos.mpPago.emisorId,
          },
        });

        // SOLO un pago APROBADO completa el pedido.
        setPedidoPendiente(null);
        if (res.aprobado) {
          setPedidoConfirmado(res.pedido);
          vaciarCarrito();
          showToast('¡Pago aprobado!');
        } else {
          // Rechazado o pendiente: el backend ya canceló ese pedido y devolvió el stock.
          // El token ya se gastó, así que hay que capturar la tarjeta otra vez.
          setDatos((prev) => ({ ...prev, mpPago: null }));
          setErrores({ mp: res.mensaje });
          setPaso('pago');
          showToast('Pago rechazado', 'error');
        }
        return;
      }
      const data = { crearPedido: pedidoCreado };

      // PayPal / Mercado Pago: el pedido queda "pendiente de pago" y mandamos al cliente a la pasarela.
      // El carrito NO se vacía aquí: se vacía en /pago/retorno cuando el pago se confirma.
      const pasarela = NOMBRE_PASARELA[datos.metodoPago];
      if (pasarela) {
        setTextoEnviando(`Redirigiendo a ${pasarela}…`);
        try {
          const pago = await graphqlRequest(MUTATION_INICIAR_PAGO, { pedidoId: data.crearPedido.id });
          setRedirigiendo(true);
          window.location.href = pago.iniciarPago.urlPago;
          return;
        } catch (err) {
          // No se pudo abrir la pasarela: se cancela el pedido para devolver el stock.
          await graphqlRequest(MUTATION_CANCELAR_PAGO, { pedidoId: data.crearPedido.id }).catch(() => {});
          throw err;
        }
      }

      setPedidoConfirmado(data.crearPedido);
      vaciarCarrito();
      showToast('¡Pedido registrado con éxito!');
    } catch (err) {
      if (datos.metodoPago === 'mercadopago') {
        // Si falló el cobro, el backend ya canceló el pedido: se vuelve a capturar la tarjeta.
        setPedidoPendiente(null);
        setDatos((prev) => ({ ...prev, mpPago: null }));
        setErrores({ mp: err.message || 'No se pudo procesar el pago. Intenta de nuevo.' });
        setPaso('pago');
        showToast('No se pudo completar el pago', 'error');
        return;
      }
      setErrorEnvio(err.message || 'No se pudo registrar el pedido. Intenta de nuevo.');
      showToast('No se pudo completar el pedido', 'error');
    } finally {
      setEnviando(false);
    }
  };

  if (items.length === 0 && !pedidoConfirmado) {
    return (
      <section className="section">
        <div className="empty-state">
          <p>No hay productos en tu carrito para pagar.</p>
          <button className="btn btn-secondary" onClick={irAHome}>Ver catálogo</button>
        </div>
      </section>
    );
  }

  if (pedidoConfirmado) {
    return (
      <ConfirmationModal
        pedido={pedidoConfirmado}
        onCerrar={() => {
          setPedidoConfirmado(null);
          irAHome();
        }}
      />
    );
  }

  return (
    <div className={styles.wrapper}>
      <div>
        <ul className={styles.stepper}>
          {PASOS.map((p, i) => {
            const idxActual = PASOS.indexOf(paso);
            const estadoPaso = i < idxActual ? styles.stepDone : i === idxActual ? styles.stepActive : '';
            return (
              <li key={p} className={`${styles.step} ${estadoPaso}`}>
                {i + 1}. {PASO_LABEL[p]}
              </li>
            );
          })}
        </ul>

        {paso === 'envio' && (
          <ShippingStep datos={datos} errores={errores} onChange={onChange} onContinuar={irAPago} />
        )}
        {paso === 'pago' && (
          <PaymentStep
            mpRef={mpRef}
            total={totalConEnvio}
            validando={validando}
            datos={datos}
            errores={errores}
            onChange={onChange}
            onContinuar={irARevision}
            onRegresar={() => setPaso('envio')}
          />
        )}
        {paso === 'revision' && (
          <ReviewStep
            datos={datos}
            onRegresar={() => setPaso('pago')}
            onConfirmar={confirmarPedido}
            enviando={enviando || redirigiendo}
            textoEnviando={textoEnviando}
            errorEnvio={errorEnvio}
          />
        )}
      </div>

      <OrderSummarySidebar />
    </div>
  );
}
