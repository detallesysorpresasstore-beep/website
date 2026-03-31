/**
 * Detalles y Sorpresas STORE - Lógica del Panel de Administración (Multi-Imagen y Módulos)
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN DE API ---
const IMGBB_API_KEY = '6b8e2fe1e92a74135200cbf5317aa9bf';

// --- ELEMENTOS DEL DOM ---
const btnLogout = document.getElementById('btn-logout');
const modalProducto = document.getElementById('modal-producto');
const modalTitulo = document.getElementById('modal-titulo');
const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const formProducto = document.getElementById('form-producto');
const tablaProductos = document.getElementById('admin-products-list');

// Campos del formulario
const inputId = document.getElementById('prod-id');
const inputNombre = document.getElementById('prod-nombre');
const inputCategoria = document.getElementById('prod-categoria');
const inputPrecio = document.getElementById('prod-precio');

// Zona Multi-Imagen
const inputImagenFile = document.getElementById('prod-imagen');
const galeriaPreview = document.getElementById('galeria-preview');
let arrayImagenesUrls = []; // Arreglo en memoria para manejar las URLs de las fotos

// Referencias a Colecciones en Firestore
const productsCollection = collection(db, "products");
const categoriesCollection = collection(db, "categories");
const ordersCollection = collection(db, "orders");
const usersCollection = collection(db, "artifacts/detalles-y-sorpresas-store/public/data/users"); // Tu ruta original de usuarios

let productosGlobales = [];

document.addEventListener('DOMContentLoaded', () => {
    verificarSeguridad();
    configurarEventos();
    
    // Cargar todos los módulos
    cargarProductos();
    cargarCategorias();
    cargarPedidos();
    cargarClientes();
});

function verificarSeguridad() {
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = 'index.html';
    });
}

function configurarEventos() {
    // Modal de Productos
    btnNuevoProducto.addEventListener('click', () => {
        resetearModal("Añadir Nuevo Producto");
        modalProducto.classList.remove('hidden');
    });

    const cerrarModal = () => modalProducto.classList.add('hidden');
    btnCerrarModal.addEventListener('click', cerrarModal);
    btnCancelarModal.addEventListener('click', cerrarModal);

    btnGuardarProducto.addEventListener('click', guardarProducto);

    // Escuchar la selección de múltiples archivos
    inputImagenFile.addEventListener('change', manejarSubidaMultiplesImagenes);

    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (confirm("¿Seguro que deseas cerrar sesión?")) {
                await signOut(auth);
                window.location.href = 'index.html';
            }
        });
    }
}

/**
 * Procesa múltiples archivos y los sube uno a uno a ImgBB
 */
async function manejarSubidaMultiplesImagenes(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    btnGuardarProducto.disabled = true;
    const textoOriginal = btnGuardarProducto.innerText;
    
    // Subir cada archivo secuencialmente para no saturar la API
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        btnGuardarProducto.innerText = `Subiendo foto ${i + 1} de ${files.length}...`;

        try {
            const formData = new FormData();
            formData.append('image', file);
            
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Agregar la URL al arreglo y renderizar la miniatura
                arrayImagenesUrls.push(data.data.url);
                renderizarGaleria();
            } else {
                console.error("ImgBB rechazó una imagen");
            }
        } catch (error) {
            console.error("Error al subir imagen:", error);
            alert(`Error al subir la imagen ${file.name}`);
        }
    }

    btnGuardarProducto.disabled = false;
    btnGuardarProducto.innerText = textoOriginal;
    // Limpiar el input para permitir volver a subir la misma foto si se desea
    inputImagenFile.value = ''; 
}

/**
 * Dibuja las miniaturas de las imágenes en el modal y añade botón para quitarlas
 */
function renderizarGaleria() {
    galeriaPreview.innerHTML = '';
    
    arrayImagenesUrls.forEach((url, index) => {
        const div = document.createElement('div');
        div.className = "relative group rounded-lg overflow-hidden border border-gray-200 aspect-square";
        div.innerHTML = `
            <img src="${url}" class="w-full h-full object-cover" alt="miniatura">
            <button type="button" onclick="quitarImagen(${index})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600">
                <i class="ph ph-x text-xs"></i>
            </button>
        `;
        galeriaPreview.appendChild(div);
    });
}

/**
 * Quita una imagen del arreglo antes de guardar
 */
window.quitarImagen = (index) => {
    arrayImagenesUrls.splice(index, 1);
    renderizarGaleria();
};

/**
 * Guarda o Actualiza un producto con un array de imágenes
 */
