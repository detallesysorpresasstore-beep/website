/**
 * Detalles y Sorpresas STORE - Lógica Central del Panel de Administración
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const IMGBB_API_KEY = '6b8e2fe1e92a74135200cbf5317aa9bf';

// ==========================================
// REFERENCIAS DEL DOM
// ==========================================

const btnLogout = document.getElementById('btn-logout');

// Modales y Botones de Productos
const modalProducto = document.getElementById('modal-producto');
const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const btnExportarProductos = document.getElementById('btn-exportar-productos');
const selectProdCategoria = document.getElementById('prod-categoria');

// Filtros de Productos
const buscadorProductos = document.getElementById('buscador-productos');
const filtroCategoria = document.getElementById('filtro-categoria');
const filtroSubcategoria = document.getElementById('filtro-subcategoria');

// Modales y Botones de Categorías
const modalCategoria = document.getElementById('modal-categoria');
const btnNuevaCategoria = document.getElementById('btn-nueva-categoria');
const btnGuardarCategoria = document.getElementById('btn-guardar-categoria');

// Modales y Botones de Subcategorías
const modalSubcategoria = document.getElementById('modal-subcategoria');
const btnNuevaSubcategoria = document.getElementById('btn-nueva-subcategoria');
const btnGuardarSubcategoria = document.getElementById('btn-guardar-subcategoria');
const selectSubcatParent = document.getElementById('subcat-parent');

// Modales y Botones de Pedidos
const modalPedido = document.getElementById('modal-pedido');
const btnGuardarPedido = document.getElementById('btn-guardar-pedido');

// Botones de Clientes
const btnExportarClientes = document.getElementById('btn-exportar-clientes');

// NUEVO: Botón de Configuración
const btnGuardarConfiguracion = document.getElementById('btn-guardar-configuracion');

// Referencias a Colecciones en Firestore
const productsCollection = collection(db, "products");
const categoriesCollection = collection(db, "categories");
const ordersCollection = collection(db, "orders");
const usersCollection = collection(db, "artifacts/detalles-y-sorpresas-store/public/data/users");
const configDocRef = doc(db, "config", "store_settings"); // NUEVO: Documento único de configuración

// Variables Globales
let productosGlobales = [];
let productosFiltrados = [];
let categoriasGlobales = []; 
let clientesGlobales = []; 
let arrayImagenesUrls = [];

// ==========================================
// INICIALIZACIÓN Y SEGURIDAD
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    verificarSeguridad();
    configurarEventos();
    
    // Cargas iniciales
    cargarConfiguracion(); // Cargar la tasa y datos bancarios
    cargarCategorias().then(() => {
        cargarProductos();
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
                await signOut(auth);
                window.location.href = 'index.html';
            }
        });
    }

    // ---- EVENTOS PRODUCTOS ----
    btnNuevoProducto.addEventListener('click', () => {
        resetearModalProducto("Añadir Nuevo Producto");
        modalProducto.classList.remove('hidden');
    });
    document.getElementById('btn-cerrar-modal-prod').addEventListener('click', () => modalProducto.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-prod').addEventListener('click', () => modalProducto.classList.add('hidden'));
    document.getElementById('prod-imagen').addEventListener('change', manejarSubidaMultiplesImagenes);
    btnGuardarProducto.addEventListener('click', guardarProducto);
    if (btnExportarProductos) btnExportarProductos.addEventListener('click', exportarProductosExcel);

    selectProdCategoria.addEventListener('change', (e) => {
        actualizarSelectSubcategoriasFormulario(e.target.value);
    });

    buscadorProductos.addEventListener('input', aplicarFiltrosProductos);
    filtroCategoria.addEventListener('change', () => {
        actualizarSelectSubcategoriasFiltro();
        aplicarFiltrosProductos();
    });
    filtroSubcategoria.addEventListener('change', aplicarFiltrosProductos);

    // ---- EVENTOS CATEGORÍAS PRINCIPALES ----
    btnNuevaCategoria.addEventListener('click', () => {
        document.getElementById('form-categoria').reset();
        modalCategoria.classList.remove('hidden');
    });
    document.getElementById('btn-cerrar-modal-cat').addEventListener('click', () => modalCategoria.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-cat').addEventListener('click', () => modalCategoria.classList.add('hidden'));
    btnGuardarCategoria.addEventListener('click', guardarCategoria);

    // ---- EVENTOS SUBCATEGORÍAS ----
    if (btnNuevaSubcategoria) {
        btnNuevaSubcategoria.addEventListener('click', () => {
            document.getElementById('form-subcategoria').reset();
            modalSubcategoria.classList.remove('hidden');
        });
    }
    document.getElementById('btn-cerrar-modal-subcat').addEventListener('click', () => modalSubcategoria.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-subcat').addEventListener('click', () => modalSubcategoria.classList.add('hidden'));
    if (btnGuardarSubcategoria) btnGuardarSubcategoria.addEventListener('click', guardarSubcategoria);

    // ---- EVENTOS PEDIDOS / CLIENTES ----
    document.getElementById('btn-cerrar-modal-ped').addEventListener('click', () => modalPedido.classList.add('hidden'));
    document.getElementById('btn-cancelar-modal-ped').addEventListener('click', () => modalPedido.classList.add('hidden'));
    btnGuardarPedido.addEventListener('click', actualizarEstadoPedido);
    if (btnExportarClientes) btnExportarClientes.addEventListener('click', exportarClientesExcel);

    // ---- NUEVO: EVENTOS CONFIGURACIÓN ----
    if (btnGuardarConfiguracion) btnGuardarConfiguracion.addEventListener('click', guardarConfiguracion);
}

// ==========================================
// MÓDULO: CONFIGURACIÓN DE LA TIENDA
// ==========================================

async function cargarConfiguracion() {
    try {
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const inputTasa = document.getElementById('config-tasa-bcv');
            const inputPM = document.getElementById('config-pago-movil');
            const inputTrans = document.getElementById('config-transferencia');
            const inputZelle = document.getElementById('config-zelle');
            const inputBinance = document.getElementById('config-binance');

            if (inputTasa) inputTasa.value = data.tasaBcv || '';
            if (inputPM) inputPM.value = data.pagoMovil || '';
            if (inputTrans) inputTrans.value = data.transferencia || '';
            if (inputZelle) inputZelle.value = data.zelle || '';
            if (inputBinance) inputBinance.value = data.binance || '';
        }
    } catch (error) {
        console.error("Error cargando configuración:", error);
    }
}

async function guardarConfiguracion() {
    if(!btnGuardarConfiguracion) return;
    const originalText = btnGuardarConfiguracion.innerHTML;
    btnGuardarConfiguracion.disabled = true;
    btnGuardarConfiguracion.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Guardando...';

    const tasaBcv = parseFloat(document.getElementById('config-tasa-bcv').value) || 0;
    const pagoMovil = document.getElementById('config-pago-movil').value.trim();
    const transferencia = document.getElementById('config-transferencia').value.trim();
    const zelle = document.getElementById('config-zelle').value.trim();
    const binance = document.getElementById('config-binance').value.trim();

    try {
        // Usamos { merge: true } para crear el documento si no existe, o actualizarlo si ya existe
        await setDoc(configDocRef, {
            tasaBcv: tasaBcv,
            pagoMovil: pagoMovil,
            transferencia: transferencia,
            zelle: zelle,
            binance: binance,
            fechaActualizacion: new Date().toISOString()
        }, { merge: true });
        
        alert("¡Configuración de la tienda guardada con éxito!");
    } catch (error) {
        console.error("Error al guardar configuración:", error);
        alert("Ocurrió un error al guardar. Verifica los permisos de Firebase.");
    } finally {
        btnGuardarConfiguracion.disabled = false;
        btnGuardarConfiguracion.innerHTML = originalText;
    }
}

// ==========================================
// MÓDULO: CATEGORÍAS Y SUBCATEGORÍAS
// ==========================================

async function cargarCategorias() {
    const tbody = document.getElementById('admin-categories-list');
    try {
        const querySnapshot = await getDocs(categoriesCollection);
        tbody.innerHTML = '';
        selectProdCategoria.innerHTML = '<option value="">Seleccionar categoría...</option>';
        filtroCategoria.innerHTML = '<option value="">Todas las Categorías</option>';
        selectSubcatParent.innerHTML = '<option value="">Selecciona la categoría principal...</option>'; 
        categoriasGlobales = [];

        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay categorías. Crea una.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const cat = docSnap.data();
            cat.id = docSnap.id;
            categoriasGlobales.push(cat); 

            const subcatsTexto = (cat.subcategorias && cat.subcategorias.length > 0) 
                ? cat.subcategorias.map(s => `<span class="inline-block bg-gray-100 px-2 py-1 rounded text-xs mr-1 mb-1">${s}</span>`).join('') 
                : '<span class="text-gray-400 italic">Sin subcategorías</span>';

            tbody.innerHTML += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-4 font-medium text-gray-800">${cat.nombre}</td>
                    <td class="p-4 text-gray-600">${subcatsTexto}</td>
                    <td class="p-4 text-gray-500"><i class="${cat.icono} text-xl text-brand-orange mr-2"></i> ${cat.icono}</td>
                    <td class="p-4 text-center">
                        <button onclick="eliminarCategoria('${cat.id}')" class="text-gray-400 hover:text-red-500 p-1">
                            <i class="ph ph-trash text-xl"></i>
                        </button>
                    </td>
                </tr>
            `;
            selectProdCategoria.innerHTML += `<option value="${cat.nombre}">${cat.nombre}</option>`;
            filtroCategoria.innerHTML += `<option value="${cat.nombre}">${cat.nombre}</option>`;
            selectSubcatParent.innerHTML += `<option value="${cat.id}">${cat.nombre}</option>`; 
        });
    } catch (error) { console.error("Error cargando categorías:", error); }
}

async function guardarCategoria() {
    const nombre = document.getElementById('cat-nombre').value.trim();
    const icono = document.getElementById('cat-icono').value.trim() || 'ph-tag';
    if (!nombre) return alert("El nombre es obligatorio.");

    btnGuardarCategoria.disabled = true;
    btnGuardarCategoria.innerText = "Guardando...";

    try {
        await addDoc(categoriesCollection, { nombre, icono, subcategorias: [] });
        modalCategoria.classList.add('hidden');
        await cargarCategorias(); 
    } catch (error) { alert("Hubo un error."); } 
    finally { btnGuardarCategoria.disabled = false; btnGuardarCategoria.innerText = "Guardar"; }
}

async function guardarSubcategoria() {
    const parentId = document.getElementById('subcat-parent').value;
    const subName = document.getElementById('subcat-nombre').value.trim();

    if (!parentId || !subName) return alert("Selecciona una categoría padre y escribe un nombre.");

    btnGuardarSubcategoria.disabled = true;
    btnGuardarSubcategoria.innerText = "Guardando...";

    try {
        const categoriaPadre = categoriasGlobales.find(c => c.id === parentId);
        const nuevasSubcategorias = [...(categoriaPadre.subcategorias || [])];
        const existe = nuevasSubcategorias.find(s => s.toLowerCase() === subName.toLowerCase());
        
        if (!existe) {
            nuevasSubcategorias.push(subName);
            await updateDoc(doc(db, "categories", parentId), { subcategorias: nuevasSubcategorias });
        } else { alert("Esta subcategoría ya existe en esta categoría."); }
        
        modalSubcategoria.classList.add('hidden');
        await cargarCategorias(); 
    } catch (error) { alert("Hubo un error al guardar."); } 
    finally { btnGuardarSubcategoria.disabled = false; btnGuardarSubcategoria.innerText = "Guardar Subcategoría"; }
}

window.eliminarCategoria = async (id) => {
    if(confirm("¿Seguro que deseas eliminar esta categoría? Esto afectará los filtros de la tienda.")) {
        await deleteDoc(doc(db, "categories", id));
        cargarCategorias();
    }
};

// ==========================================
// CONTROL ESTRICTO DE SELECTS (PADRE-HIJO)
// ==========================================

function actualizarSelectSubcategoriasFormulario(categoriaNombre, subcategoriaSeleccionada = "") {
    const selectSub = document.getElementById('prod-subcategoria');
    selectSub.innerHTML = '<option value="">Seleccionar subcategoría...</option>';
    if (!categoriaNombre) {
        selectSub.disabled = true; selectSub.classList.add('bg-gray-50', 'text-gray-500');
        return;
    }
    const categoriaEncontrada = categoriasGlobales.find(c => c.nombre === categoriaNombre);
    if (categoriaEncontrada && categoriaEncontrada.subcategorias && categoriaEncontrada.subcategorias.length > 0) {
        selectSub.disabled = false; selectSub.classList.remove('bg-gray-50', 'text-gray-500');
        categoriaEncontrada.subcategorias.forEach(sub => {
            const selected = (sub === subcategoriaSeleccionada) ? 'selected' : '';
            selectSub.innerHTML += `<option value="${sub}" ${selected}>${sub}</option>`;
        });
    } else {
        selectSub.disabled = true; selectSub.innerHTML = '<option value="">No hay subcategorías registradas</option>';
    }
}

function actualizarSelectSubcategoriasFiltro() {
    const catFiltro = filtroCategoria.value;
    filtroSubcategoria.innerHTML = '<option value="">Todas las Subcategorías</option>';
    if (catFiltro === "") {
        filtroSubcategoria.disabled = true; filtroSubcategoria.classList.add('bg-gray-50', 'text-gray-500');
        return;
    }
    const categoriaEncontrada = categoriasGlobales.find(c => c.nombre === catFiltro);
    if (categoriaEncontrada && categoriaEncontrada.subcategorias && categoriaEncontrada.subcategorias.length > 0) {
        filtroSubcategoria.disabled = false; filtroSubcategoria.classList.remove('bg-gray-50', 'text-gray-500');
        categoriaEncontrada.subcategorias.forEach(sub => { filtroSubcategoria.innerHTML += `<option value="${sub}">${sub}</option>`; });
    } else {
        filtroSubcategoria.disabled = true; filtroSubcategoria.classList.add('bg-gray-50', 'text-gray-500');
    }
}

// ==========================================
// MÓDULO: PRODUCTOS E INVENTARIO
// ==========================================

async function manejarSubidaMultiplesImagenes(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    btnGuardarProducto.disabled = true;
    const textoOriginal = btnGuardarProducto.innerText;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btnGuardarProducto.innerText = `Subiendo ${i + 1}/${files.length}...`;
        try {
            const formData = new FormData(); formData.append('image', file);
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
            const data = await response.json();
            if (data.success) { arrayImagenesUrls.push(data.data.url); renderizarGaleria(); }
        } catch (error) { console.error("Error en ImgBB:", error); }
    }
    btnGuardarProducto.disabled = false; btnGuardarProducto.innerText = textoOriginal;
    document.getElementById('prod-imagen').value = ''; 
}

function renderizarGaleria() {
    const galeria = document.getElementById('galeria-preview');
    galeria.innerHTML = '';
    arrayImagenesUrls.forEach((url, index) => {
        galeria.innerHTML += `<div class="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square"><img src="${url}" class="w-full h-full object-cover"><button type="button" onclick="quitarImagen(${index})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><i class="ph ph-x text-xs"></i></button></div>`;
    });
}
window.quitarImagen = (index) => { arrayImagenesUrls.splice(index, 1); renderizarGaleria(); };

async function guardarProducto() {
    const id = document.getElementById('prod-id').value;
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const subcategoria = document.getElementById('prod-subcategoria').value; 
    const precio = parseFloat(document.getElementById('prod-precio').value);
    const stock = parseInt(document.getElementById('prod-stock').value) || 0; 
    const descripcion = document.getElementById('prod-descripcion').value.trim();

    if (!nombre || !categoria || !subcategoria || isNaN(precio) || arrayImagenesUrls.length === 0) {
        return alert("Completa los datos obligatorios (incluyendo subcategoría) y sube al menos una foto.");
    }
    btnGuardarProducto.disabled = true; btnGuardarProducto.innerText = "Guardando...";

    try {
        const datos = { nombre, categoria, subcategoria, precio, stock, descripcion, imagenes: arrayImagenesUrls, fechaActualizacion: new Date().toISOString() };
        if (id) await updateDoc(doc(db, "products", id), datos);
        else { datos.fechaCreacion = new Date().toISOString(); await addDoc(productsCollection, datos); }
        modalProducto.classList.add('hidden'); cargarProductos();
    } catch (error) { console.error(error); } 
    finally { btnGuardarProducto.disabled = false; btnGuardarProducto.innerText = "Guardar Producto"; }
}

async function cargarProductos() {
    const tbody = document.getElementById('admin-products-list');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center"><i class="ph ph-spinner animate-spin text-2xl"></i> Cargando...</td></tr>';
    try {
        const querySnapshot = await getDocs(productsCollection);
        productosGlobales = [];
        querySnapshot.forEach((docSnap) => {
            const prod = docSnap.data(); prod.id = docSnap.id;
            prod.imagenes = prod.imagenes || (prod.imagen ? [prod.imagen] : []);
            prod.stock = prod.stock !== undefined ? prod.stock : 10; 
            prod.subcategoria = prod.subcategoria || 'General';
            productosGlobales.push(prod);
        });
        aplicarFiltrosProductos();
    } catch (error) { console.error(error); }
}

function aplicarFiltrosProductos() {
    const textoBuscador = buscadorProductos.value.toLowerCase();
    const catFiltro = filtroCategoria.value;
    const subCatFiltro = filtroSubcategoria.value;
    productosFiltrados = productosGlobales.filter(prod => {
        const coincideTexto = prod.nombre.toLowerCase().includes(textoBuscador);
        const coincideCat = catFiltro === "" || prod.categoria === catFiltro;
        const coincideSubCat = subCatFiltro === "" || prod.subcategoria === subCatFiltro;
        return coincideTexto && coincideCat && coincideSubCat;
    });
    dibujarTablaProductos(productosFiltrados);
}

function dibujarTablaProductos(arreglo) {
    const tbody = document.getElementById('admin-products-list');
    tbody.innerHTML = '';
    if (arreglo.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">No se encontraron productos.</td></tr>'; return; }
    arreglo.forEach(prod => {
        const imgPortada = prod.imagenes.length > 0 ? prod.imagenes[0] : 'https://via.placeholder.com/150';
        let imgHTML = imgPortada.startsWith('http') ? `<img src="${imgPortada}" class="h-10 w-10 rounded-lg object-cover">` : `<div class="h-10 w-10 bg-gray-100 flex items-center justify-center"><i class="${imgPortada}"></i></div>`;
        const stockColor = prod.stock <= 3 ? 'text-red-500 font-bold' : 'text-brand-blue font-medium';
        tbody.innerHTML += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4"><div class="flex items-center gap-3">${imgHTML}<div><span class="font-medium text-gray-800">${prod.nombre}</span><span class="text-xs text-gray-400 block">${prod.imagenes.length} foto(s)</span></div></div></td><td class="p-4"><span class="px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">${prod.categoria}</span><br><span class="text-xs text-gray-500 mt-1 inline-block"><i class="ph ph-arrow-elbow-down-right"></i> ${prod.subcategoria}</span></td><td class="p-4 font-bold text-gray-800">$${prod.precio.toFixed(2)}</td><td class="p-4 ${stockColor}">${prod.stock} unds</td><td class="p-4 text-center"><button onclick="prepararEdicionProd('${prod.id}')" class="text-gray-400 hover:text-brand-blue p-1"><i class="ph ph-pencil-simple text-xl"></i></button><button onclick="eliminarProducto('${prod.id}')" class="text-gray-400 hover:text-red-500 p-1 ml-2"><i class="ph ph-trash text-xl"></i></button></td></tr>`;
    });
}

function resetearModalProducto(titulo) {
    document.getElementById('form-producto').reset(); document.getElementById('prod-id').value = '';
    document.getElementById('prod-descripcion').value = ''; document.getElementById('prod-stock').value = 1; 
    actualizarSelectSubcategoriasFormulario(""); arrayImagenesUrls = []; renderizarGaleria(); document.getElementById('modal-titulo').innerText = titulo;
}

window.prepararEdicionProd = (id) => {
    const prod = productosGlobales.find(p => p.id === id); if (!prod) return;
    resetearModalProducto("Editar Producto");
    document.getElementById('prod-id').value = prod.id; document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria; document.getElementById('prod-precio').value = prod.precio;
    document.getElementById('prod-stock').value = prod.stock !== undefined ? prod.stock : 10; document.getElementById('prod-descripcion').value = prod.descripcion || '';
    actualizarSelectSubcategoriasFormulario(prod.categoria, prod.subcategoria);
    arrayImagenesUrls = [...prod.imagenes]; renderizarGaleria(); modalProducto.classList.remove('hidden');
};

window.eliminarProducto = async (id) => { if(confirm("¿Seguro que deseas eliminar este producto?")) { await deleteDoc(doc(db, "products", id)); cargarProductos(); } };

function exportarProductosExcel() {
    if (productosFiltrados.length === 0) return alert("No hay productos para exportar en esta vista.");
    const datosLimpios = productosFiltrados.map(p => ({
        "ID Producto": p.id, "Nombre": p.nombre, "Categoría": p.categoria, "Subcategoría": p.subcategoria,
        "Precio ($)": p.precio, "Stock Físico": p.stock, "Descripción": p.descripcion || 'N/A', "Cantidad de Fotos": p.imagenes ? p.imagenes.length : 0, "Fecha de Registro": p.fechaCreacion ? new Date(p.fechaCreacion).toLocaleDateString() : 'N/A'
    }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Inventario"); XLSX.writeFile(libro, "Inventario_Filtrado_D&S.xlsx");
}

// ==========================================
// MÓDULOS RESTANTES (Clientes y Pedidos)
// ==========================================
async function cargarClientes() {
    const tbody = document.getElementById('admin-clients-list');
    try {
        const querySnapshot = await getDocs(usersCollection); tbody.innerHTML = ''; clientesGlobales = []; 
        if (querySnapshot.empty) { tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center">No hay usuarios registrados.</td></tr>'; return; }
        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data(); clientesGlobales.push(user);
            const fecha = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
            const badgeRol = user.role === 'admin' ? '<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold">Admin</span>' : '<span class="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">Cliente</span>';
            const telefonoTexto = user.phone ? user.phone : '<span class="text-gray-400 italic">No proporcionado</span>';
            tbody.innerHTML += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-medium text-gray-800">${user.name || 'Sin Nombre'}</td><td class="p-4 text-gray-600">${user.email}</td><td class="p-4 text-gray-600">${telefonoTexto}</td><td class="p-4">${badgeRol}</td><td class="p-4 text-gray-500">${fecha}</td></tr>`;
        });
    } catch (error) { console.error(error); }
}

function exportarClientesExcel() {
    if (clientesGlobales.length === 0) return alert("No hay clientes para exportar.");
    const datosLimpios = clientesGlobales.map(c => ({
        "Nombre Completo": c.name || 'Sin nombre', "Correo Electrónico": c.email, "Teléfono": c.phone || 'N/A', "Rol del Sistema": c.role === 'admin' ? 'Administrador' : 'Cliente', "Fecha de Registro": c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A'
    }));
    const hoja = XLSX.utils.json_to_sheet(datosLimpios); const libro = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(libro, hoja, "Directorio"); XLSX.writeFile(libro, "Directorio_Clientes.xlsx");
}

async function cargarPedidos() {
    const tbody = document.getElementById('admin-orders-list');
    try {
        const querySnapshot = await getDocs(ordersCollection); tbody.innerHTML = '';
        if (querySnapshot.empty) { tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Aún no hay pedidos en la tienda.</td></tr>'; return; }
        querySnapshot.forEach((docSnap) => {
            const pedido = docSnap.data(); const id = docSnap.id;
            let colorEstado = 'bg-gray-100 text-gray-600';
            if(pedido.estado === 'Pendiente') colorEstado = 'bg-yellow-100 text-yellow-700';
            if(pedido.estado === 'Procesando') colorEstado = 'bg-blue-100 text-blue-700';
            if(pedido.estado === 'Enviado') colorEstado = 'bg-indigo-100 text-indigo-700';
            if(pedido.estado === 'Entregado') colorEstado = 'bg-green-100 text-green-700';
            if(pedido.estado === 'Cancelado') colorEstado = 'bg-red-100 text-red-700';
            tbody.innerHTML += `<tr class="border-b border-gray-100 hover:bg-gray-50"><td class="p-4 font-mono text-sm text-gray-500">#${id.slice(-6).toUpperCase()}</td><td class="p-4 font-medium text-gray-800">${pedido.clienteNombre}</td><td class="p-4 font-bold">$${pedido.total.toFixed(2)}</td><td class="p-4"><span class="px-3 py-1 rounded-full text-xs font-bold ${colorEstado}">${pedido.estado}</span></td><td class="p-4 text-center"><button onclick="abrirModalPedido('${id}', '${pedido.estado}')" class="text-brand-blue hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg text-sm font-medium transition-colors">Ver / Editar</button></td></tr>`;
        });
    } catch (error) {}
}

window.abrirModalPedido = (id, estadoActual) => {
    document.getElementById('ped-id').value = id; document.getElementById('ped-estado').value = estadoActual; modalPedido.classList.remove('hidden');
};

async function actualizarEstadoPedido() {
    const id = document.getElementById('ped-id').value; const nuevoEstado = document.getElementById('ped-estado').value;
    btnGuardarPedido.disabled = true; btnGuardarPedido.innerText = "Actualizando...";
    try {
        await updateDoc(doc(db, "orders", id), { estado: nuevoEstado });
        modalPedido.classList.add('hidden'); cargarPedidos();
    } catch (error) { alert("Error al actualizar."); } finally { btnGuardarPedido.disabled = false; btnGuardarPedido.innerText = "Actualizar Estado"; }
}
