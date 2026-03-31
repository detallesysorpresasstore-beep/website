/**
 * Detalles y Sorpresas STORE - Lógica del Panel de Administración
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CONFIGURACIÓN DE API ---
const IMGBB_API_KEY = '6b8e2fe1e92a74135200cbf5317aa9bf';

// --- ELEMENTOS DEL DOM ---
const btnCerrarSesion = document.querySelector('.text-red-500');
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

// Campos de Imagen
const inputImagenFile = document.getElementById('prod-imagen');
const imagePreview = document.getElementById('image-preview');
const imagePlaceholder = document.getElementById('image-placeholder');
const inputImagenUrl = document.getElementById('prod-imagen-url');

// Referencia a Firestore
const productsCollection = collection(db, "products");

// Variable global para almacenar los productos temporalmente y facilitar la edición
let productosGlobales = [];

document.addEventListener('DOMContentLoaded', () => {
    verificarSeguridad();
    configurarEventos();
    cargarProductos();
});

/**
 * Verifica que el usuario tenga sesión iniciada
 */
function verificarSeguridad() {
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = 'index.html';
    });
}

/**
 * Configura los "escuchadores" de clics y cambios
 */
function configurarEventos() {
    // Abrir modal para NUEVO producto
    btnNuevoProducto.addEventListener('click', () => {
        resetearModal("Añadir Nuevo Producto");
        modalProducto.classList.remove('hidden');
    });

    // Cerrar modal
    const cerrarModal = () => modalProducto.classList.add('hidden');
    btnCerrarModal.addEventListener('click', cerrarModal);
    btnCancelarModal.addEventListener('click', cerrarModal);

    // Guardar Producto (Crear o Editar)
    btnGuardarProducto.addEventListener('click', guardarProducto);

    // Cargar imagen a ImgBB cuando se selecciona un archivo
    inputImagenFile.addEventListener('change', manejarSubidaImagen);

    // Cerrar Sesión
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            if (confirm("¿Seguro que deseas cerrar sesión?")) {
                await signOut(auth);
                window.location.href = 'index.html';
            }
        });
    }
}

/**
 * Procesa el archivo seleccionado, muestra vista previa y lo sube a ImgBB
 */
async function manejarSubidaImagen(event) {
    const file = event.target.files[0];
    if (!file) return;

    // 1. Mostrar vista previa local rápidamente
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        imagePreview.classList.remove('hidden');
        imagePlaceholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);

    // 2. Preparar UI para la subida
    btnGuardarProducto.disabled = true;
    btnGuardarProducto.innerText = "Subiendo foto...";
    imagePreview.classList.add('opacity-50'); // Efecto de carga

    try {
        // 3. Enviar a ImgBB
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            inputImagenUrl.value = data.data.url; // ¡Guardamos el link oficial!
        } else {
            throw new Error("ImgBB rechazó la imagen");
        }
    } catch (error) {
        console.error("Error al subir imagen:", error);
        alert("Hubo un error al subir la imagen. Intenta con otra.");
        inputImagenUrl.value = "";
        imagePreview.classList.add('hidden');
        imagePlaceholder.classList.remove('hidden');
    } finally {
        // Restaurar UI
        imagePreview.classList.remove('opacity-50');
        btnGuardarProducto.disabled = false;
        btnGuardarProducto.innerText = "Guardar Producto";
    }
}

/**
 * Guarda o Actualiza un producto en Firestore
 */
