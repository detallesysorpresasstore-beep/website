/**
 * Detalles y Sorpresas STORE - Lógica Central del Panel de Administración
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { collection, addDoc, getDocs, onSnapshot, deleteDoc, doc, updateDoc, getDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// NOTA: Rotar esta clave en imgbb.com/account/settings y usar una Cloud Function como proxy.
const IMGBB_API_KEY = 'be437e8baf8925c075326d5b9ca91016';

// ==========================================
// SEGURIDAD: Sanitización contra XSS
// ==========================================
function sanitize(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}


// ==========================================
// SISTEMA DE NOTIFICACIONES (reemplaza alert/confirm nativos)
// ==========================================
function showToast(mensaje, tipo = 'info', duracion = 4000) {
    const colores = {
        success: 'border-green-500 bg-green-50 text-green-800',
        error:   'border-red-500 bg-red-50 text-red-800',
        warning: 'border-brand-orange bg-orange-50 text-orange-800',
        info:    'border-brand-blue bg-blue-50 text-blue-800'
    };
    const iconos = {
        success: 'ph-fill ph-check-circle text-green-500',
        error:   'ph-fill ph-warning-circle text-red-500',
        warning: 'ph-fill ph-warning text-brand-orange',
        info:    'ph-fill ph-info text-brand-blue'
    };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-[999] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl border-l-4 ${colores[tipo]} max-w-sm w-[90vw] transition-all duration-300 translate-y-4 opacity-0`;
    toast.innerHTML = `<i class="${iconos[tipo]} text-xl shrink-0 mt-0.5"></i><p class="text-sm font-medium leading-snug">${mensaje}</p>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.remove('translate-y-4','opacity-0'); });
    setTimeout(() => {
        toast.classList.add('translate-y-4','opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, duracion);
}

function showConfirm(mensaje, onConfirm, textoBtn = 'Confirmar', tipoPeligroso = false) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-[998] flex items-center justify-center p-4 backdrop-blur-sm';
    const colorBtn = tipoPeligroso ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-orange hover:bg-orange-500';
    overlay.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div class="flex items-start gap-3">
                <i class="ph-fill ph-${tipoPeligroso ? 'warning-circle text-red-500' : 'question text-brand-orange'} text-2xl shrink-0 mt-0.5"></i>
                <p class="text-gray-700 font-medium leading-snug">${mensaje}</p>
            </div>
            <div class="flex justify-end gap-3 mt-2">
                <button id="confirm-cancel" class="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
                <button id="confirm-ok" class="${colorBtn} text-white font-bold px-4 py-2 rounded-lg transition-colors shadow-sm">${textoBtn}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); onConfirm(); };
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}


// ==========================================
// UTILIDAD: Debounce para buscadores
// ==========================================
function debounce(fn, delay = 250) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ==========================================
// MÓDULO: DASHBOARD CON KPIs (TIEMPO REAL)
// ==========================================
// Antes hacía su propio getDocs(); ahora renderiza a partir de los globales
// pedidosGlobales (mantenido por el onSnapshot de cargarPedidos) y
// productosGlobales (recargado por cargarProductos). Se invoca desde el
// snapshot de pedidos y tras recargar productos, así los KPIs se actualizan
// solos cuando llegan pedidos nuevos, sin duplicar listeners ni lecturas.

function renderDashboard() {
    // Si la vista del dashboard no está en el DOM, no hay nada que renderizar
    if (!document.getElementById('kpi-ventas-hoy')) return;
    try {
        const pedidos = pedidosGlobales;
        const productos = productosGlobales;

        const hoy = new Date();
        const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

        const pedidosHoy = pedidos.filter(p => p.fecha && new Date(p.fecha) >= inicioHoy);
        const pedidosMes = pedidos.filter(p => p.fecha && new Date(p.fecha) >= inicioMes);
        const pendientes = pedidos.filter(p => p.estado === 'Pendiente');
        const stockBajo = productos.filter(p => (p.stock !== undefined ? p.stock : 10) <= 3 && p.stock > 0);
        const sinStock = productos.filter(p => p.stock === 0);

        const ventasHoy = pedidosHoy.reduce((s, p) => s + (p.totalUSD || 0), 0);
        const ventasMes = pedidosMes.reduce((s, p) => s + (p.totalUSD || 0), 0);

        // KPI cards
        document.getElementById('kpi-ventas-hoy').textContent = `$${ventasHoy.toFixed(2)}`;
        document.getElementById('kpi-ventas-mes').textContent = `$${ventasMes.toFixed(2)}`;
        document.getElementById('kpi-pedidos-pendientes').textContent = pendientes.length;
        document.getElementById('kpi-stock-bajo').textContent = stockBajo.length + sinStock.length;

        // Badge en el menú de stock bajo
        const badgeStock = document.getElementById('badge-stock-bajo');
        if (badgeStock) {
            const total = stockBajo.length + sinStock.length;
            badgeStock.textContent = total;
            badgeStock.classList.toggle('hidden', total === 0);
        }

        // Gráfica de ventas últimos 7 días
        const labels = [];
        const datosVentas = [];
        for (let i = 6; i >= 0; i--) {
            const dia = new Date(hoy);
            dia.setDate(hoy.getDate() - i);
            const inicioDia = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate());
            const finDia   = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1);
            const ventasDia = pedidos
                .filter(p => p.fecha && new Date(p.fecha) >= inicioDia && new Date(p.fecha) < finDia)
                .reduce((s, p) => s + (p.totalUSD || 0), 0);
            labels.push(dia.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }));
            datosVentas.push(parseFloat(ventasDia.toFixed(2)));
        }

        const ctx = document.getElementById('chart-ventas');
        if (ctx) {
            if (window._chartVentas) window._chartVentas.destroy();
            window._chartVentas = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{
                        label: 'Ventas USD',
                        data: datosVentas,
                        backgroundColor: 'rgba(79, 172, 254, 0.7)',
                        borderColor: '#4facfe',
                        borderWidth: 1,
                        borderRadius: 6,
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: v => '$' + v } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // Lista de stock crítico
        const listaStockCritico = document.getElementById('lista-stock-critico');
        if (listaStockCritico) {
            if (stockBajo.length === 0 && sinStock.length === 0) {
                listaStockCritico.innerHTML = '<li class="text-center text-gray-400 py-4 text-sm">Todo el inventario está en niveles normales.</li>';
            } else {
                listaStockCritico.innerHTML = [...sinStock, ...stockBajo].map(p => {
                    const img = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : '';
                    const color = p.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
                    const label = p.stock === 0 ? 'Sin stock' : `${p.stock} uds`;
                    return `<li class="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                        ${img ? `<img src="${img}" class="w-10 h-10 rounded-lg object-cover border border-gray-100">` : '<div class="w-10 h-10 rounded-lg bg-gray-100"></div>'}
                        <div class="flex-1 min-w-0"><p class="text-sm font-medium text-gray-800 truncate">${sanitize(p.nombre)}</p><p class="text-xs text-gray-500">${sanitize(p.categoria)}</p></div>
                        <span class="text-xs font-bold px-2 py-1 rounded-full ${color}">${label}</span>
                    </li>`;
                }).join('');
            }
        }

        // Últimos 5 pedidos pendientes
        const listaPendientes = document.getElementById('lista-pedidos-pendientes');
        if (listaPendientes) {
            const recientes = pendientes.sort((a,b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, 5);
            if (recientes.length === 0) {
                listaPendientes.innerHTML = '<li class="text-center text-gray-400 py-4 text-sm">No hay pedidos pendientes.</li>';
            } else {
                listaPendientes.innerHTML = recientes.map(p => `
                    <li class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 px-2 rounded-lg transition-colors" onclick="abrirModalPedido('${p.id}')">
                        <div>
                            <span class="text-sm font-bold text-gray-800">#${p.id.slice(-6).toUpperCase()}</span>
                            <span class="text-xs text-gray-500 ml-2">${sanitize(p.clienteNombre)}</span>
                        </div>
                        <span class="text-sm font-bold text-gray-800">$${(p.totalUSD || 0).toFixed(2)}</span>
                    </li>`).join('');
            }
        }

    } catch (error) {
        console.error("Error renderizando dashboard:", error);
    }
}

// Compatibilidad + Tarea 2: refresco manual del dashboard (al navegar a la vista)
window.cargarDashboard = renderDashboard;

// ==========================================
// MÓDULO: EXPORTAR REPORTE DE VENTAS
// ==========================================

window.exportarReporteVentas = () => {
    const fechaDesde = document.getElementById('reporte-fecha-desde')?.value;
    const fechaHasta = document.getElementById('reporte-fecha-hasta')?.value;

    let filtrados = pedidosGlobales.filter(p => p.estado !== 'Cancelado');

    if (fechaDesde) filtrados = filtrados.filter(p => p.fecha && p.fecha.split('T')[0] >= fechaDesde);
    if (fechaHasta) filtrados = filtrados.filter(p => p.fecha && p.fecha.split('T')[0] <= fechaHasta);

    if (filtrados.length === 0) { showToast("No hay pedidos en ese rango para exportar.", "warning"); return; }

    const totalUSD = filtrados.reduce((s, p) => s + (p.totalUSD || 0), 0);

    const filas = filtrados.map(p => ({
        "ID Orden": "#" + p.id.slice(-6).toUpperCase(),
        "Fecha": p.fecha ? new Date(p.fecha).toLocaleDateString('es-VE') : 'N/A',
        "Cliente": p.clienteNombre || 'Sin nombre',
        "Email": p.clienteEmail || '',
        "Método de Pago": p.metodoPago || '',
        "Total USD": parseFloat((p.totalUSD || 0).toFixed(2)),
        "Moneda Secundaria": p.monedaSecundaria || 'USD',
        "Total Secundario": parseFloat((p.totalSecundario || 0).toFixed(2)),
        "Estado": p.estado,
        "Productos": (p.productos || []).map(x => `${x.nombre} x${x.cantidad}`).join(', '),
    }));

    filas.push({
        "ID Orden": "TOTAL",
        "Fecha": "", "Cliente": "", "Email": "", "Método de Pago": "",
        "Total USD": parseFloat(totalUSD.toFixed(2)),
        "Moneda Secundaria": "", "Total Secundario": "", "Estado": "", "Productos": ""
    });

    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Ventas");
    const nombre = `Reporte_Ventas${fechaDesde ? '_'+fechaDesde : ''}${fechaHasta ? '_al_'+fechaHasta : ''}.xlsx`;
    XLSX.writeFile(libro, nombre);
    showToast(`Reporte exportado: ${filtrados.length} pedidos.`, "success");
};


// ==========================================
// MÓDULO: IMPORTACIÓN MASIVA DE PRODUCTOS
// ==========================================

window.procesarImportacionExcel = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja);

        if (filas.length === 0) { showToast("El archivo está vacío.", "warning"); return; }

        const camposRequeridos = ['nombre', 'categoria', 'precio', 'stock'];
        const primeraFila = Object.keys(filas[0]).map(k => k.toLowerCase());
        const faltantes = camposRequeridos.filter(c => !primeraFila.includes(c));
        if (faltantes.length > 0) {
            showToast(`Faltan columnas: ${faltantes.join(', ')}`, "error", 5000);
            return;
        }

        showConfirm(
            `¿Importar ${filas.length} producto(s) desde el Excel? Se agregarán como nuevos productos.`,
            async () => {
                let importados = 0;
                let errores = 0;
                for (const fila of filas) {
                    try {
                        const keys = Object.fromEntries(Object.entries(fila).map(([k,v]) => [k.toLowerCase(), v]));
                        if (!keys.nombre || !keys.categoria || !keys.precio) { errores++; continue; }
                        await addDoc(productsCollection, {
                            nombre:      String(keys.nombre).trim(),
                            categoria:   String(keys.categoria).trim(),
                            subcategoria: String(keys.subcategoria || 'General').trim(),
                            precio:      parseFloat(keys.precio) || 0,
                            stock:       parseInt(keys.stock) || 0,
                            descripcion: String(keys.descripcion || '').trim(),
                            imagenes:    [],
                            descuento:   0,
                            fechaCreacion: new Date().toISOString(),
                            fechaActualizacion: new Date().toISOString(),
                        });
                        importados++;
                    } catch (e) { errores++; }
                }
                document.getElementById('modal-importacion')?.classList.add('hidden');
                event.target.value = '';
                showToast(`${importados} producto(s) importados.${errores > 0 ? ` ${errores} con errores.` : ''}`, importados > 0 ? "success" : "warning", 5000);
                cargarProductos();
            },
            "Importar",
            false
        );
    } catch (e) {
        showToast("Error leyendo el archivo Excel.", "error");
        console.error(e);
    }
};

window.descargarPlantillaExcel = () => {
    const plantilla = [{ nombre: "Ejemplo Producto", categoria: "Ropa Niña", subcategoria: "Vestidos", precio: 12.50, stock: 10, descripcion: "Descripción opcional" }];
    const hoja = XLSX.utils.json_to_sheet(plantilla);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Productos");
    XLSX.writeFile(libro, "Plantilla_Importacion.xlsx");
};

// ==========================================
// REFERENCIAS DEL DOM
// ==========================================

const btnLogout = document.getElementById('btn-logout');

// Productos
const modalProducto = document.getElementById('modal-producto');
const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const btnExportarProductos = document.getElementById('btn-exportar-productos');
const selectProdCategoria = document.getElementById('prod-categoria');
const buscadorProductos = document.getElementById('buscador-productos');
const filtroCategoria = document.getElementById('filtro-categoria');
const filtroSubcategoria = document.getElementById('filtro-subcategoria');

// Categorías y Subcategorías
const modalCategoria = document.getElementById('modal-categoria');
const btnNuevaCategoria = document.getElementById('btn-nueva-categoria');
const btnGuardarCategoria = document.getElementById('btn-guardar-categoria');
const buscadorCategorias = document.getElementById('buscador-categorias'); 
const modalSubcategoria = document.getElementById('modal-subcategoria');
const btnNuevaSubcategoria = document.getElementById('btn-nueva-subcategoria');
const btnGuardarSubcategoria = document.getElementById('btn-guardar-subcategoria');
const selectSubcatParent = document.getElementById('subcat-parent');

// Pedidos y Clientes
const modalPedido = document.getElementById('modal-pedido');
const filtroFechaPedidos = document.getElementById('filtro-fecha-pedidos'); 
const filtroEstadoPedidos = document.getElementById('filtro-estado-pedidos'); 
const btnExportarClientes = document.getElementById('btn-exportar-clientes');
const buscadorClientes = document.getElementById('buscador-clientes'); 
const filtroRolClientes = document.getElementById('filtro-rol-clientes'); 
const filtroFechaClientes = document.getElementById('filtro-fecha-clientes'); 

// Tasas y Métodos de Pago
const btnGuardarTasas = document.getElementById('btn-guardar-tasas');
const modalPago = document.getElementById('modal-pago');
const btnNuevoPago = document.getElementById('btn-nuevo-pago');
const btnGuardarPago = document.getElementById('btn-guardar-pago');

// Promociones (Upsell)
const modalPromocion = document.getElementById('modal-promocion');
const btnNuevaPromocion = document.getElementById('btn-nueva-promocion');
const btnGuardarPromocion = document.getElementById('btn-guardar-promocion');
const promoOfertaCategoria = document.getElementById('promo-oferta-categoria');
const promoOfertaSubcategoria = document.getElementById('promo-oferta-subcategoria');
const promoOfertaProducto = document.getElementById('promo-oferta-producto');

// Ofertas Directas (NUEVO)
const modalOferta = document.getElementById('modal-oferta');
const btnNuevaOferta = document.getElementById('btn-nueva-oferta');
const btnGuardarOferta = document.getElementById('btn-guardar-oferta');
const buscadorOfertaProducto = document.getElementById('buscador-oferta-producto');
const filtroOfertaCategoria = document.getElementById('filtro-oferta-categoria');
const listaOfertaProductos = document.getElementById('lista-oferta-productos');
const inputOfertaProductoId = document.getElementById('oferta-producto-id');
const inputOfertaDescuento = document.getElementById('oferta-descuento');

// Colecciones en Firestore
const productsCollection = collection(db, "products");
const categoriesCollection = collection(db, "categories");
const ordersCollection = collection(db, "orders");
const usersCollection = collection(db, "users"); 
const paymentsCollection = collection(db, "payment_methods"); 
const promosCollection = collection(db, "promotions");
const reviewsCollection = collection(db, "reviews");
const configDocRef = doc(db, "config", "store_settings");

// Variables Globales
let productosGlobales = [];
let productosFiltrados = [];
let categoriasGlobales = []; 
let pedidosGlobales = []; 
let clientesGlobales = []; 
let clientesFiltrados = []; 
let pagosGlobales = []; 
let promosGlobales = [];
let arrayImagenesUrls = [];
let variantesProducto = []; // Variantes del producto en edición (Tarea 5)
let resenasGlobales = [];   // Reseñas cargadas (Tarea 7)

// ==========================================
// INICIALIZACIÓN Y SEGURIDAD
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    verificarSeguridad();
    configurarEventos();
    
    cargarTasas(); 
    cargarPagos();
    
    cargarCategorias().then(() => {
        cargarProductos().then(() => {
            cargarPromociones(); 
        });
    });
    
    cargarPedidos();
    cargarClientes();
    cargarResenas(); // Tarea 7: carga reseñas y el badge de pendientes
    renderDashboard();
});

function verificarSeguridad() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data().role !== 'admin') {
                await signOut(auth);
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error("Error verificando rol de administrador:", error);
            window.location.href = 'index.html';
        }
    });
}

function configurarEventos() {
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (confirm("¿Seguro que deseas cerrar sesión?")) {
                await signOut(auth); window.location.href = 'index.html';
            }
        });
    }

    btnNuevoProducto.addEventListener('click', () => { resetearModalProducto("Añadir Nuevo Producto"); modalProducto.classList.remove('hidden'); });
    document.getElementById('btn-cerrar-modal-prod').addEventListener('click', () => modalProducto.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-prod').addEventListener('click', () => modalProducto.classList.add('hidden'));
    document.getElementById('prod-imagen').addEventListener('change', manejarSubidaMultiplesImagenes);
    document.getElementById('btn-agregar-variante')?.addEventListener('click', () => agregarFilaVariante());
    document.getElementById('prod-tipo-inventario')?.addEventListener('change', () => { variantesProducto = []; aplicarTipoInventario(); });
    btnGuardarProducto.addEventListener('click', guardarProducto);
    if (btnExportarProductos) btnExportarProductos.addEventListener('click', exportarProductosExcel);
    selectProdCategoria.addEventListener('change', (e) => actualizarSelectSubcategoriasFormulario(e.target.value));
    buscadorProductos.addEventListener('input', debounce(aplicarFiltrosProductos));
    filtroCategoria.addEventListener('change', () => { actualizarSelectSubcategoriasFiltro(); aplicarFiltrosProductos(); });
    filtroSubcategoria.addEventListener('change', aplicarFiltrosProductos);

    btnNuevaCategoria.addEventListener('click', () => { document.getElementById('form-categoria').reset(); modalCategoria.classList.remove('hidden'); });
    document.getElementById('btn-cerrar-modal-cat').addEventListener('click', () => modalCategoria.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-cat').addEventListener('click', () => modalCategoria.classList.add('hidden'));
    btnGuardarCategoria.addEventListener('click', guardarCategoria);
    if (buscadorCategorias) buscadorCategorias.addEventListener('input', debounce(aplicarFiltrosCategorias));

    if (btnNuevaSubcategoria) { btnNuevaSubcategoria.addEventListener('click', () => { document.getElementById('form-subcategoria').reset(); modalSubcategoria.classList.remove('hidden'); }); }
    document.getElementById('btn-cerrar-modal-subcat').addEventListener('click', () => modalSubcategoria.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-subcat').addEventListener('click', () => modalSubcategoria.classList.add('hidden'));
    if (btnGuardarSubcategoria) btnGuardarSubcategoria.addEventListener('click', guardarSubcategoria);

    document.getElementById('btn-cerrar-modal-ped').addEventListener('click', () => modalPedido.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-ped').addEventListener('click', () => modalPedido.classList.add('hidden'));
    if (filtroFechaPedidos) filtroFechaPedidos.addEventListener('change', aplicarFiltrosPedidos);
    if (filtroEstadoPedidos) filtroEstadoPedidos.addEventListener('change', aplicarFiltrosPedidos);
    const buscadorPedidos = document.getElementById('buscador-pedidos');
    if (buscadorPedidos) buscadorPedidos.addEventListener('input', debounce(aplicarFiltrosPedidos));

    if (btnExportarClientes) btnExportarClientes.addEventListener('click', exportarClientesExcel);
    if (buscadorClientes) buscadorClientes.addEventListener('input', debounce(aplicarFiltrosClientes));
    if (filtroRolClientes) filtroRolClientes.addEventListener('change', aplicarFiltrosClientes);
    if (filtroFechaClientes) filtroFechaClientes.addEventListener('change', aplicarFiltrosClientes);
    document.getElementById('filtro-resenas')?.addEventListener('change', dibujarResenas);

    // Importador de catálogo (Excel + imágenes)
    document.getElementById('btn-cerrar-cliente')?.addEventListener('click', () => document.getElementById('modal-cliente-detalle').classList.add('hidden'));
    document.getElementById('btn-importar-catalogo')?.addEventListener('click', abrirModalImportar);
    document.getElementById('btn-cerrar-importar')?.addEventListener('click', () => document.getElementById('modal-importar-catalogo').classList.add('hidden'));
    document.getElementById('btn-cancelar-importar')?.addEventListener('click', () => document.getElementById('modal-importar-catalogo').classList.add('hidden'));
    document.getElementById('btn-analizar-importar')?.addEventListener('click', analizarImportacion);
    document.getElementById('btn-ejecutar-importar')?.addEventListener('click', ejecutarImportacion);

    if (btnGuardarTasas) btnGuardarTasas.addEventListener('click', guardarTasas);
    if (btnNuevoPago) {
        btnNuevoPago.addEventListener('click', () => {
            document.getElementById('form-pago').reset();
            document.getElementById('pago-id').value = '';
            document.getElementById('modal-titulo-pago').innerText = "Configurar Método de Pago";
            modalPago.classList.remove('hidden');
        });
    }
    document.getElementById('btn-cerrar-modal-pago').addEventListener('click', () => modalPago.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-pago').addEventListener('click', () => modalPago.classList.add('hidden'));
    if (btnGuardarPago) btnGuardarPago.addEventListener('click', guardarPago);

    if (btnNuevaPromocion) {
        btnNuevaPromocion.addEventListener('click', () => {
            document.getElementById('form-promocion').reset();
            document.getElementById('promo-id').value = '';
            if(promoOfertaCategoria) promoOfertaCategoria.value = '';
            actualizarSubcategoriasPromo('');
            filtrarProductosPromo();
            document.getElementById('modal-titulo-promo').innerText = "Nueva Promoción";
            modalPromocion.classList.remove('hidden');
        });
    }
    document.getElementById('btn-cerrar-modal-promo').addEventListener('click', () => modalPromocion.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-promo').addEventListener('click', () => modalPromocion.classList.add('hidden'));
    if (btnGuardarPromocion) btnGuardarPromocion.addEventListener('click', guardarPromocion);

    if(promoOfertaCategoria) {
        promoOfertaCategoria.addEventListener('change', (e) => {
            actualizarSubcategoriasPromo(e.target.value);
            filtrarProductosPromo();
        });
    }
    if(promoOfertaSubcategoria) {
        promoOfertaSubcategoria.addEventListener('change', () => {
            filtrarProductosPromo();
        });
    }

    // EVENTOS PARA OFERTAS DIRECTAS
    if (btnNuevaOferta) {
        btnNuevaOferta.addEventListener('click', () => {
            document.getElementById('form-oferta').reset();
            inputOfertaProductoId.value = '';
            
            // Llenar select de categorías en el buscador
            filtroOfertaCategoria.innerHTML = '<option value="">Todas las Categorías</option>';
            categoriasGlobales.forEach(c => {
                filtroOfertaCategoria.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`;
            });

            aplicarFiltrosBuscadorOfertas();
            modalOferta.classList.remove('hidden');
        });
    }
    document.getElementById('btn-cerrar-modal-oferta').addEventListener('click', () => modalOferta.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-oferta').addEventListener('click', () => modalOferta.classList.add('hidden'));
    if (btnGuardarOferta) btnGuardarOferta.addEventListener('click', guardarOferta);

    if (buscadorOfertaProducto) buscadorOfertaProducto.addEventListener('input', aplicarFiltrosBuscadorOfertas);
    if (filtroOfertaCategoria) filtroOfertaCategoria.addEventListener('change', aplicarFiltrosBuscadorOfertas);
}

// ==========================================
// FUNCIONES DIRECTAS PARA LIMPIAR HISTORIAL
// ==========================================

window.abrirModalLimpieza = () => {
    document.getElementById('input-fecha-limpieza').value = '';
    document.getElementById('modal-limpiar-pedidos').classList.remove('hidden');
};

window.cerrarModalLimpieza = () => {
    document.getElementById('modal-limpiar-pedidos').classList.add('hidden');
};

window.ejecutarLimpiezaHistorial = async () => {
    const inputFecha = document.getElementById('input-fecha-limpieza');
    const btnConfirmar = document.getElementById('btn-confirmar-limpieza');
    const modalLimpiar = document.getElementById('modal-limpiar-pedidos');
    
    const fechaLimite = inputFecha.value;
    if (!fechaLimite) { showToast("Por favor selecciona una fecha límite.", "warning"); return; }

    const pedidosAEliminar = pedidosGlobales.filter(p => {
        if (!p.fecha) return false;
        const fechaPedido = p.fecha.split('T')[0]; 
        return fechaPedido <= fechaLimite;
    });

    if (pedidosAEliminar.length === 0) {
        showToast("No se encontraron pedidos en esa fecha o anteriores.", "info"); return;
    }

    showConfirm(
        `Estás a punto de eliminar permanentemente ${pedidosAEliminar.length} pedido(s). Esta acción NO se puede deshacer.`,
        async () => {
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Eliminando...';
            try {
                for (const pedido of pedidosAEliminar) {
                    await deleteDoc(doc(db, "orders", pedido.id));
                }
                showToast(`Se eliminaron ${pedidosAEliminar.length} pedidos del historial.`, "success");
                modalLimpiar.classList.add('hidden');
                cargarPedidos();
            } catch (error) {
                console.error("Error al limpiar historial:", error);
                showToast("Ocurrió un error durante la limpieza.", "error");
            } finally {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = "Eliminar Pedidos";
            }
        },
        "Eliminar permanentemente",
        true
    );
};

// ==========================================
// MÓDULO: TASAS Y MÉTODOS DE PAGO
// ==========================================

async function cargarTasas() {
    try {
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const inputTasaBcv = document.getElementById('config-tasa-bcv');
            const inputTasaCop = document.getElementById('config-tasa-cop');
            const inputWhatsapp = document.getElementById('config-whatsapp'); 
            
            if (inputTasaBcv) inputTasaBcv.value = data.tasaBcv || '';
            if (inputTasaCop) inputTasaCop.value = data.tasaCop || '';
            if (inputWhatsapp) inputWhatsapp.value = data.whatsapp || ''; 
        }
    } catch (error) { console.error("Error cargando tasas:", error); }
}

async function guardarTasas() {
    if(!btnGuardarTasas) return;
    const originalText = btnGuardarTasas.innerHTML;
    btnGuardarTasas.disabled = true; btnGuardarTasas.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';

    const tasaBcv = parseFloat(document.getElementById('config-tasa-bcv').value) || 0;
    const tasaCop = parseFloat(document.getElementById('config-tasa-cop').value) || 0;
    const whatsapp = document.getElementById('config-whatsapp').value.trim(); 

    try {
        await setDoc(configDocRef, { tasaBcv, tasaCop, whatsapp, fechaActualizacion: new Date().toISOString() }, { merge: true });
        showToast("Configuración actualizada con éxito.", "success");
    } catch (error) {
        console.error("Error al guardar:", error); showToast("Error al guardar la configuración.", "error");
    } finally { btnGuardarTasas.disabled = false; btnGuardarTasas.innerHTML = originalText; }
}

async function cargarPagos() {
    const tbody = document.getElementById('admin-payments-list');
    try {
        const querySnapshot = await getDocs(paymentsCollection);
        pagosGlobales = [];
        if (querySnapshot.empty) { tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay métodos de pago configurados.</td></tr>'; return; }
        
        let htmlTemporal = '';
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data(); p.id = docSnap.id;
            pagosGlobales.push(p);

            const badgeDescuento = p.descuento > 0 
                ? `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">${p.descuento}% Dscto</span>` 
                : `<span class="text-gray-400 text-sm">Sin dscto</span>`;

            htmlTemporal += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-4 font-medium text-gray-800">${sanitize(p.nombre)}</td>
                    <td class="p-4"><span class="bg-blue-50 text-brand-blue border border-blue-200 px-2 py-1 rounded text-xs font-bold">${p.moneda}</span></td>
                    <td class="p-4">${badgeDescuento}</td>
                    <td class="p-4 text-center">
                        <button onclick="prepararEdicionPago('${p.id}')" class="text-gray-400 hover:text-brand-blue p-1"><i class="ph ph-pencil-simple text-xl"></i></button>
                        <button onclick="eliminarPago('${p.id}')" class="text-gray-400 hover:text-red-500 p-1 ml-2"><i class="ph ph-trash text-xl"></i></button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlTemporal;
    } catch (error) { console.error("Error cargando pagos:", error); }
}

async function guardarPago() {
    const id = document.getElementById('pago-id').value;
    const nombre = document.getElementById('pago-nombre').value.trim();
    const moneda = document.getElementById('pago-moneda').value;
    const descuento = parseFloat(document.getElementById('pago-descuento').value) || 0;
    const requisitos = document.getElementById('pago-requisitos').value;
    const instrucciones = document.getElementById('pago-instrucciones').value.trim();

    if (!nombre) { showToast("El nombre del método de pago es obligatorio.", "warning"); return; }

    btnGuardarPago.disabled = true; btnGuardarPago.innerText = "Guardando...";
    try {
        const datos = { nombre, moneda, descuento, requisitos, instrucciones };
        if (id) await updateDoc(doc(db, "payment_methods", id), datos);
        else await addDoc(paymentsCollection, datos);
        
        modalPago.classList.add('hidden'); cargarPagos(); showToast("Método de pago guardado.", "success");
    } catch (error) { showToast("Error al guardar el método de pago.", "error"); console.error(error); } 
    finally { btnGuardarPago.disabled = false; btnGuardarPago.innerText = "Guardar Método"; }
}

window.prepararEdicionPago = (id) => {
    const p = pagosGlobales.find(x => x.id === id); if (!p) return;
    document.getElementById('pago-id').value = p.id;
    document.getElementById('pago-nombre').value = p.nombre;
    document.getElementById('pago-moneda').value = p.moneda;
    document.getElementById('pago-descuento').value = p.descuento || 0;
    document.getElementById('pago-requisitos').value = p.requisitos;
    document.getElementById('pago-instrucciones').value = p.instrucciones || '';
    document.getElementById('modal-titulo-pago').innerText = "Editar Método de Pago";
    modalPago.classList.remove('hidden');
};

window.eliminarPago = async (id) => {
    showConfirm("¿Seguro que deseas eliminar este método de pago?", async () => { await deleteDoc(doc(db, "payment_methods", id)); cargarPagos(); showToast("Método de pago eliminado.", "success"); }, "Eliminar", true);
};

// ==========================================
// MÓDULO: PROMOCIONES (CON FILTROS EN CASCADA)
// ==========================================

function actualizarSelectsPromocionesIniciales() {
    const selectCatCondicion = document.getElementById('promo-condicion-categoria');
    if(selectCatCondicion) {
        selectCatCondicion.innerHTML = '<option value="">Cualquier Categoría</option>';
        categoriasGlobales.forEach(c => selectCatCondicion.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`);
    }
    if(promoOfertaCategoria) {
        promoOfertaCategoria.innerHTML = '<option value="">Todas las categorías</option>';
        categoriasGlobales.forEach(c => promoOfertaCategoria.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`);
    }
    filtrarProductosPromo(); 
}

function actualizarSubcategoriasPromo(catName) {
    if(!promoOfertaSubcategoria) return;
    promoOfertaSubcategoria.innerHTML = '<option value="">Todas las subcategorías</option>';
    
    if (!catName) {
        promoOfertaSubcategoria.disabled = true;
        promoOfertaSubcategoria.classList.add('bg-gray-50', 'text-gray-500');
        return;
    }

    const cat = categoriasGlobales.find(c => c.nombre === catName);
    if (cat && cat.subcategorias && cat.subcategorias.length > 0) {
        promoOfertaSubcategoria.disabled = false;
        promoOfertaSubcategoria.classList.remove('bg-gray-50', 'text-gray-500');
        cat.subcategorias.forEach(sub => {
            promoOfertaSubcategoria.innerHTML += `<option value="${sub}">${sub}</option>`;
        });
    } else {
        promoOfertaSubcategoria.disabled = true;
        promoOfertaSubcategoria.classList.add('bg-gray-50', 'text-gray-500');
    }
}

function filtrarProductosPromo() {
    if(!promoOfertaProducto) return;
    const cat = promoOfertaCategoria ? promoOfertaCategoria.value : '';
    const subcat = promoOfertaSubcategoria ? promoOfertaSubcategoria.value : '';
    
    promoOfertaProducto.innerHTML = '<option value="">Selecciona el producto a regalar/descontar...</option>';

    const filtrados = productosGlobales.filter(p => {
        const matchCat = cat === '' || p.categoria === cat;
        const matchSub = subcat === '' || p.subcategoria === subcat;
        return matchCat && matchSub;
    });

    filtrados.forEach(p => {
        promoOfertaProducto.innerHTML += `<option value="${p.id}">${p.nombre} (PVP: $${p.precio})</option>`;
    });
}

async function cargarPromociones() {
    const tbody = document.getElementById('admin-promos-list');
    actualizarSelectsPromocionesIniciales(); 
    
    try {
        const querySnapshot = await getDocs(promosCollection);
        promosGlobales = [];
        if (querySnapshot.empty) { tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay promociones activas. Crea la primera.</td></tr>'; return; }
        
        let htmlTemporal = '';
        querySnapshot.forEach((docSnap) => {
            const p = docSnap.data(); p.id = docSnap.id;
            promosGlobales.push(p);

            const condicionText = p.categoriaCondicion 
                ? `Lleva <b>${p.cantidadCondicion}</b> de <b>${p.categoriaCondicion}</b>` 
                : `Lleva <b>${p.cantidadCondicion}</b> de cualquier producto`;
                
            const prodOfrecido = productosGlobales.find(x => x.id === p.productoOfertaId);
            const ofertaText = prodOfrecido 
                ? `<span class="text-brand-pink font-bold">${p.porcentajeDescuento}% off</span> en ${prodOfrecido.nombre}` 
                : '<span class="text-red-500">Producto no encontrado</span>';

            htmlTemporal += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-4 font-medium text-gray-800">${sanitize(p.nombre)}</td>
                    <td class="p-4 text-sm text-gray-600">${condicionText}</td>
                    <td class="p-4 text-sm text-gray-600">${ofertaText}</td>
                    <td class="p-4 text-center">
                        <button onclick="prepararEdicionPromo('${p.id}')" class="text-gray-400 hover:text-brand-pink p-1"><i class="ph ph-pencil-simple text-xl"></i></button>
                        <button onclick="eliminarPromo('${p.id}')" class="text-gray-400 hover:text-red-500 p-1 ml-2"><i class="ph ph-trash text-xl"></i></button>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = htmlTemporal;
    } catch (error) { console.error("Error cargando promociones:", error); }
}

async function guardarPromocion() {
    const id = document.getElementById('promo-id').value;
    const nombre = document.getElementById('promo-nombre').value.trim();
    const categoriaCondicion = document.getElementById('promo-condicion-categoria').value;
    const cantidadCondicion = parseInt(document.getElementById('promo-condicion-cantidad').value) || 1;
    const productoOfertaId = document.getElementById('promo-oferta-producto').value;
    const porcentajeDescuento = parseInt(document.getElementById('promo-oferta-descuento').value) || 0;

    if (!nombre || !productoOfertaId || porcentajeDescuento <= 0) { showToast("Completa el nombre, selecciona un producto y define un descuento válido.", "warning"); return; }

    btnGuardarPromocion.disabled = true; btnGuardarPromocion.innerText = "Guardando...";
    try {
        const datos = { nombre, categoriaCondicion, cantidadCondicion, productoOfertaId, porcentajeDescuento, activa: true };
        if (id) await updateDoc(doc(db, "promotions", id), datos);
        else await addDoc(promosCollection, datos);
        
        modalPromocion.classList.add('hidden'); cargarPromociones(); showToast("Promoción guardada.", "success");
    } catch (error) { showToast("Error al guardar la promoción.", "error"); console.error(error); } 
    finally { btnGuardarPromocion.disabled = false; btnGuardarPromocion.innerText = "Guardar Promoción"; }
}

window.prepararEdicionPromo = (id) => {
    const p = promosGlobales.find(x => x.id === id); if (!p) return;
    document.getElementById('promo-id').value = p.id;
    document.getElementById('promo-nombre').value = p.nombre;
    document.getElementById('promo-condicion-categoria').value = p.categoriaCondicion || '';
    document.getElementById('promo-condicion-cantidad').value = p.cantidadCondicion || 1;
    document.getElementById('promo-oferta-descuento').value = p.porcentajeDescuento || 30;

    const prod = productosGlobales.find(x => x.id === p.productoOfertaId);
    if(prod) {
        if(promoOfertaCategoria) promoOfertaCategoria.value = prod.categoria || '';
        actualizarSubcategoriasPromo(prod.categoria);
        if(promoOfertaSubcategoria) promoOfertaSubcategoria.value = prod.subcategoria || '';
        filtrarProductosPromo();
        if(promoOfertaProducto) promoOfertaProducto.value = prod.id;
    }

    document.getElementById('modal-titulo-promo').innerText = "Editar Promoción";
    modalPromocion.classList.remove('hidden');
};

window.eliminarPromo = async (id) => { showConfirm("¿Seguro que deseas eliminar esta promoción?", async () => { await deleteDoc(doc(db, "promotions", id)); cargarPromociones(); showToast("Promoción eliminada.", "success"); }, "Eliminar", true); };

// ==========================================
// NUEVO MÓDULO: OFERTAS DIRECTAS (CATÁLOGO)
// ==========================================

function aplicarFiltrosBuscadorOfertas() {
    if(!listaOfertaProductos) return;
    const texto = buscadorOfertaProducto.value.toLowerCase();
    const categoria = filtroOfertaCategoria.value;

    // Buscar solo productos que NO tengan descuento actual
    const filtrados = productosGlobales.filter(p => {
        const sinDescuento = !p.descuento || p.descuento === 0;
        const matchTexto = p.nombre.toLowerCase().includes(texto);
        const matchCat = categoria === "" || p.categoria === categoria;
        return sinDescuento && matchTexto && matchCat;
    });

    listaOfertaProductos.innerHTML = '';
    if(filtrados.length === 0) {
        listaOfertaProductos.innerHTML = '<div class="p-4 text-center text-sm text-gray-500">No se encontraron productos sin oferta.</div>';
        return;
    }

    filtrados.forEach(p => {
        const img = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : 'https://via.placeholder.com/50';
        
        // Creamos la fila clickeable del buscador
        const div = document.createElement('div');
        div.className = 'p-3 flex items-center gap-3 cursor-pointer hover:bg-blue-50 transition-colors oferta-item border-b border-gray-100 last:border-0';
        div.onclick = () => seleccionarProductoOferta(p.id, div);
        
        div.innerHTML = `
            <img src="${img}" class="w-10 h-10 rounded-md object-cover border border-gray-200">
            <div class="flex-1">
                <p class="text-sm font-bold text-gray-800 line-clamp-1">${p.nombre}</p>
                <p class="text-xs text-gray-500">${p.categoria} | PVP: $${p.precio.toFixed(2)}</p>
            </div>
            <div class="text-brand-blue opacity-0 check-icon transition-opacity"><i class="ph-fill ph-check-circle text-xl"></i></div>
        `;
        listaOfertaProductos.appendChild(div);
    });
}

window.seleccionarProductoOferta = (id, elementoDiv) => {
    inputOfertaProductoId.value = id;
    
    // Limpiar selección de otros elementos
    document.querySelectorAll('.oferta-item').forEach(el => {
        el.classList.remove('bg-blue-50');
        el.querySelector('.check-icon').classList.add('opacity-0');
    });
    
    // Marcar elemento actual
    elementoDiv.classList.add('bg-blue-50');
    elementoDiv.querySelector('.check-icon').classList.remove('opacity-0');
};

async function guardarOferta() {
    const prodId = inputOfertaProductoId.value;
    const descuento = parseInt(inputOfertaDescuento.value) || 0;

    if(!prodId || descuento <= 0 || descuento >= 100) { showToast("Selecciona un producto y asigna un descuento entre 1 y 99%.", "warning"); return; }

    btnGuardarOferta.disabled = true; 
    btnGuardarOferta.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';
    try {
        await updateDoc(doc(db, "products", prodId), { descuento: descuento });
        modalOferta.classList.add('hidden'); cargarProductos(); showToast("Oferta aplicada correctamente.", "success");
    } catch (error) { showToast("Error al aplicar la oferta.", "error"); console.error(error); } finally { 
        btnGuardarOferta.disabled = false; 
        btnGuardarOferta.innerHTML = '<i class="ph-bold ph-check-circle"></i> Guardar Oferta'; 
    }
}

function dibujarTablaOfertas() {
    const tbody = document.getElementById('admin-ofertas-list');
    if(!tbody) return;

    // Filtramos los productos que tengan un descuento activo
    const ofertasActivas = productosGlobales.filter(p => p.descuento > 0);

    if (ofertasActivas.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">No hay productos en oferta actualmente.</td></tr>'; 
        return; 
    }

    let htmlTemporal = '';
    ofertasActivas.forEach(p => {
        const imgPortada = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : 'https://via.placeholder.com/50';
        const precioOriginal = p.precio;
        const precioFinal = p.precio * (1 - (p.descuento / 100));

        htmlTemporal += `
            <tr class="border-b border-gray-100 hover:bg-gray-50">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <img src="${imgPortada}" class="h-10 w-10 rounded-lg object-cover border border-gray-200">
                        <span class="font-medium text-gray-800 line-clamp-1">${sanitize(p.nombre)}</span>
                    </div>
                </td>
                <td class="p-4 font-bold text-gray-400 line-through">$${precioOriginal.toFixed(2)}</td>
                <td class="p-4"><span class="bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs font-black">-${p.descuento}%</span></td>
                <td class="p-4 font-black text-brand-blue text-lg">$${precioFinal.toFixed(2)}</td>
                <td class="p-4 text-center">
                    <button onclick="eliminarOferta('${p.id}')" title="Quitar descuento" class="text-gray-400 hover:text-red-500 p-1 bg-white rounded-full shadow-sm border border-gray-100"><i class="ph-bold ph-x text-lg"></i></button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = htmlTemporal;
}

window.eliminarOferta = async (id) => {
    if(confirm("¿Seguro que deseas quitar esta oferta? El producto volverá a su precio original.")) {
        try {
            await updateDoc(doc(db, "products", id), { descuento: 0 });
            cargarProductos();
        } catch (e) {
            console.error("Error al quitar oferta:", e);
        }
    }
};

// ==========================================
// MÓDULOS: CATEGORÍAS, PRODUCTOS Y CLIENTES
// ==========================================

async function cargarCategorias() {
    try {
        const querySnapshot = await getDocs(categoriesCollection);
        const selectProd = document.getElementById('prod-categoria');
        selectProd.innerHTML = '<option value="">Seleccionar categoría...</option>';
        filtroCategoria.innerHTML = '<option value="">Todas las Categorías</option>';
        selectSubcatParent.innerHTML = '<option value="">Selecciona la categoría principal...</option>'; 
        categoriasGlobales = [];
        querySnapshot.forEach((docSnap) => {
            const cat = docSnap.data(); cat.id = docSnap.id; categoriasGlobales.push(cat); 
            selectProd.innerHTML += `<option value="${cat.nombre}">${cat.nombre}</option>`;
            filtroCategoria.innerHTML += `<option value="${cat.nombre}">${cat.nombre}</option>`;
            selectSubcatParent.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`; 
        });
        aplicarFiltrosCategorias();
    } catch (error) { console.error(error); }
}

function aplicarFiltrosCategorias() {
    const texto = buscadorCategorias ? buscadorCategorias.value.toLowerCase() : '';
    const filtradas = categoriasGlobales.filter(c => c.nombre.toLowerCase().includes(texto));
    dibujarTablaCategorias(filtradas);
}

function dibujarTablaCategorias(arreglo) {
    const tbody = document.getElementById('admin-categories-list'); 
    if (arreglo.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No se encontraron categorías.</td></tr>'; return; }
    
    let htmlTemporal = '';
    arreglo.forEach(cat => {
        const subcatsTexto = (cat.subcategorias && cat.subcategorias.length > 0) ? cat.subcategorias.map(s => `<span class="inline-block bg-gray-100 px-2 py-1 rounded text-xs mr-1 mb-1">${s}</span>`).join('') : '<span class="text-gray-400 italic">Sin subcategorías</span>';
        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${sanitize(cat.nombre)}</td><td class="p-4 text-gray-600">${subcatsTexto}</td><td class="p-4 text-gray-500"><i class="${sanitize(cat.icono)} text-xl text-brand-orange mr-2"></i> ${sanitize(cat.icono)}</td><td class="p-4 text-center"><button onclick="eliminarCategoria('${cat.id}')" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash text-xl"></i></button></td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

async function guardarCategoria() {
    const nombre = document.getElementById('cat-nombre').value.trim(); const icono = document.getElementById('cat-icono').value.trim() || 'ph-tag';
    if (!nombre) { showToast("El nombre de la categoría es obligatorio.", "warning"); return; }
    btnGuardarCategoria.disabled = true; btnGuardarCategoria.innerText = "Guardando...";
    try { await addDoc(categoriesCollection, { nombre, icono, subcategorias: [] }); document.getElementById('modal-categoria').classList.add('hidden'); showToast("Categoría guardada correctamente.", "success"); await cargarCategorias(); } 
    catch (error) { showToast("Ocurrió un error al guardar.", "error"); } finally { btnGuardarCategoria.disabled = false; btnGuardarCategoria.innerText = "Guardar"; }
}

async function guardarSubcategoria() {
    const parentId = document.getElementById('subcat-parent').value; const subName = document.getElementById('subcat-nombre').value.trim();
    if (!parentId || !subName) { showToast("Selecciona una categoría padre y escribe un nombre.", "warning"); return; }
    btnGuardarSubcategoria.disabled = true; btnGuardarSubcategoria.innerText = "Guardando...";
    try {
        const categoriaPadre = categoriasGlobales.find(c => c.id === parentId);
        const nuevasSubcategorias = [...(categoriaPadre.subcategorias || [])];
        const existe = nuevasSubcategorias.find(s => s.toLowerCase() === subName.toLowerCase());
        if (!existe) { nuevasSubcategorias.push(subName); await updateDoc(doc(db, "categories", parentId), { subcategorias: nuevasSubcategorias }); } else { showToast("Esta subcategoría ya existe en esta categoría.", "warning"); }
        document.getElementById('modal-subcategoria').classList.add('hidden'); showToast("Subcategoría guardada.", "success"); await cargarCategorias(); 
    } catch (error) { showToast("Hubo un error al guardar.", "error"); } finally { btnGuardarSubcategoria.disabled = false; btnGuardarSubcategoria.innerText = "Guardar Subcategoría"; }
}

window.eliminarCategoria = async (id) => { showConfirm("¿Seguro que deseas eliminar esta categoría?", async () => { await deleteDoc(doc(db, "categories", id)); cargarCategorias(); showToast("Categoría eliminada.", "success"); }, "Eliminar", true); };

function actualizarSelectSubcategoriasFormulario(categoriaNombre, subcategoriaSeleccionada = "") {
    const selectSub = document.getElementById('prod-subcategoria'); selectSub.innerHTML = '<option value="">Seleccionar subcategoría...</option>';
    if (!categoriaNombre) { selectSub.disabled = true; selectSub.classList.add('bg-gray-50', 'text-gray-500'); return; }
    const categoriaEncontrada = categoriasGlobales.find(c => c.nombre === categoriaNombre);
    if (categoriaEncontrada && categoriaEncontrada.subcategorias && categoriaEncontrada.subcategorias.length > 0) {
        selectSub.disabled = false; selectSub.classList.remove('bg-gray-50', 'text-gray-500');
        categoriaEncontrada.subcategorias.forEach(sub => { const selected = (sub === subcategoriaSeleccionada) ? 'selected' : ''; selectSub.innerHTML += `<option value="${sub}" ${selected}>${sub}</option>`; });
    } else { selectSub.disabled = true; selectSub.innerHTML = '<option value="">No hay subcategorías registradas</option>'; }
}

function actualizarSelectSubcategoriasFiltro() {
    const catFiltro = filtroCategoria.value; filtroSubcategoria.innerHTML = '<option value="">Todas las Subcategorías</option>';
    if (catFiltro === "") { filtroSubcategoria.disabled = true; filtroSubcategoria.classList.add('bg-gray-50', 'text-gray-500'); return; }
    const categoriaEncontrada = categoriasGlobales.find(c => c.nombre === catFiltro);
    if (categoriaEncontrada && categoriaEncontrada.subcategorias && categoriaEncontrada.subcategorias.length > 0) {
        filtroSubcategoria.disabled = false; filtroSubcategoria.classList.remove('bg-gray-50', 'text-gray-500');
        categoriaEncontrada.subcategorias.forEach(sub => { filtroSubcategoria.innerHTML += `<option value="${sub}">${sub}</option>`; });
    } else { filtroSubcategoria.disabled = true; filtroSubcategoria.classList.add('bg-gray-50', 'text-gray-500'); }
}

async function manejarSubidaMultiplesImagenes(event) {
    const files = event.target.files; if (!files || files.length === 0) return;
    btnGuardarProducto.disabled = true; const textoOriginal = btnGuardarProducto.innerText;
    for (let i = 0; i < files.length; i++) {
        const file = files[i]; btnGuardarProducto.innerText = `Subiendo ${i + 1}/${files.length}...`;
        try {
            const formData = new FormData(); formData.append('image', file);
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
            const data = await response.json(); if (data.success) { arrayImagenesUrls.push(data.data.url); renderizarGaleria(); }
        } catch (error) { console.error("Error en ImgBB:", error); }
    }
    btnGuardarProducto.disabled = false; btnGuardarProducto.innerText = textoOriginal; document.getElementById('prod-imagen').value = ''; 
}

function renderizarGaleria() {
    const galeria = document.getElementById('galeria-preview'); 
    let htmlTemporal = '';
    arrayImagenesUrls.forEach((url, index) => { htmlTemporal += `<div class="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square"><img src="${url}" class="w-full h-full object-cover"><button type="button" onclick="quitarImagen(${index})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><i class="ph ph-x text-xs"></i></button></div>`; });
    galeria.innerHTML = htmlTemporal;
}
window.quitarImagen = (index) => { arrayImagenesUrls.splice(index, 1); renderizarGaleria(); };

// ==========================================
// MÓDULO: INVENTARIO POR TALLA / EDAD
// ==========================================
function genVarId() { return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function tipoInventarioActual() {
    const sel = document.getElementById('prod-tipo-inventario');
    return sel ? sel.value : 'ninguno';
}

function etiquetasTipo(tipo) {
    if (tipo === 'edad') return { placeholder: 'Ej: 0-2 años', boton: 'Agregar edad' };
    return { placeholder: 'Ej: S, M, L', boton: 'Agregar talla' };
}

// Muestra/oculta la lista de tallas/edades y sincroniza el campo Stock
function aplicarTipoInventario() {
    const tipo = tipoInventarioActual();
    const wrapper = document.getElementById('variantes-wrapper');
    const btnLabel = document.getElementById('btn-agregar-variante-label');
    if (btnLabel) btnLabel.textContent = etiquetasTipo(tipo).boton;
    if (wrapper) wrapper.classList.toggle('hidden', tipo === 'ninguno');
    renderVariantes();
}

function agregarFilaVariante(nombre = '', stock = 0, id = null) {
    variantesProducto.push({ id: id || genVarId(), nombre, stock: parseInt(stock) || 0 });
    renderVariantes();
}

window.actualizarVariante = (idx, campo, valor) => {
    if (!variantesProducto[idx]) return;
    variantesProducto[idx][campo] = (campo === 'stock') ? (parseInt(valor) || 0) : valor;
    if (campo === 'stock') sincronizarStockConVariantes();
};

window.quitarVariante = (idx) => { variantesProducto.splice(idx, 1); renderVariantes(); };

function renderVariantes() {
    const cont = document.getElementById('variantes-container');
    if (!cont) return;
    const ph = etiquetasTipo(tipoInventarioActual()).placeholder;
    cont.innerHTML = variantesProducto.map((v, i) => `
        <div class="flex items-center gap-2">
            <input type="text" value="${sanitize(v.nombre)}" placeholder="${ph}"
                oninput="window.actualizarVariante(${i}, 'nombre', this.value)"
                class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-blue">
            <input type="number" min="0" value="${v.stock}" placeholder="Stock"
                oninput="window.actualizarVariante(${i}, 'stock', this.value)"
                class="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-blue">
            <button type="button" onclick="window.quitarVariante(${i})" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash text-lg"></i></button>
        </div>`).join('');
    sincronizarStockConVariantes();
}

// Si el producto maneja talla/edad, el stock = suma de las filas (campo bloqueado)
function sincronizarStockConVariantes() {
    const inputStock = document.getElementById('prod-stock');
    if (!inputStock) return;
    if (tipoInventarioActual() !== 'ninguno') {
        inputStock.value = variantesProducto.reduce((s, v) => s + (parseInt(v.stock) || 0), 0);
        inputStock.disabled = true;
        inputStock.classList.add('bg-gray-100', 'text-gray-500');
    } else {
        inputStock.disabled = false;
        inputStock.classList.remove('bg-gray-100', 'text-gray-500');
    }
}

async function guardarProducto() {
    const id = document.getElementById('prod-id').value; const nombre = document.getElementById('prod-nombre').value.trim(); const categoria = document.getElementById('prod-categoria').value; const subcategoria = document.getElementById('prod-subcategoria').value; const precio = parseFloat(document.getElementById('prod-precio').value); let stock = parseInt(document.getElementById('prod-stock').value) || 0; const descripcion = document.getElementById('prod-descripcion').value.trim();
    if (!nombre || !categoria || !subcategoria || isNaN(precio) || arrayImagenesUrls.length === 0) { showToast("Completa todos los datos y sube al menos una foto.", "warning"); return; }
    // Inventario por talla/edad: si el producto maneja tallas o edades, el stock = suma de las filas
    const tipoInventario = tipoInventarioActual(); // 'ninguno' | 'talla' | 'edad'
    let variantesValidas = [];
    if (tipoInventario !== 'ninguno') {
        variantesValidas = variantesProducto
            .filter(v => v.nombre && v.nombre.trim())
            .map(v => ({ id: v.id || genVarId(), nombre: v.nombre.trim(), stock: parseInt(v.stock) || 0 }));
        if (variantesValidas.length === 0) {
            showToast(`Agrega al menos una ${tipoInventario} con su stock, o cambia a "Stock único".`, "warning");
            return;
        }
        stock = variantesValidas.reduce((s, v) => s + v.stock, 0);
    }
    btnGuardarProducto.disabled = true; btnGuardarProducto.innerText = "Guardando...";
    try {
        const datos = { nombre, categoria, subcategoria, precio, stock, descripcion, tipoVariante: tipoInventario, variantes: variantesValidas, imagenes: arrayImagenesUrls, fechaActualizacion: new Date().toISOString() };
        if (id) await updateDoc(doc(db, "products", id), datos); else { datos.fechaCreacion = new Date().toISOString(); await addDoc(productsCollection, datos); }
        document.getElementById('modal-producto').classList.add('hidden'); cargarProductos();
    } catch (error) { console.error(error); } finally { btnGuardarProducto.disabled = false; btnGuardarProducto.innerText = "Guardar Producto"; }
}

async function cargarProductos() {
    const tbody = document.getElementById('admin-products-list'); tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center"><i class="ph ph-spinner animate-spin text-2xl"></i> Cargando...</td></tr>';
    try {
        const querySnapshot = await getDocs(productsCollection); productosGlobales = [];
        querySnapshot.forEach((docSnap) => {
            const prod = docSnap.data(); prod.id = docSnap.id; prod.imagenes = prod.imagenes || (prod.imagen ? [prod.imagen] : []); prod.stock = prod.stock !== undefined ? prod.stock : 10; prod.subcategoria = prod.subcategoria || 'General'; productosGlobales.push(prod);
        });
        aplicarFiltrosProductos();
        dibujarTablaOfertas(); // Refresca la tabla de ofertas también
        renderDashboard();     // Refresca KPI de stock crítico
    } catch (error) { console.error(error); }
}

function aplicarFiltrosProductos() {
    const textoBuscador = buscadorProductos.value.toLowerCase(); const catFiltro = filtroCategoria.value; const subCatFiltro = filtroSubcategoria.value;
    productosFiltrados = productosGlobales.filter(prod => { return prod.nombre.toLowerCase().includes(textoBuscador) && (catFiltro === "" || prod.categoria === catFiltro) && (subCatFiltro === "" || prod.subcategoria === subCatFiltro); });
    dibujarTablaProductos(productosFiltrados);
}

function dibujarTablaProductos(arreglo) {
    const tbody = document.getElementById('admin-products-list'); 
    if (arreglo.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">No se encontraron productos.</td></tr>'; return; }
    
    let htmlTemporal = '';
    arreglo.forEach(prod => {
        const imgPortada = prod.imagenes.length > 0 ? prod.imagenes[0] : 'https://via.placeholder.com/150';
        let imgHTML = imgPortada.startsWith('http') ? `<img src="${imgPortada}" class="h-10 w-10 rounded-lg object-cover">` : `<div class="h-10 w-10 bg-gray-100 flex items-center justify-center"><i class="${imgPortada}"></i></div>`;
        const stockColor = prod.stock <= 3 ? 'text-red-500 font-bold' : 'text-brand-blue font-medium';
        
        const etiquetaOferta = (prod.descuento && prod.descuento > 0) ? `<br><span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold mt-1 inline-block">-${prod.descuento}% OFF</span>` : '';

        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4"><div class="flex items-center gap-3">${imgHTML}<div><span class="font-medium text-gray-800">${sanitize(prod.nombre)}</span>${etiquetaOferta}</div></div></td><td class="p-4"><span class="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">${sanitize(prod.categoria)}</span><br><span class="text-xs text-gray-500 mt-1 inline-block"><i class="ph ph-arrow-elbow-down-right"></i> ${sanitize(prod.subcategoria)}</span></td><td class="p-4 font-bold text-gray-800">$${prod.precio.toFixed(2)}</td><td class="p-4 ${stockColor}">${prod.stock} unds</td><td class="p-4 text-center"><button onclick="duplicarProducto('${prod.id}')" title="Variante de producto (duplicar)" class="text-gray-400 hover:text-brand-orange p-1"><i class="ph ph-copy text-xl"></i></button><button onclick="prepararEdicionProd('${prod.id}')" title="Editar" class="text-gray-400 hover:text-brand-blue p-1 ml-2"><i class="ph ph-pencil-simple text-xl"></i></button><button onclick="eliminarProducto('${prod.id}')" title="Eliminar" class="text-gray-400 hover:text-red-500 p-1 ml-2"><i class="ph ph-trash text-xl"></i></button></td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

function resetearModalProducto(titulo) {
    document.getElementById('form-producto').reset(); document.getElementById('prod-id').value = ''; document.getElementById('prod-descripcion').value = ''; document.getElementById('prod-stock').value = 1; actualizarSelectSubcategoriasFormulario(""); arrayImagenesUrls = []; renderizarGaleria(); variantesProducto = []; const selTipoReset = document.getElementById('prod-tipo-inventario'); if (selTipoReset) selTipoReset.value = 'ninguno'; aplicarTipoInventario(); document.getElementById('modal-titulo').innerText = titulo;
}

window.prepararEdicionProd = (id) => {
    const prod = productosGlobales.find(p => p.id === id); if (!prod) return;
    resetearModalProducto("Editar Producto"); document.getElementById('prod-id').value = prod.id; document.getElementById('prod-nombre').value = prod.nombre; document.getElementById('prod-categoria').value = prod.categoria; document.getElementById('prod-precio').value = prod.precio; document.getElementById('prod-stock').value = prod.stock !== undefined ? prod.stock : 10; document.getElementById('prod-descripcion').value = prod.descripcion || ''; actualizarSelectSubcategoriasFormulario(prod.categoria, prod.subcategoria); arrayImagenesUrls = [...prod.imagenes]; renderizarGaleria(); variantesProducto = (prod.variantes || []).map(v => ({ ...v })); const selTipoEdit = document.getElementById('prod-tipo-inventario'); if (selTipoEdit) selTipoEdit.value = prod.tipoVariante || (variantesProducto.length > 0 ? 'talla' : 'ninguno'); aplicarTipoInventario(); document.getElementById('modal-producto').classList.remove('hidden');
};

// Crea un producto NUEVO copiando SOLO nombre, categoría, subcategoría y descripción
window.duplicarProducto = (id) => {
    const prod = productosGlobales.find(p => p.id === id); if (!prod) return;
    resetearModalProducto("Nuevo producto (variante)");
    document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria;
    actualizarSelectSubcategoriasFormulario(prod.categoria, prod.subcategoria);
    document.getElementById('prod-descripcion').value = prod.descripcion || '';
    // prod-id queda vacío => al guardar se crea un producto independiente
    document.getElementById('modal-producto').classList.remove('hidden');
};

window.eliminarProducto = async (id) => { showConfirm("¿Seguro que deseas eliminar este producto?", async () => { await deleteDoc(doc(db, "products", id)); cargarProductos(); showToast("Producto eliminado.", "success"); }, "Eliminar", true); };

function exportarProductosExcel() {
    if (productosFiltrados.length === 0) return alert("No hay productos para exportar.");
    const datosLimpios = productosFiltrados.map(p => ({ "ID Producto": p.id, "Nombre": p.nombre, "Categoría": p.categoria, "Subcategoría": p.subcategoria, "Precio ($)": p.precio, "Stock Físico": p.stock, "Descripción": p.descripcion || 'N/A', "Cantidad de Fotos": p.imagenes ? p.imagenes.length : 0, "Fecha de Registro": p.fechaCreacion ? new Date(p.fechaCreacion).toLocaleDateString() : 'N/A' }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Inventario"); XLSX.writeFile(libro, "Inventario_Filtrado.xlsx");
}

async function cargarClientes() {
    try { const querySnapshot = await getDocs(usersCollection); clientesGlobales = []; querySnapshot.forEach((docSnap) => { const u = docSnap.data(); u.uid = docSnap.id; clientesGlobales.push(u); }); aplicarFiltrosClientes(); } catch (error) { console.error(error); }
}

function aplicarFiltrosClientes() {
    const texto = buscadorClientes ? buscadorClientes.value.toLowerCase() : ''; const rol = filtroRolClientes ? filtroRolClientes.value : ''; const fecha = filtroFechaClientes ? filtroFechaClientes.value : '';
    clientesFiltrados = clientesGlobales.filter(c => {
        const coincideTexto = (c.name || '').toLowerCase().includes(texto) || (c.email || '').toLowerCase().includes(texto);
        const coincideRol = rol === "" || c.role === rol;
        const coincideFecha = fecha === "" || (c.createdAt && c.createdAt.split('T')[0] === fecha);
        return coincideTexto && coincideRol && coincideFecha;
    });
    dibujarTablaClientes(clientesFiltrados);
}

function dibujarTablaClientes(arreglo) {
    const tbody = document.getElementById('admin-clients-list'); 
    if (arreglo.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">No se encontraron clientes.</td></tr>'; return; }

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    let htmlTemporal = '';
    arreglo.forEach((user) => {
        const fecha = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
        const badgeRol = user.role === 'admin' ? '<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Admin</span>' : '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Cliente</span>';
        const telefonoTexto = user.phone ? user.phone : '<span class="text-gray-400 italic">No proporcionado</span>';
        const btnVer = `<button onclick="verCliente('${user.uid}')" title="Ver detalle y pedidos" class="text-gray-400 hover:text-brand-blue p-1"><i class="ph ph-eye text-xl"></i></button>`;
        const btnBorrar = (user.uid && user.uid === miUid)
            ? '<span class="text-xs text-gray-400 italic ml-1 align-middle">Tú</span>'
            : `<button onclick="eliminarCliente('${user.uid}')" title="Eliminar cliente" class="text-gray-400 hover:text-red-500 p-1 ml-1"><i class="ph ph-trash text-xl"></i></button>`;
        const accion = btnVer + btnBorrar;
        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${sanitize(user.name || 'Sin Nombre')}</td><td class="p-4 text-gray-600">${sanitize(user.email)}</td><td class="p-4 text-gray-600">${telefonoTexto}</td><td class="p-4">${badgeRol}</td><td class="p-4 text-gray-500">${fecha}</td><td class="p-4 text-center">${accion}</td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

window.verCliente = (uid) => {
    const u = clientesGlobales.find(c => c.uid === uid);
    if (!u) return;
    document.getElementById('cli-nombre').textContent = u.name || 'Sin nombre';
    document.getElementById('cli-email').textContent = u.email || '—';
    document.getElementById('cli-telefono').textContent = u.phone || 'No proporcionado';
    document.getElementById('cli-direccion').textContent = u.address || 'No proporcionada';
    document.getElementById('cli-rol').textContent = u.role === 'admin' ? 'Administrador' : 'Cliente';
    document.getElementById('cli-registro').textContent = u.createdAt
        ? new Date(u.createdAt).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })
        : 'N/A';

    // Pedidos de este cliente (por uid, con respaldo por email)
    const emailLower = (u.email || '').toLowerCase();
    const pedidos = pedidosGlobales.filter(p =>
        p.clienteId === uid || (emailLower && (p.clienteEmail || '').toLowerCase() === emailLower)
    );
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    const totalGastado = pedidos.filter(p => p.estado !== 'Cancelado').reduce((s, p) => s + (p.totalUSD || 0), 0);
    document.getElementById('cli-total-pedidos').textContent = pedidos.length;
    document.getElementById('cli-total-gastado').textContent = '$' + totalGastado.toFixed(2);

    const lista = document.getElementById('cli-pedidos-lista');
    if (pedidos.length === 0) {
        lista.innerHTML = '<li class="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded-lg">Este cliente aún no tiene pedidos.</li>';
    } else {
        const colores = { Pendiente: 'bg-yellow-100 text-yellow-700', Procesando: 'bg-blue-100 text-blue-700', Enviado: 'bg-indigo-100 text-indigo-700', Entregado: 'bg-green-100 text-green-700', Cancelado: 'bg-red-100 text-red-700' };
        lista.innerHTML = pedidos.map(p => {
            const color = colores[p.estado] || 'bg-gray-100 text-gray-600';
            const fecha = p.fecha ? new Date(p.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
            return `<li onclick="verPedidoDesdeCliente('${p.id}')" class="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                <div><span class="font-mono text-xs text-gray-500">#${p.id.slice(-6).toUpperCase()}</span> <span class="text-xs text-gray-400 ml-1">${fecha}</span></div>
                <div class="flex items-center gap-3"><span class="px-2 py-0.5 rounded-full text-xs font-bold ${color}">${sanitize(p.estado)}</span><span class="font-bold text-gray-800 text-sm">$${(p.totalUSD || 0).toFixed(2)}</span></div>
            </li>`;
        }).join('');
    }
    document.getElementById('modal-cliente-detalle').classList.remove('hidden');
};

// Abre el modal de pedido desde el detalle del cliente (cierra el de cliente primero)
window.verPedidoDesdeCliente = (id) => {
    document.getElementById('modal-cliente-detalle').classList.add('hidden');
    abrirModalPedido(id);
};

window.eliminarCliente = (uid) => {
    const u = clientesGlobales.find(c => c.uid === uid);
    if (!u) return;
    if (auth.currentUser && auth.currentUser.uid === uid) {
        showToast("No puedes eliminar tu propia cuenta de administrador.", "warning");
        return;
    }
    const nombre = sanitize(u.name || u.email || 'este cliente');
    const aviso = (u.role === 'admin' ? '⚠️ Es un ADMINISTRADOR. ' : '')
        + `Se eliminará el perfil de "${nombre}" del directorio. `
        + `Nota: borra sus datos en la tienda, pero NO su acceso de inicio de sesión (eso requiere el backend de Firebase). Sus pedidos anteriores se conservan.`;
    showConfirm(aviso, async () => {
        try {
            await deleteDoc(doc(db, "users", uid));
            showToast("Cliente eliminado del directorio.", "success");
            cargarClientes();
        } catch (e) {
            console.error("Error al eliminar cliente:", e);
            showToast("No se pudo eliminar el cliente.", "error");
        }
    }, "Eliminar", true);
};

function exportarClientesExcel() {
    if (clientesFiltrados.length === 0) return alert("No hay clientes para exportar.");
    const datosLimpios = clientesFiltrados.map(c => ({ "Nombre Completo": c.name || 'Sin nombre', "Correo Electrónico": c.email, "Teléfono": c.phone || 'N/A', "Rol del Sistema": c.role === 'admin' ? 'Administrador' : 'Cliente', "Fecha de Registro": c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A' }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Directorio"); XLSX.writeFile(libro, "Directorio_Filtrado.xlsx");
}

// ==========================================
// TAREA 7: MODERACIÓN DE RESEÑAS
// ==========================================
function estrellasAdminHTML(n) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<i class="ph-fill ph-star ${i <= n ? 'text-yellow-400' : 'text-gray-300'}"></i>`;
    return s;
}

window.cargarResenas = async () => {
    const cont = document.getElementById('admin-resenas-lista');
    if (cont) cont.innerHTML = '<div class="p-6 text-center text-gray-400"><i class="ph ph-spinner animate-spin text-2xl"></i> Cargando...</div>';
    try {
        const snap = await getDocs(reviewsCollection);
        resenasGlobales = [];
        snap.forEach(d => { const r = d.data(); r.id = d.id; resenasGlobales.push(r); });
        resenasGlobales.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        // Badge de pendientes
        const pendientes = resenasGlobales.filter(r => !r.aprobada).length;
        const badge = document.getElementById('badge-resenas-pendientes');
        if (badge) { badge.textContent = pendientes; badge.classList.toggle('hidden', pendientes === 0); }

        dibujarResenas();
    } catch (e) {
        console.error("Error cargando reseñas:", e);
        if (cont) cont.innerHTML = '<div class="p-6 text-center text-red-500">No se pudieron cargar las reseñas.</div>';
    }
};

function dibujarResenas() {
    const cont = document.getElementById('admin-resenas-lista');
    if (!cont) return;
    const filtro = document.getElementById('filtro-resenas')?.value || 'pendientes';
    let lista = resenasGlobales;
    if (filtro === 'pendientes') lista = resenasGlobales.filter(r => !r.aprobada);
    else if (filtro === 'aprobadas') lista = resenasGlobales.filter(r => r.aprobada);

    if (lista.length === 0) {
        cont.innerHTML = '<div class="p-8 text-center text-gray-500 bg-white rounded-xl border border-gray-200">No hay reseñas en esta vista.</div>';
        return;
    }

    cont.innerHTML = lista.map(r => {
        const fecha = r.fecha ? new Date(r.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        const estadoBadge = r.aprobada
            ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold">Aprobada</span>'
            : '<span class="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-bold">Pendiente</span>';
        const btnAprobar = r.aprobada
            ? `<button onclick="reprobarResena('${r.id}')" class="text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">Ocultar</button>`
            : `<button onclick="aprobarResena('${r.id}')" class="text-xs font-bold text-white bg-green-500 hover:bg-green-600 px-3 py-1.5 rounded-lg">Aprobar</button>`;
        return `
            <div class="bg-white rounded-xl border border-gray-200 p-4">
                <div class="flex items-start justify-between gap-3 mb-2">
                    <div>
                        <p class="font-bold text-gray-800 text-sm">${sanitize(r.productoNombre || 'Producto')}</p>
                        <p class="text-xs text-gray-500">${sanitize(r.clienteNombre || 'Cliente')} · ${fecha}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">${estadoBadge}</div>
                </div>
                <div class="mb-2">${estrellasAdminHTML(r.estrellas)}</div>
                <p class="text-sm text-gray-600 mb-3">${sanitize(r.comentario || '')}</p>
                <div class="flex justify-end gap-2">
                    ${btnAprobar}
                    <button onclick="eliminarResena('${r.id}')" class="text-xs font-bold text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg">Eliminar</button>
                </div>
            </div>`;
    }).join('');
}

window.aprobarResena = async (id) => {
    try { await updateDoc(doc(db, "reviews", id), { aprobada: true }); showToast("Reseña aprobada. Ya es visible en la tienda.", "success"); cargarResenas(); }
    catch (e) { showToast("Error al aprobar la reseña.", "error"); console.error(e); }
};

window.reprobarResena = async (id) => {
    try { await updateDoc(doc(db, "reviews", id), { aprobada: false }); showToast("Reseña ocultada de la tienda.", "info"); cargarResenas(); }
    catch (e) { showToast("Error al ocultar la reseña.", "error"); console.error(e); }
};

window.eliminarResena = async (id) => {
    showConfirm("¿Eliminar esta reseña permanentemente?", async () => {
        try { await deleteDoc(doc(db, "reviews", id)); showToast("Reseña eliminada.", "success"); cargarResenas(); }
        catch (e) { showToast("Error al eliminar la reseña.", "error"); console.error(e); }
    }, "Eliminar", true);
};

// ==========================================
// IMPORTADOR DE CATÁLOGO (Excel + imágenes -> productos)
// ==========================================
// Estructura del Excel: cada producto = 2 filas.
//   Fila identidad: B Categoria, C Genero, D SubCat, E Nombre, F Desc,
//                   I Color, J Precio, K-O tallas, Q Link.
//   Fila siguiente: K-O cantidades por talla, Q otro Link (opcional).
// Cada color es un producto aparte. Las imágenes son archivos locales
// (columna Link = hipervínculo/ruta); se suben a ImgBB una sola vez (dedup).
let impProductos = [];        // productos parseados del Excel
let impImagenes = null;       // índice de archivos de la carpeta elegida
let impListoParaImportar = false;

function abrirModalImportar() {
    impProductos = []; impImagenes = null; impListoParaImportar = false;
    document.getElementById('imp-excel').value = '';
    document.getElementById('imp-imagenes').value = '';
    const res = document.getElementById('imp-resultado'); res.classList.add('hidden'); res.textContent = '';
    document.getElementById('imp-progreso').classList.add('hidden');
    document.getElementById('btn-ejecutar-importar').disabled = true;
    document.getElementById('modal-importar-catalogo').classList.remove('hidden');
}

function impCelda(ws, r, c) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return { v: null, link: null };
    const v = (cell.v !== undefined && cell.v !== null && cell.v !== '') ? cell.v : (cell.w || null);
    const link = (cell.l && cell.l.Target) ? cell.l.Target : null;
    return { v, link };
}

function impNormLink(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    let s = String(raw).trim();
    try { s = decodeURIComponent(s); } catch (e) { /* ruta con % suelto */ }
    s = s.replace(/\\/g, '/').toLowerCase();
    const i = s.indexOf('ml detallitos/');
    if (i !== -1) s = s.slice(i + 'ml detallitos/'.length);
    return s;
}

