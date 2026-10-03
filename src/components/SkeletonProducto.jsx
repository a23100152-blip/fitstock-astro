export default function SkeletonProducto() {
  return (
    <div style={{ padding: "0.5rem" }}>
      <div style={styles.bloque("100%", "220px")} />
      <div style={styles.bloque("60%", "24px")} />
      <div style={styles.bloque("40%", "20px")} />
      <div style={styles.bloque("100%", "60px")} />
    </div>
  );
}

const styles = {
  bloque: (ancho, alto) => ({
    width: ancho,
    height: alto,
    background: "#e0e0e0",
    borderRadius: "6px",
    marginBottom: "0.75rem",
    animation: "pulse 1.2s ease-in-out infinite",
  }),
};