async function guardarProducto() {
    const id = inputId.value;
    const nombre = inputNombre.value.trim();
    const categoria = inputCategoria.value;
    const precio = parseFloat(inputPrecio.value);

    if (!nombre || !categoria || isNaN(precio) || arrayImagenesUrls.length === 0) {
        alert("Completa los campos obligatorios y sube al menos una imagen.");
        return;
    }

    const textoOriginal = btnGuardarProducto.innerText;
    btnGuardarProducto.innerText = "Guardando...";
    btnGuardarProducto.disabled = true;

    try {
        const datosProducto = {
            nombre: nombre,
            categoria: categoria,
            precio: precio,
            imagenes: arrayImagenesUrls, // Guardamos el ARREGLO completo
            stock: 10,
            fechaActualizacion: new Date().toISOString()
        };

        if (id) {
            await updateDoc(doc(db, "products", id), datosProducto);
        } else {
            datosProducto.fechaCreacion = new Date().toISOString();
            await addDoc(productsCollection, datosProducto);
        }

        modalProducto.classList.add('hidden');
        cargarProductos();
        
    } catch (error) {
        console.error("Error al guardar:", error);
        alert("Hubo un error al guardar en la base de datos.");
    } finally {
        btnGuardarProducto.innerText = textoOriginal;
        btnGuardarProducto.disabled = false;
    }
}

/**
 * Carga de Productos (Adaptada para leer arrays de imágenes)
 */
async function cargarProductos() {
    tablaProductos.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500"><i class="ph ph-spinner animate-spin text-2xl"></i> Cargando...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(productsCollection);
        tablaProductos.innerHTML = '';
        productosGlobales = [];
        
        if (querySnapshot.empty) {
            tablaProductos.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay productos registrados.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const producto = docSnap.data();
            producto.id = docSnap.id;
            
            // Lógica de compatibilidad: Convertir string viejo a array nuevo si es necesario
            if (producto.imagen && !producto.imagenes) {
                producto.imagenes = [producto.imagen];
            } else if (!producto.imagenes) {
                producto.imagenes = [];
            }
            
            productosGlobales.push(producto);
            
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
            
            // Tomar la primera imagen del array como portada
            const imagenPortada = producto.imagenes.length > 0 ? producto.imagenes[0] : 'https://via.placeholder.com/150?text=Sin+Foto';
            
            let imgHTML = imagenPortada.startsWith('http') 
                ? `<img src="${imagenPortada}" class="h-10 w-10 rounded-lg object-cover border border-gray-200" alt="prod">`
                : `<div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500"><i class="${imagenPortada} text-xl"></i></div>`;

            tr.innerHTML = `
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        ${imgHTML}
                        <div>
                            <span class="font-medium text-gray-800 block">${producto.nombre}</span>
                            <span class="text-xs text-gray-400">${producto.imagenes.length} foto(s)</span>
                        </div>
                    </div>
                </td>
                <td class="p-4 text-gray-600">
                    <span class="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">${producto.categoria}</span>
                </td>
                <td class="p-4 font-bold text-gray-800">$${producto.precio.toFixed(2)}</td>
                <td class="p-4 text-center">
                    <button onclick="prepararEdicion('${producto.id}')" class="text-gray-400 hover:text-brand-blue transition-colors p-1">
                        <i class="ph ph-pencil-simple text-xl"></i>
                    </button>
                    <button onclick="eliminarProducto('${producto.id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1 ml-2">
                        <i class="ph ph-trash text-xl"></i>
                    </button>
                </td>
            `;
            tablaProductos.appendChild(tr);
        });
    } catch (error) {
        console.error("Error al cargar:", error);
    }
}

function resetearModal(titulo) {
    formProducto.reset();
    inputId.value = '';
    arrayImagenesUrls = []; // Limpiar array local
    renderizarGaleria(); // Limpiar UI
    modalTitulo.innerText = titulo;
}

window.prepararEdicion = (id) => {
    const producto = productosGlobales.find(p => p.id === id);
    if (!producto) return;

    resetearModal("Editar Producto");

    inputId.value = producto.id;
    inputNombre.value = producto.nombre;
    inputCategoria.value = producto.categoria;
    inputPrecio.value = producto.precio;
    
    // Cargar las imágenes existentes al arreglo local y renderizar
    arrayImagenesUrls = [...(producto.imagenes || [])];
    renderizarGaleria();

    modalProducto.classList.remove('hidden');
};

window.eliminarProducto = async (id) => {
    if(confirm("¿Seguro que deseas eliminar este producto de la tienda?")) {
        try {
            await deleteDoc(doc(db, "products", id));
            cargarProductos();
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("No se pudo eliminar el producto.");
        }
    }
};

// ==========================================
// MÓDULOS EN CONSTRUCCIÓN (CATEGORÍAS, PEDIDOS, CLIENTES)
// ==========================================

async function cargarCategorias() {
    // Aquí implementaremos el CRUD de categorías en el próximo paso
    console.log("Módulo de categorías listo para conectarse a Firebase");
}

async function cargarPedidos() {
    // Aquí conectaremos la tabla de órdenes de compra
    console.log("Módulo de pedidos listo para conectarse a Firebase");
}

async function cargarClientes() {
    // Aquí listaremos los usuarios registrados
    console.log("Módulo de clientes listo para conectarse a Firebase");
}