function impIndexarImagenes(fileList) {
    const byPath = new Map();
    const byName = new Map();
    for (const f of fileList) {
        if (!/\.(png|jpe?g|webp)$/i.test(f.name)) continue;
        let rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/').toLowerCase();
        const i = rel.indexOf('ml detallitos/');
        if (i !== -1) rel = rel.slice(i + 'ml detallitos/'.length);
        byPath.set(rel, f);
        const name = rel.split('/').pop();
        if (!byName.has(name)) byName.set(name, []);
        byName.get(name).push({ path: rel, f });
    }
    return { byPath, byName };
}

function impMatch(link) {
    if (!impImagenes || !link) return null;
    if (impImagenes.byPath.has(link)) return impImagenes.byPath.get(link);
    const fname = link.split('/').pop();
    const folder = link.split('/').slice(0, -1).join('/');
    const cands = impImagenes.byName.get(fname);
    if (cands && cands.length) {
        const same = cands.find(c => c.path.startsWith(folder + '/'));
        return (same || cands[0]).f;
    }
    // fuzzy: nombre real que sea sufijo/prefijo del nombre del link
    let best = null;
    for (const [nm, arr] of impImagenes.byName) {
        if (fname.endsWith(nm) || nm.endsWith(fname)) {
            for (const c of arr) {
                const sameFolder = c.path.startsWith(folder + '/');
                if (!best || (sameFolder && !best.sameFolder)) best = { f: c.f, sameFolder };
            }
        }
    }
    return best ? best.f : null;
}