async function guardarProducto() {
    const id = inputId.value;
    const nombre = inputNombre.value.trim();
    const categoria = inputCategoria.value;
    const precio = parseFloat(inputPrecio.value);
    const imagenUrl = inputImagenUrl.value.trim() || 'https://via.placeholder.com/150?text=Sin+Foto';

    if (!nombre || !categoria || isNaN(precio)) {
        alert("Por favor, completa los campos obligatorios.");
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
            imagen: imagenUrl,
            stock: 10,
            fechaActualizacion: new Date().toISOString()
        };

        if (id) {
            // Si hay ID, estamos EDITANDO
            await updateDoc(doc(db, "products", id), datosProducto);
        } else {
            // Si no hay ID, estamos CREANDO uno nuevo
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
 * Lee los productos de Firestore y los pinta en la tabla
 */
async function cargarProductos() {
    tablaProductos.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500"><i class="ph ph-spinner animate-spin text-2xl"></i> Cargando...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(productsCollection);
        tablaProductos.innerHTML = '';
        productosGlobales = []; // Limpiar array global
        
        if (querySnapshot.empty) {
            tablaProductos.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay productos registrados.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const producto = docSnap.data();
            producto.id = docSnap.id;
            productosGlobales.push(producto); // Guardar en memoria para edición
            
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
            
            // Validar si es URL (foto real) o una clase vieja de ícono (ej. ph-package)
            let imgHTML = producto.imagen.startsWith('http') 
                ? `<img src="${producto.imagen}" class="h-10 w-10 rounded-lg object-cover border border-gray-200" alt="prod">`
                : `<div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500"><i class="${producto.imagen} text-xl"></i></div>`;

            tr.innerHTML = `
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        ${imgHTML}
                        <span class="font-medium text-gray-800">${producto.nombre}</span>
                    </div>
                </td>
                <td class="p-4 text-gray-600 hidden sm:table-cell">
                    <span class="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium">${producto.categoria}</span>
                </td>
                <td class="p-4 font-bold text-gray-800">$${producto.precio.toFixed(2)}</td>
                <td class="p-4 hidden md:table-cell">
                    <span class="text-green-600 font-medium">${producto.stock} unds</span>
                </td>
                <td class="p-4 text-center">
                    <button onclick="prepararEdicion('${producto.id}')" class="text-gray-400 hover:text-brand-blue transition-colors p-1" title="Editar">
                        <i class="ph ph-pencil-simple text-xl"></i>
                    </button>
                    <button onclick="eliminarProducto('${producto.id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1 ml-2" title="Eliminar">
                        <i class="ph ph-trash text-xl"></i>
                    </button>
                </td>
            `;
            tablaProductos.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al cargar:", error);
        tablaProductos.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500">Error de conexión.</td></tr>';
    }
}

/**
 * Limpia el modal para evitar cruce de datos
 */
function resetearModal(titulo) {
    formProducto.reset();
    inputId.value = '';
    inputImagenUrl.value = '';
    modalTitulo.innerText = titulo;
    
    // Resetear imagen visualmente
    imagePreview.src = '';
    imagePreview.classList.add('hidden');
    imagePlaceholder.classList.remove('hidden');
}

/**
 * Llama a los datos de un producto y los pone en el formulario para editarlos
 * Expuesta globalmente para que funcione en el onclick del HTML inyectado
 */
window.prepararEdicion = (id) => {
    const producto = productosGlobales.find(p => p.id === id);
    if (!producto) return;

    resetearModal("Editar Producto");

    // Llenar campos
    inputId.value = producto.id;
    inputNombre.value = producto.nombre;
    inputCategoria.value = producto.categoria;
    inputPrecio.value = producto.precio;
    inputImagenUrl.value = producto.imagen;

    // Mostrar imagen si tiene URL
    if (producto.imagen && producto.imagen.startsWith('http')) {
        imagePreview.src = producto.imagen;
        imagePreview.classList.remove('hidden');
        imagePlaceholder.classList.add('hidden');
    }

    modalProducto.classList.remove('hidden');
};

/**
 * Elimina un producto de Firestore
 */
window.eliminarProducto = async (id) => {
    if(confirm("¿Seguro que deseas eliminar este producto?")) {
        try {
            await deleteDoc(doc(db, "products", id));
            cargarProductos();
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("No se pudo eliminar el producto.");
        }
    }
};
