/**
 * Detalles y Sorpresas STORE - Lógica del Panel de Administración
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Elementos del DOM
const btnCerrarSesion = document.querySelector('.text-red-500'); // Botón de cerrar sesión del sidebar
const modalProducto = document.getElementById('modal-producto');
const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const btnGuardarProducto = document.getElementById('btn-guardar-producto');
const formProducto = document.getElementById('form-producto');
const tablaProductos = document.getElementById('admin-products-list');

// Referencia a la colección de productos en Firestore
const productsCollection = collection(db, "products");

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
        if (!user) {
            // Si no hay usuario, lo devolvemos a la tienda
            window.location.href = 'index.html';
        } else {
            // Aquí en un futuro validaremos si su rol es 'admin'
            console.log("Sesión de admin activa:", user.email);
        }
    });
}

/**
 * Configura los "escuchadores" de clics (Event Listeners)
 */
function configurarEventos() {
    // Abrir modal
    btnNuevoProducto.addEventListener('click', () => {
        formProducto.reset(); // Limpiamos el formulario
        modalProducto.classList.remove('hidden');
    });

    // Cerrar modal
    const cerrarModal = () => modalProducto.classList.add('hidden');
    btnCerrarModal.addEventListener('click', cerrarModal);
    btnCancelarModal.addEventListener('click', cerrarModal);

    // Guardar Producto
    btnGuardarProducto.addEventListener('click', guardarProducto);

    // Cerrar Sesión
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            const confirmar = confirm("¿Seguro que deseas cerrar sesión?");
            if (confirmar) {
                await signOut(auth);
                window.location.href = 'index.html';
            }
        });
    }
}

/**
 * Guarda un producto nuevo en Firebase Firestore
 */
async function guardarProducto() {
    // 1. Obtener valores del formulario
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const precio = parseFloat(document.getElementById('prod-precio').value);
    const imagen = document.getElementById('prod-imagen').value.trim() || 'ph-package'; // Ícono por defecto

    // 2. Validación básica
    if (!nombre || !categoria || isNaN(precio)) {
        alert("Por favor, completa los campos obligatorios (*).");
        return;
    }

    // 3. Estado de carga en el botón
    const textoOriginal = btnGuardarProducto.innerText;
    btnGuardarProducto.innerText = "Guardando...";
    btnGuardarProducto.disabled = true;

    try {
        // 4. Guardar en Firebase
        await addDoc(productsCollection, {
            nombre: nombre,
            categoria: categoria,
            precio: precio,
            imagen: imagen,
            stock: 10, // Stock por defecto inicial
            fechaCreacion: new Date().toISOString()
        });

        // 5. Limpiar, cerrar modal y recargar tabla
        formProducto.reset();
        modalProducto.classList.add('hidden');
        cargarProductos();
        
    } catch (error) {
        console.error("Error al guardar producto:", error);
        alert("Hubo un error al guardar el producto.");
    } finally {
        btnGuardarProducto.innerText = textoOriginal;
        btnGuardarProducto.disabled = false;
    }
}

/**
 * Lee los productos de Firestore y los muestra en la tabla
 */
async function cargarProductos() {
    tablaProductos.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500"><i class="ph ph-spinner animate-spin text-2xl"></i> Cargando productos...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(productsCollection);
        tablaProductos.innerHTML = ''; // Limpiamos la tabla
        
        if (querySnapshot.empty) {
            tablaProductos.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay productos registrados aún.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const producto = docSnap.data();
            const id = docSnap.id;
            
            // Creamos la fila HTML para cada producto
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-100 hover:bg-gray-50 transition-colors";
            tr.innerHTML = `
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                            <i class="${producto.imagen} text-xl"></i>
                        </div>
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
                    <button class="text-gray-400 hover:text-brand-blue transition-colors p-1" title="Editar">
                        <i class="ph ph-pencil-simple text-xl"></i>
                    </button>
                    <button onclick="eliminarProducto('${id}')" class="text-gray-400 hover:text-red-500 transition-colors p-1 ml-2" title="Eliminar">
                        <i class="ph ph-trash text-xl"></i>
                    </button>
                </td>
            `;
            tablaProductos.appendChild(tr);
        });

    } catch (error) {
        console.error("Error al cargar productos:", error);
        tablaProductos.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500">Error al cargar la base de datos.</td></tr>';
    }
}

/**
 * Elimina un producto de Firestore
 * Se expone en window para poder ser llamada desde el HTML inyectado
 */
window.eliminarProducto = async (id) => {
    if(confirm("¿Estás seguro de que deseas eliminar este producto? Esta acción no se puede deshacer.")) {
        try {
            await deleteDoc(doc(db, "products", id));
            cargarProductos(); // Recargamos la tabla
        } catch (error) {
            console.error("Error al eliminar:", error);
            alert("No se pudo eliminar el producto.");
        }
    }
};