function impParsearExcel(ws) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    const productos = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
        const nombreCell = impCelda(ws, r, 4).v; // E
        if (!nombreCell) continue;
        if (String(nombreCell).trim().toLowerCase() === 'nombre') continue; // encabezado
        const cat = impCelda(ws, r, 1).v, gen = impCelda(ws, r, 2).v, sub = impCelda(ws, r, 3).v;
        const desc = impCelda(ws, r, 5).v, color = impCelda(ws, r, 8).v, precio = impCelda(ws, r, 9).v;
        // tallas (fila r) + cantidades (fila r+1), columnas K-O (10-14)
        const variantes = [];
        for (let c = 10; c <= 14; c++) {
            const talla = impCelda(ws, r, c).v;
            const cant = impCelda(ws, r + 1, c).v;
            if (talla !== null && talla !== '' && cant !== null && cant !== '') {
                variantes.push({ id: genVarId(), nombre: String(talla).trim(), stock: parseInt(cant) || 0 });
            }
        }
        // links de Q (16) en fila r y r+1
        const links = [];
        for (const rr of [r, r + 1]) {
            const cel = impCelda(ws, rr, 16);
            const k = impNormLink(cel.link || cel.v);
            if (k && !links.includes(k)) links.push(k);
        }
        productos.push({
            cat: cat ? String(cat).trim() : '',
            gen: gen ? String(gen).trim() : '',
            sub: sub ? String(sub).trim() : 'General',
            nombre: String(nombreCell).trim(),
            desc: desc ? String(desc).trim() : '',
            color: color ? String(color).trim() : '',
            precio: parseFloat(precio) || 0,
            variantes, links
        });
    }
    return productos;
}

