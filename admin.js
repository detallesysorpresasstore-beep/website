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

async function guardarProducto() {
    const id = document.getElementById('prod-id').value; const nombre = document.getElementById('prod-nombre').value.trim(); const categoria = document.getElementById('prod-categoria').value; const subcategoria = document.getElementById('prod-subcategoria').value; const precio = parseFloat(document.getElementById('prod-precio').value); const stock = parseInt(document.getElementById('prod-stock').value) || 0; const descripcion = document.getElementById('prod-descripcion').value.trim();
    if (!nombre || !categoria || !subcategoria || isNaN(precio) || arrayImagenesUrls.length === 0) { showToast("Completa todos los datos y sube al menos una foto.", "warning"); return; }
    btnGuardarProducto.disabled = true; btnGuardarProducto.innerText = "Guardando...";
    try {
        const datos = { nombre, categoria, subcategoria, precio, stock, descripcion, imagenes: arrayImagenesUrls, fechaActualizacion: new Date().toISOString() };
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

        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4"><div class="flex items-center gap-3">${imgHTML}<div><span class="font-medium text-gray-800">${sanitize(prod.nombre)}</span>${etiquetaOferta}</div></div></td><td class="p-4"><span class="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">${sanitize(prod.categoria)}</span><br><span class="text-xs text-gray-500 mt-1 inline-block"><i class="ph ph-arrow-elbow-down-right"></i> ${sanitize(prod.subcategoria)}</span></td><td class="p-4 font-bold text-gray-800">$${prod.precio.toFixed(2)}</td><td class="p-4 ${stockColor}">${prod.stock} unds</td><td class="p-4 text-center"><button onclick="prepararEdicionProd('${prod.id}')" class="text-gray-400 hover:text-brand-blue p-1"><i class="ph ph-pencil-simple text-xl"></i></button><button onclick="eliminarProducto('${prod.id}')" class="text-gray-400 hover:text-red-500 p-1 ml-2"><i class="ph ph-trash text-xl"></i></button></td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

function resetearModalProducto(titulo) {
    document.getElementById('form-producto').reset(); document.getElementById('prod-id').value = ''; document.getElementById('prod-descripcion').value = ''; document.getElementById('prod-stock').value = 1; actualizarSelectSubcategoriasFormulario(""); arrayImagenesUrls = []; renderizarGaleria(); document.getElementById('modal-titulo').innerText = titulo;
}

window.prepararEdicionProd = (id) => {
    const prod = productosGlobales.find(p => p.id === id); if (!prod) return;
    resetearModalProducto("Editar Producto"); document.getElementById('prod-id').value = prod.id; document.getElementById('prod-nombre').value = prod.nombre; document.getElementById('prod-categoria').value = prod.categoria; document.getElementById('prod-precio').value = prod.precio; document.getElementById('prod-stock').value = prod.stock !== undefined ? prod.stock : 10; document.getElementById('prod-descripcion').value = prod.descripcion || ''; actualizarSelectSubcategoriasFormulario(prod.categoria, prod.subcategoria); arrayImagenesUrls = [...prod.imagenes]; renderizarGaleria(); document.getElementById('modal-producto').classList.remove('hidden');
};

window.eliminarProducto = async (id) => { showConfirm("¿Seguro que deseas eliminar este producto?", async () => { await deleteDoc(doc(db, "products", id)); cargarProductos(); showToast("Producto eliminado.", "success"); }, "Eliminar", true); };

function exportarProductosExcel() {
    if (productosFiltrados.length === 0) return alert("No hay productos para exportar.");
    const datosLimpios = productosFiltrados.map(p => ({ "ID Producto": p.id, "Nombre": p.nombre, "Categoría": p.categoria, "Subcategoría": p.subcategoria, "Precio ($)": p.precio, "Stock Físico": p.stock, "Descripción": p.descripcion || 'N/A', "Cantidad de Fotos": p.imagenes ? p.imagenes.length : 0, "Fecha de Registro": p.fechaCreacion ? new Date(p.fechaCreacion).toLocaleDateString() : 'N/A' }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Inventario"); XLSX.writeFile(libro, "Inventario_Filtrado.xlsx");
}

async function cargarClientes() {
    try { const querySnapshot = await getDocs(usersCollection); clientesGlobales = []; querySnapshot.forEach((docSnap) => { clientesGlobales.push(docSnap.data()); }); aplicarFiltrosClientes(); } catch (error) { console.error(error); }
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
    if (arreglo.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">No se encontraron clientes.</td></tr>'; return; }
    
    let htmlTemporal = '';
    arreglo.forEach((user) => {
        const fecha = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
        const badgeRol = user.role === 'admin' ? '<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Admin</span>' : '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Cliente</span>';
        const telefonoTexto = user.phone ? user.phone : '<span class="text-gray-400 italic">No proporcionado</span>';
        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${sanitize(user.name || 'Sin Nombre')}</td><td class="p-4 text-gray-600">${sanitize(user.email)}</td><td class="p-4 text-gray-600">${telefonoTexto}</td><td class="p-4">${badgeRol}</td><td class="p-4 text-gray-500">${fecha}</td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

function exportarClientesExcel() {
    if (clientesFiltrados.length === 0) return alert("No hay clientes para exportar.");
    const datosLimpios = clientesFiltrados.map(c => ({ "Nombre Completo": c.name || 'Sin nombre', "Correo Electrónico": c.email, "Teléfono": c.phone || 'N/A', "Rol del Sistema": c.role === 'admin' ? 'Administrador' : 'Cliente', "Fecha de Registro": c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A' }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Directorio"); XLSX.writeFile(libro, "Directorio_Filtrado.xlsx");
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
                for (const item of orderData.productos) {
                    const idReal = item.productoOriginalId || item.id;
                    await updateDoc(doc(db, "products", idReal), { stock: increment(item.cantidad) });
                }
            } 
            else if (orderData.estado === 'Cancelado' && nuevoEstado !== 'Cancelado') {
                for (const item of orderData.productos) {
                    const idReal = item.productoOriginalId || item.id;
                    await updateDoc(doc(db, "products", idReal), { stock: increment(-item.cantidad) });
                }
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
        document.getElementById('modal-pedido').classList.add('hidden'); 
        showToast("Estado del pedido actualizado.", "success");
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
