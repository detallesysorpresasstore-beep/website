/**
 * Detalles y Sorpresas STORE - Lógica Central del Panel de Administración
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const IMGBB_API_KEY = '6b8e2fe1e92a74135200cbf5317aa9bf';

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
});

function verificarSeguridad() {
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = 'index.html';
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
    buscadorProductos.addEventListener('input', aplicarFiltrosProductos);
    filtroCategoria.addEventListener('change', () => { actualizarSelectSubcategoriasFiltro(); aplicarFiltrosProductos(); });
    filtroSubcategoria.addEventListener('change', aplicarFiltrosProductos);

    btnNuevaCategoria.addEventListener('click', () => { document.getElementById('form-categoria').reset(); modalCategoria.classList.remove('hidden'); });
    document.getElementById('btn-cerrar-modal-cat').addEventListener('click', () => modalCategoria.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-cat').addEventListener('click', () => modalCategoria.classList.add('hidden'));
    btnGuardarCategoria.addEventListener('click', guardarCategoria);
    if (buscadorCategorias) buscadorCategorias.addEventListener('input', aplicarFiltrosCategorias);

    if (btnNuevaSubcategoria) { btnNuevaSubcategoria.addEventListener('click', () => { document.getElementById('form-subcategoria').reset(); modalSubcategoria.classList.remove('hidden'); }); }
    document.getElementById('btn-cerrar-modal-subcat').addEventListener('click', () => modalSubcategoria.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-subcat').addEventListener('click', () => modalSubcategoria.classList.add('hidden'));
    if (btnGuardarSubcategoria) btnGuardarSubcategoria.addEventListener('click', guardarSubcategoria);

    document.getElementById('btn-cerrar-modal-ped').addEventListener('click', () => modalPedido.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-ped').addEventListener('click', () => modalPedido.classList.add('hidden'));
    if (filtroFechaPedidos) filtroFechaPedidos.addEventListener('change', aplicarFiltrosPedidos);
    if (filtroEstadoPedidos) filtroEstadoPedidos.addEventListener('change', aplicarFiltrosPedidos);

    if (btnExportarClientes) btnExportarClientes.addEventListener('click', exportarClientesExcel);
    if (buscadorClientes) buscadorClientes.addEventListener('input', aplicarFiltrosClientes);
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
    if (!fechaLimite) return alert("Por favor selecciona una fecha límite.");

    const pedidosAEliminar = pedidosGlobales.filter(p => {
        if (!p.fecha) return false;
        const fechaPedido = p.fecha.split('T')[0]; 
        return fechaPedido <= fechaLimite;
    });

    if (pedidosAEliminar.length === 0) {
        return alert("No se encontraron pedidos registrados en esa fecha o anteriores.");
    }

    if (!confirm(`⚠️ ADVERTENCIA: Estás a punto de eliminar permanentemente ${pedidosAEliminar.length} pedido(s). Esta acción NO se puede deshacer. ¿Deseas continuar?`)) {
        return;
    }

    const originalText = btnConfirmar.innerHTML;
    btnConfirmar.disabled = true;
    btnConfirmar.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Eliminando...';

    try {
        for (const pedido of pedidosAEliminar) {
            await deleteDoc(doc(db, "orders", pedido.id));
        }
        alert(`✅ Se eliminaron ${pedidosAEliminar.length} pedidos del historial de forma exitosa.`);
        modalLimpiar.classList.add('hidden');
        cargarPedidos(); 
    } catch (error) {
        console.error("Error al limpiar historial:", error);
        alert("Ocurrió un error durante la limpieza del historial.");
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerHTML = "Eliminar Pedidos";
    }
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
        alert("Configuración actualizada con éxito.");
    } catch (error) {
        console.error("Error al guardar:", error); alert("Error al guardar.");
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
                    <td class="p-4 font-medium text-gray-800">${p.nombre}</td>
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

    if (!nombre) return alert("El nombre del método de pago es obligatorio.");

    btnGuardarPago.disabled = true; btnGuardarPago.innerText = "Guardando...";
    try {
        const datos = { nombre, moneda, descuento, requisitos, instrucciones };
        if (id) await updateDoc(doc(db, "payment_methods", id), datos);
        else await addDoc(paymentsCollection, datos);
        
        modalPago.classList.add('hidden');
        cargarPagos();
    } catch (error) { alert("Error al guardar."); console.error(error); } 
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
    if(confirm("¿Seguro que deseas eliminar este método de pago?")) {
        await deleteDoc(doc(db, "payment_methods", id)); cargarPagos();
    }
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
                    <td class="p-4 font-medium text-gray-800">${p.nombre}</td>
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

    if (!nombre || !productoOfertaId || porcentajeDescuento <= 0) return alert("Completa el nombre, selecciona un producto para ofertar y pon un descuento válido.");

    btnGuardarPromocion.disabled = true; btnGuardarPromocion.innerText = "Guardando...";
    try {
        const datos = { nombre, categoriaCondicion, cantidadCondicion, productoOfertaId, porcentajeDescuento, activa: true };
        if (id) await updateDoc(doc(db, "promotions", id), datos);
        else await addDoc(promosCollection, datos);
        
        modalPromocion.classList.add('hidden');
        cargarPromociones();
    } catch (error) { alert("Error al guardar."); console.error(error); } 
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

window.eliminarPromo = async (id) => {
    if(confirm("¿Seguro que deseas eliminar esta promoción?")) {
        await deleteDoc(doc(db, "promotions", id)); cargarPromociones();
    }
};

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

    if(!prodId || descuento <= 0 || descuento >= 100) {
        return alert("Debes seleccionar un producto de la lista y asignar un descuento válido (1 al 99%).");
    }

    btnGuardarOferta.disabled = true; 
    btnGuardarOferta.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';
    try {
        await updateDoc(doc(db, "products", prodId), { descuento: descuento });
        modalOferta.classList.add('hidden');
        cargarProductos(); // Esto refrescará tanto la tabla de productos como la de ofertas
    } catch (error) { 
        alert("Error al aplicar la oferta."); 
        console.error(error); 
    } finally { 
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
                        <span class="font-medium text-gray-800 line-clamp-1">${p.nombre}</span>
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
        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${cat.nombre}</td><td class="p-4 text-gray-600">${subcatsTexto}</td><td class="p-4 text-gray-500"><i class="${cat.icono} text-xl text-brand-orange mr-2"></i> ${cat.icono}</td><td class="p-4 text-center"><button onclick="eliminarCategoria('${cat.id}')" class="text-gray-400 hover:text-red-500 p-1"><i class="ph ph-trash text-xl"></i></button></td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

async function guardarCategoria() {
    const nombre = document.getElementById('cat-nombre').value.trim(); const icono = document.getElementById('cat-icono').value.trim() || 'ph-tag';
    if (!nombre) return alert("El nombre es obligatorio.");
    btnGuardarCategoria.disabled = true; btnGuardarCategoria.innerText = "Guardando...";
    try { await addDoc(categoriesCollection, { nombre, icono, subcategorias: [] }); document.getElementById('modal-categoria').classList.add('hidden'); await cargarCategorias(); } 
    catch (error) { alert("Hubo un error."); } finally { btnGuardarCategoria.disabled = false; btnGuardarCategoria.innerText = "Guardar"; }
}

async function guardarSubcategoria() {
    const parentId = document.getElementById('subcat-parent').value; const subName = document.getElementById('subcat-nombre').value.trim();
    if (!parentId || !subName) return alert("Selecciona una categoría padre y escribe un nombre.");
    btnGuardarSubcategoria.disabled = true; btnGuardarSubcategoria.innerText = "Guardando...";
    try {
        const categoriaPadre = categoriasGlobales.find(c => c.id === parentId);
        const nuevasSubcategorias = [...(categoriaPadre.subcategorias || [])];
        const existe = nuevasSubcategorias.find(s => s.toLowerCase() === subName.toLowerCase());
        if (!existe) { nuevasSubcategorias.push(subName); await updateDoc(doc(db, "categories", parentId), { subcategorias: nuevasSubcategorias }); } else { alert("Esta subcategoría ya existe en esta categoría."); }
        document.getElementById('modal-subcategoria').classList.add('hidden'); await cargarCategorias(); 
    } catch (error) { alert("Hubo un error al guardar."); } finally { btnGuardarSubcategoria.disabled = false; btnGuardarSubcategoria.innerText = "Guardar Subcategoría"; }
}

window.eliminarCategoria = async (id) => { if(confirm("¿Seguro que deseas eliminar esta categoría?")) { await deleteDoc(doc(db, "categories", id)); cargarCategorias(); } };

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
    if (!nombre || !categoria || !subcategoria || isNaN(precio) || arrayImagenesUrls.length === 0) return alert("Completa los datos obligatorios y sube foto.");
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

        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4"><div class="flex items-center gap-3">${imgHTML}<div><span class="font-medium text-gray-800">${prod.nombre}</span>${etiquetaOferta}</div></div></td><td class="p-4"><span class="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">${prod.categoria}</span><br><span class="text-xs text-gray-500 mt-1 inline-block"><i class="ph ph-arrow-elbow-down-right"></i> ${prod.subcategoria}</span></td><td class="p-4 font-bold text-gray-800">$${prod.precio.toFixed(2)}</td><td class="p-4 ${stockColor}">${prod.stock} unds</td><td class="p-4 text-center"><button onclick="prepararEdicionProd('${prod.id}')" class="text-gray-400 hover:text-brand-blue p-1"><i class="ph ph-pencil-simple text-xl"></i></button><button onclick="eliminarProducto('${prod.id}')" class="text-gray-400 hover:text-red-500 p-1 ml-2"><i class="ph ph-trash text-xl"></i></button></td></tr>`;
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

window.eliminarProducto = async (id) => { if(confirm("¿Seguro que deseas eliminar este producto?")) { await deleteDoc(doc(db, "products", id)); cargarProductos(); } };

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
        htmlTemporal += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${user.name || 'Sin Nombre'}</td><td class="p-4 text-gray-600">${user.email}</td><td class="p-4 text-gray-600">${telefonoTexto}</td><td class="p-4">${badgeRol}</td><td class="p-4 text-gray-500">${fecha}</td></tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

function exportarClientesExcel() {
    if (clientesFiltrados.length === 0) return alert("No hay clientes para exportar.");
    const datosLimpios = clientesFiltrados.map(c => ({ "Nombre Completo": c.name || 'Sin nombre', "Correo Electrónico": c.email, "Teléfono": c.phone || 'N/A', "Rol del Sistema": c.role === 'admin' ? 'Administrador' : 'Cliente', "Fecha de Registro": c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A' }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Directorio"); XLSX.writeFile(libro, "Directorio_Filtrado.xlsx");
}

async function cargarPedidos() {
    try { const querySnapshot = await getDocs(ordersCollection); pedidosGlobales = []; querySnapshot.forEach((docSnap) => { const pedido = docSnap.data(); pedido.id = docSnap.id; pedidosGlobales.push(pedido); }); aplicarFiltrosPedidos(); } catch (error) { console.error(error); }
}

function aplicarFiltrosPedidos() {
    const fecha = filtroFechaPedidos ? filtroFechaPedidos.value : ''; const estado = filtroEstadoPedidos ? filtroEstadoPedidos.value : '';
    const filtrados = pedidosGlobales.filter(p => { const coincideEstado = estado === "" || p.estado === estado; const coincideFecha = fecha === "" || (p.fecha && p.fecha.split('T')[0] === fecha); return coincideEstado && coincideFecha; });
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
            <td class="p-4 font-medium text-gray-800">${pedido.clienteNombre}</td>
            <td class="p-4 font-bold text-gray-800">$${pedido.totalUSD ? pedido.totalUSD.toFixed(2) : (pedido.total || 0).toFixed(2)}</td>
            <td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${colorEstado}">${pedido.estado}</span></td>
            <td class="p-4 text-center"><button onclick="abrirModalPedido('${pedido.id}')" class="text-brand-blue hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors">Ver / Editar</button></td>
        </tr>`;
    });
    tbody.innerHTML = htmlTemporal;
}

window.abrirModalPedido = (id) => { 
    const pedido = pedidosGlobales.find(p => p.id === id);
    if(!pedido) return;

    document.getElementById('ped-id').value = id; 
    document.getElementById('ped-id-display').textContent = `#${id.slice(-6).toUpperCase()}`;
    document.getElementById('ped-estado').value = pedido.estado; 
    
    document.getElementById('ped-cliente-nombre').textContent = pedido.clienteNombre || 'Sin nombre';
    document.getElementById('ped-cliente-email').textContent = pedido.clienteEmail || 'Sin email';
    document.getElementById('ped-cliente-direccion').textContent = pedido.direccion || 'Sin dirección';

    document.getElementById('ped-pago-metodo').textContent = pedido.metodoPago || 'No especificado';
    document.getElementById('ped-pago-referencia').textContent = pedido.referencia || 'N/A';

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
                        <p class="text-sm font-bold text-gray-800 line-clamp-1">${prod.nombre}</p>
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

        await updateDoc(orderRef, { estado: nuevoEstado }); 
        document.getElementById('modal-pedido').classList.add('hidden'); 
        cargarPedidos(); 
        cargarProductos(); 
        
    } catch (error) { 
        alert("Error al actualizar el estado del pedido."); 
        console.error(error); 
    } finally { 
        btnGuardar.disabled = false; 
        btnGuardar.innerHTML = `<i class="ph-bold ph-floppy-disk"></i> Guardar Cambios`; 
    }
};