async function analizarImportacion() {
    const fileExcel = document.getElementById('imp-excel').files[0];
    const filesImg = document.getElementById('imp-imagenes').files;
    const res = document.getElementById('imp-resultado');
    res.classList.remove('hidden');
    res.textContent = 'Analizando...';
    if (!fileExcel) { res.textContent = 'Falta seleccionar el archivo Excel.'; return; }
    if (!filesImg || filesImg.length === 0) { res.textContent = 'Falta seleccionar la carpeta de imágenes.'; return; }

    try {
        const buf = await fileExcel.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        impProductos = impParsearExcel(ws);
        impImagenes = impIndexarImagenes(filesImg);

        // Emparejar imágenes y detectar faltantes
        const sinImagen = [];
        const rutasUnicas = new Set();
        for (const p of impProductos) {
            let encontroAlguna = false;
            for (const l of p.links) {
                const f = impMatch(l);
                if (f) { rutasUnicas.add(l); encontroAlguna = true; }
            }
            if (p.links.length === 0 || !encontroAlguna) sinImagen.push(`${p.nombre} (${p.color})`);
        }
        const totalTallas = impProductos.reduce((s, p) => s + p.variantes.length, 0);

        let txt = '';
        txt += `Productos a crear:        ${impProductos.length}\n`;
        txt += `Imágenes distintas a subir: ${rutasUnicas.size}\n`;
        txt += `Total de filas de talla:  ${totalTallas}\n`;
        txt += `Productos sin imagen:     ${sinImagen.length}\n`;
        if (sinImagen.length) txt += `   → ${sinImagen.slice(0, 12).join(', ')}${sinImagen.length > 12 ? '…' : ''}\n`;
        txt += `\nEjemplos:\n`;
        for (const p of impProductos.slice(0, 4)) {
            const cat = document.getElementById('imp-categoria').value === 'excel' ? p.cat : ('Ropa ' + impGeneroPlural(p.gen));
            txt += `• ${p.nombre}${p.color ? ' — ' + p.color : ''}\n  ${cat} / ${p.sub} | $${p.precio} | tallas: ${p.variantes.map(v => v.nombre + '(' + v.stock + ')').join(', ') || '—'} | fotos: ${p.links.filter(l => impMatch(l)).length}\n`;
        }
        res.textContent = txt;

        impListoParaImportar = impProductos.length > 0;
        document.getElementById('btn-ejecutar-importar').disabled = !impListoParaImportar;
    } catch (e) {
        console.error(e);
        res.textContent = 'Error analizando el archivo: ' + e.message;
    }
}

function impGeneroPlural(gen) {
    const g = (gen || '').toLowerCase();
    if (g.startsWith('niña')) return 'Niñas';
    if (g.startsWith('niño')) return 'Niños';
    if (g.startsWith('unisex')) return 'Unisex';
    return gen || '';
}

async function impSubirImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
    const data = await r.json();
    if (data && data.success) return data.data.url;
    throw new Error('ImgBB rechazó la imagen');
}

function ejecutarImportacion() {
    if (!impListoParaImportar) return;
    showConfirm(
        `Se crearán ${impProductos.length} productos nuevos en la tienda. Revisa el resumen del análisis. ¿Continuar con la importación?`,
        () => _importarAhora(),
        "Sí, importar",
        false
    );
}

async function _importarAhora() {
    const btn = document.getElementById('btn-ejecutar-importar');
    const btnAnalizar = document.getElementById('btn-analizar-importar');
    const prog = document.getElementById('imp-progreso');
    const barra = document.getElementById('imp-barra');
    const progTxt = document.getElementById('imp-progreso-txt');
    btn.disabled = true; btnAnalizar.disabled = true;
    prog.classList.remove('hidden');

    const modoCategoria = document.getElementById('imp-categoria').value; // 'excel' | 'ropa-genero'
    const portada = document.getElementById('imp-portada').value;         // 'individual' | 'grupo'

    // Cuántas veces se usa cada link (para saber cuál es "de grupo" = compartido)
    const usoLink = {};
    impProductos.forEach(p => p.links.forEach(l => { usoLink[l] = (usoLink[l] || 0) + 1; }));

    // 1) Subir imágenes únicas (dedup)
    const rutasUnicas = [...new Set(impProductos.flatMap(p => p.links.filter(l => impMatch(l))))];
    const urlPorRuta = new Map();
    let subidas = 0, fallosImg = 0;
    for (const ruta of rutasUnicas) {
        const f = impMatch(ruta);
        progTxt.textContent = `Subiendo imágenes ${subidas + 1}/${rutasUnicas.length}...`;
        try { urlPorRuta.set(ruta, await impSubirImgBB(f)); }
        catch (e) { fallosImg++; console.warn('Fallo subiendo', ruta, e); }
        subidas++;
        barra.style.width = `${Math.round((subidas / rutasUnicas.length) * 50)}%`;
    }

    // 2) Crear productos
    let creados = 0, fallosProd = 0;
    for (let idx = 0; idx < impProductos.length; idx++) {
        const p = impProductos[idx];
        progTxt.textContent = `Creando productos ${idx + 1}/${impProductos.length}...`;
        try {
            // ordenar imágenes según portada: individual = link menos compartido
            const linksConUrl = p.links.filter(l => urlPorRuta.has(l));
            linksConUrl.sort((a, b) => portada === 'individual' ? (usoLink[a] - usoLink[b]) : (usoLink[b] - usoLink[a]));
            const imagenes = linksConUrl.map(l => urlPorRuta.get(l));

            const categoria = modoCategoria === 'excel' ? (p.cat || 'Ropa') : ('Ropa ' + impGeneroPlural(p.gen));
            const tieneTallas = p.variantes.length > 0;
            const stock = tieneTallas ? p.variantes.reduce((s, v) => s + v.stock, 0) : 0;
            const nombre = p.nombre + (p.color ? ` — ${p.color}` : '');

            await addDoc(productsCollection, {
                nombre, categoria, subcategoria: p.sub || 'General',
                precio: p.precio, stock,
                descripcion: p.desc,
                tipoVariante: tieneTallas ? 'talla' : 'ninguno',
                variantes: p.variantes,
                imagenes,
                descuento: 0,
                fechaCreacion: new Date().toISOString(),
                fechaActualizacion: new Date().toISOString()
            });
            creados++;
        } catch (e) { fallosProd++; console.error('Fallo creando', p.nombre, e); }
        barra.style.width = `${50 + Math.round(((idx + 1) / impProductos.length) * 50)}%`;
    }

    // 3) Asegurar categorías/subcategorías nuevas
    try { await impAsegurarCategorias(modoCategoria); } catch (e) { console.warn('No se pudieron crear categorías:', e); }

    progTxt.textContent = `Listo: ${creados} productos creados. ${fallosProd ? fallosProd + ' con error. ' : ''}${fallosImg ? fallosImg + ' imágenes fallaron.' : ''}`;
    showToast(`Importación finalizada: ${creados} productos creados.`, creados > 0 ? 'success' : 'warning', 6000);
    btnAnalizar.disabled = false;
    cargarProductos();
    cargarCategorias();
}

async function impAsegurarCategorias(modoCategoria) {
    // Junta categoria -> set de subcategorias desde lo importado
    const mapa = {};
    for (const p of impProductos) {
        const cat = modoCategoria === 'excel' ? (p.cat || 'Ropa') : ('Ropa ' + impGeneroPlural(p.gen));
        if (!mapa[cat]) mapa[cat] = new Set();
        if (p.sub) mapa[cat].add(p.sub);
    }
    for (const [nombre, subsSet] of Object.entries(mapa)) {
        const subs = [...subsSet];
        const existente = categoriasGlobales.find(c => c.nombre === nombre);
        if (!existente) {
            await addDoc(categoriesCollection, { nombre, icono: 'ph-t-shirt', subcategorias: subs });
        } else {
            const faltan = subs.filter(s => !(existente.subcategorias || []).includes(s));
            if (faltan.length) await updateDoc(doc(db, "categories", existente.id), { subcategorias: [...(existente.subcategorias || []), ...faltan] });
        }
    }
}

function cargarPedidos() {
    // Tiempo real: onSnapshot actualiza la tabla automáticamente sin recargar
    onSnapshot(ordersCollection, (querySnapshot) => {
        pedidosGlobales = [];
        querySnapshot.forEach((docSnap) => {
            const pedido = docSnap.data();
            pedido.id = docSnap.id;
            pedidosGlobales.push(pedido);
        });
        aplicarFiltrosPedidos();
        renderDashboard(); // KPIs en tiempo real cuando cambian los pedidos
    }, (error) => {
        console.error("Error en tiempo real de pedidos:", error);
    });
}

function aplicarFiltrosPedidos() {
    const fecha = filtroFechaPedidos ? filtroFechaPedidos.value : '';
    const estado = filtroEstadoPedidos ? filtroEstadoPedidos.value : '';
    const textoBusq = document.getElementById('buscador-pedidos')?.value.toLowerCase() || '';
    const filtrados = pedidosGlobales.filter(p => {
        const coincideEstado = estado === "" || p.estado === estado;
        const coincideFecha  = fecha === "" || (p.fecha && p.fecha.split('T')[0] === fecha);
        const coincideTexto  = !textoBusq ||
            (p.clienteNombre || '').toLowerCase().includes(textoBusq) ||
            p.id.toLowerCase().includes(textoBusq) ||
            (p.clienteEmail || '').toLowerCase().includes(textoBusq);
        return coincideEstado && coincideFecha && coincideTexto;
    });
    dibujarTablaPedidos(filtrados);
}

function dibujarTablaPedidos(arreglo) {
    const tbody = document.getElementById('admin-orders-list'); 
    if (arreglo.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-gray-500">No se encontraron pedidos.</td></tr>'; return; }
    
    arreglo.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    let htmlTemporal = '';
    arreglo.forEach((pedido) => {
        let colorEstado = 'bg-gray-100 text-gray-600';
        if(pedido.estado === 'Pendiente') colorEstado = 'bg-yellow-100 text-yellow-700'; 
        if(pedido.estado === 'Procesando') colorEstado = 'bg-blue-100 text-blue-700'; 
        if(pedido.estado === 'Enviado') colorEstado = 'bg-indigo-100 text-indigo-700'; 
        if(pedido.estado === 'Entregado') colorEstado = 'bg-green-100 text-green-700'; 
        if(pedido.estado === 'Cancelado') colorEstado = 'bg-red-100 text-red-700';

        let fechaFormateada = 'N/A';
        if (pedido.fecha) {
            const fechaObj = new Date(pedido.fecha);
            fechaFormateada = fechaObj.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        htmlTemporal += `
        <tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="p-4 font-mono text-sm text-gray-500">#${pedido.id.slice(-6).toUpperCase()}</td>
            <td class="p-4 text-sm text-gray-600 font-medium">${fechaFormateada}</td>
            <td class="p-4 font-medium text-gray-800">${sanitize(pedido.clienteNombre)}</td>
            <td class="p-4 font-bold text-gray-800">$${pedido.totalUSD ? pedido.totalUSD.toFixed(2) : (pedido.total || 0).toFixed(2)}</td>
            <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${colorEstado}">${sanitize(pedido.estado)}</span></td>
            <td class="p-4 text-center"><button onclick="abrirModalPedido('${pedido.id}')" class="text-brand-blue hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors">Ver / Editar</button></td>
        </tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

window.abrirModalPedido = (id) => {
    // Reset campos adicionales del modal
    const inputTracking = document.getElementById('input-tracking-numero');
    const inputNota = document.getElementById('input-nota-pedido');
    const contenedorTracking = document.getElementById('contenedor-tracking');
    if (inputTracking) inputTracking.value = '';
    if (inputNota) inputNota.value = '';
    if (contenedorTracking) contenedorTracking.classList.add('hidden');
    
    const pedido = pedidosGlobales.find(p => p.id === id);
    if(!pedido) return;

    document.getElementById('ped-id').value = id; 
    document.getElementById('ped-id-display').textContent = `#${id.slice(-6).toUpperCase()}`;
    // Mostrar tracking existente si el pedido está Enviado
    // (reutiliza pedido, contenedorTracking e inputTracking ya declarados arriba)
    if (contenedorTracking && inputTracking && pedido) {
        if (pedido.estado === 'Enviado') {
            contenedorTracking.classList.remove('hidden');
            inputTracking.value = pedido.trackingNumero || '';
        } else {
            contenedorTracking.classList.add('hidden');
            inputTracking.value = '';
        }
    }
    document.getElementById('ped-estado').value = pedido.estado; 
    
    document.getElementById('ped-cliente-nombre').textContent = sanitize(pedido.clienteNombre || 'Sin nombre');
    document.getElementById('ped-cliente-email').textContent = sanitize(pedido.clienteEmail || 'Sin email');
    document.getElementById('ped-cliente-direccion').textContent = sanitize(pedido.direccion || 'Sin dirección');

    document.getElementById('ped-pago-metodo').textContent = sanitize(pedido.metodoPago || 'No especificado');
    document.getElementById('ped-pago-referencia').textContent = sanitize(pedido.referencia || 'N/A');

    const contComprobante = document.getElementById('ped-contenedor-comprobante');
    const imgComprobante = document.getElementById('ped-img-comprobante');
    const enlaceComprobante = document.getElementById('ped-enlace-comprobante');
    const txtNoComprobante = document.getElementById('ped-no-comprobante');

    if (pedido.comprobanteUrl && pedido.comprobanteUrl.startsWith('http')) {
        imgComprobante.src = pedido.comprobanteUrl;
        enlaceComprobante.href = pedido.comprobanteUrl;
        contComprobante.classList.remove('hidden');
        txtNoComprobante.classList.add('hidden');
    } else {
        contComprobante.classList.add('hidden');
        txtNoComprobante.classList.remove('hidden');
    }

    const listaProd = document.getElementById('ped-productos-lista');
    
    if (pedido.productos && pedido.productos.length > 0) {
        let htmlTemporal = '';
        pedido.productos.forEach(prod => {
            const img = prod.imagen || 'https://via.placeholder.com/50';
            htmlTemporal += `
                <li class="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                    <img src="${img}" class="w-12 h-12 rounded object-cover border border-gray-200">
                    <div class="flex-1">
                        <p class="text-sm font-bold text-gray-800 line-clamp-1">${sanitize(prod.nombre)}</p>
                        <p class="text-xs text-gray-500">${prod.cantidad} und(s) x <span class="text-gray-800 font-bold">$${prod.precio.toFixed(2)}</span></p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-gray-800">$${(prod.cantidad * prod.precio).toFixed(2)}</p>
                    </div>
                </li>
            `;
        });
        listaProd.innerHTML = htmlTemporal;
    } else {
        listaProd.innerHTML = '<li class="text-sm text-gray-500 italic text-center py-4">No hay productos en esta orden.</li>';
    }

    const totalDolares = pedido.totalUSD || pedido.total || 0;
    document.getElementById('ped-total-usd').textContent = `$${totalDolares.toFixed(2)}`;
    
    let textoSecundario = '';
    if (pedido.monedaSecundaria === 'VES' || (!pedido.monedaSecundaria && pedido.totalVES)) {
        textoSecundario = `Bs. ${(pedido.totalSecundario || pedido.totalVES || 0).toFixed(2)}`;
    } else if (pedido.monedaSecundaria === 'COP') {
        textoSecundario = `$ ${(pedido.totalSecundario || 0).toFixed(2)} COP`;
    }
    document.getElementById('ped-total-secundario').textContent = textoSecundario;

    document.getElementById('modal-pedido').classList.remove('hidden'); 
};

// Ajusta el stock de un ítem de pedido. signo +1 repone (cancelar), -1 descuenta (reactivar).
// Si el ítem tiene variantId, ajusta el stock de esa variante y recalcula el total del producto.
async function ajustarStockItem(item, signo) {
    const idReal = item.productoOriginalId || item.id;
    const ref = doc(db, "products", idReal);
    if (item.variantId) {
        const snap = await getDoc(ref);
        if (!snap.exists()) return;
        const datos = snap.data();
        const variantes = Array.isArray(datos.variantes) ? datos.variantes.map(v => ({ ...v })) : [];
        const v = variantes.find(x => x.id === item.variantId);
        if (v) v.stock = Math.max(0, (v.stock || 0) + signo * item.cantidad);
        const total = variantes.reduce((s, x) => s + (x.stock || 0), 0);
        await updateDoc(ref, { variantes, stock: total });
    } else {
        await updateDoc(ref, { stock: increment(signo * item.cantidad) });
    }
}

// ==========================================
// TAREA 4: NOTIFICAR AL CLIENTE POR WHATSAPP (wa.me)
// ==========================================
// Normaliza el teléfono para wa.me (solo dígitos, con código de país).
// Heurística Venezuela: 0412... -> 58412...
function normalizarTelefonoWa(tel) {
    let d = (tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('58')) return d;
    if (d.startsWith('0')) return '58' + d.slice(1);
    return d;
}

function mensajeWhatsAppPedido(pedido, estado, tracking) {
    const idCorto = '#' + pedido.id.slice(-6).toUpperCase();
    const nombre = pedido.clienteNombre || '';
    const tienda = '*Detalles y Sorpresas STORE*';
    const saludo = `¡Hola ${nombre}! 👋`;
    let cuerpo;
    switch (estado) {
        case 'Enviado':
            cuerpo = `Tu pedido ${idCorto} de ${tienda} ya fue *enviado* 🚚.`;
            if (tracking) cuerpo += ` Tu número de guía es: *${tracking}*.`;
            cuerpo += ` ¡Pronto lo tendrás contigo!`;
            break;
        case 'Entregado':
            cuerpo = `Tu pedido ${idCorto} de ${tienda} fue marcado como *entregado* ✅. ¡Gracias por tu compra! 💖`;
            break;
        case 'Procesando':
            cuerpo = `Tu pedido ${idCorto} de ${tienda} está *en preparación* 📦. Te avisamos cuando salga.`;
            break;
        case 'Cancelado':
            cuerpo = `Tu pedido ${idCorto} de ${tienda} fue *cancelado*. Si tienes dudas, respóndenos por aquí.`;
            break;
        default:
            cuerpo = `Recibimos tu pedido ${idCorto} en ${tienda} y está *pendiente por confirmar*. Te avisamos apenas avance.`;
    }
    return `${saludo}\n\n${cuerpo}`;
}

window.notificarPedidoWhatsApp = () => {
    const id = document.getElementById('ped-id').value;
    const pedido = pedidosGlobales.find(p => p.id === id);
    if (!pedido) { showToast("No se encontró el pedido.", "error"); return; }

    // Teléfono: primero el guardado en la orden; si no, buscar en el directorio de clientes por email
    let telRaw = pedido.clienteTelefono || '';
    if (!telRaw && pedido.clienteEmail) {
        const cliente = clientesGlobales.find(c => (c.email || '').toLowerCase() === pedido.clienteEmail.toLowerCase());
        if (cliente) telRaw = cliente.phone || '';
    }
    const telefono = normalizarTelefonoWa(telRaw);
    if (!telefono) { showToast("Este cliente no tiene un teléfono registrado para WhatsApp.", "warning"); return; }

    // Estado y tracking según lo que se ve en el modal
    const estado = document.getElementById('ped-estado').value || pedido.estado;
    const tracking = (document.getElementById('input-tracking-numero')?.value.trim()) || pedido.trackingNumero || '';

    const mensaje = mensajeWhatsAppPedido(pedido, estado, tracking);
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank');
};

window.actualizarEstadoPedido = async () => {
    const id = document.getElementById('ped-id').value; 
    const nuevoEstado = document.getElementById('ped-estado').value; 
    const btnGuardar = document.getElementById('btn-guardar-pedido');
    btnGuardar.disabled = true; 
    btnGuardar.innerText = "Guardando...";

    try { 
        const orderRef = doc(db, "orders", id);
        const orderSnap = await getDoc(orderRef);
        
        if (orderSnap.exists()) {
            const orderData = orderSnap.data();
            
            if (nuevoEstado === 'Cancelado' && orderData.estado !== 'Cancelado') {
                for (const item of orderData.productos) await ajustarStockItem(item, +1); // reponer
            }
            else if (orderData.estado === 'Cancelado' && nuevoEstado !== 'Cancelado') {
                for (const item of orderData.productos) await ajustarStockItem(item, -1); // descontar
            }
        }

        const datosActualizar = { estado: nuevoEstado };
        if (nuevoEstado === 'Enviado') {
            const tracking = document.getElementById('input-tracking-numero')?.value.trim();
            if (tracking) datosActualizar.trackingNumero = tracking;
        }
        // Guardar historial de cambios (orderData puede ser undefined si el doc no existía)
        const historialPrevio = (typeof orderData !== 'undefined' ? orderData.historial : null) || [];
        const historialEntry = {
            estado: nuevoEstado,
            fecha: new Date().toISOString(),
            nota: document.getElementById('input-nota-pedido')?.value.trim() || ''
        };
        datosActualizar.historial = [...historialPrevio, historialEntry];

        await updateDoc(orderRef, datosActualizar);
        // Si es Enviado/Entregado, dejamos el modal abierto para poder notificar por WhatsApp
        if (nuevoEstado === 'Enviado' || nuevoEstado === 'Entregado') {
            showToast("Pedido actualizado. Ahora puedes notificar al cliente por WhatsApp 👇", "info", 6000);
        } else {
            document.getElementById('modal-pedido').classList.add('hidden');
            showToast("Estado del pedido actualizado.", "success");
        }
        cargarPedidos();
        cargarProductos();

    } catch (error) { 
        showToast("Error al actualizar el estado del pedido.", "error"); 
        console.error(error); 
    } finally { 
        btnGuardar.disabled = false; 
        btnGuardar.innerHTML = `<i class="ph-bold ph-floppy-disk"></i> Guardar Cambios`; 
    }
};
