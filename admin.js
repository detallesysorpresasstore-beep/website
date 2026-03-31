/**
 * Detalles y Sorpresas STORE - Lógica del Panel de Administración (Conectado a Firestore)
 */

import { auth, db, onAuthStateChanged, signOut } from './firebase-config.js';
// Importamos las herramientas para manipular la base de datos
import { collection, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = 'detalles-y-sorpresas-store';
// Esta es la ruta exacta donde se guardarán tus productos en Firebase
const productsRef = collection(db, 'artifacts', appId, 'public', 'data', 'products');

// Aquí guardaremos temporalmente la lista descargada para dibujarla
let productsList = []; 

document.addEventListener('DOMContentLoaded', () => {
    // 1. Proteger la ruta: Verificar si hay un usuario logueado
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Acceso concedido al admin:", user.email);
            initAdmin();
        } else {
            window.location.href = 'index.html';
        }
    });
});

function initAdmin() {
    setupEventListeners();
    loadProducts(); // Descargamos los productos al iniciar
}

/**
 * Descarga los productos desde Firestore
 */
async function loadProducts() {
    const tbody = document.getElementById('admin-products-list');
    if (!tbody) return;

    // Mostramos un mensaje de carga
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500 font-medium"><i class="ph ph-spinner animate-spin text-xl inline-block align-middle mr-2"></i> Cargando productos desde la base de datos...</td></tr>';

    try {
        const querySnapshot = await getDocs(productsRef);
        productsList = []; // Vaciamos la lista actual
        
        querySnapshot.forEach((doc) => {
            // Unimos el ID que le da Firebase con los datos del producto
            productsList.push({ id: doc.id, ...doc.data() });
        });

        renderAdminProducts(); // Dibujamos la tabla
    } catch (error) {
        console.error("Error al cargar productos:", error);
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error al conectar con la base de datos.</td></tr>';
    }
}

/**
 * Renderiza la lista de productos en la tabla del panel
 */
function renderAdminProducts() {
    const tbody = document.getElementById('admin-products-list');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (productsList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay productos registrados aún. ¡Agrega el primero!</td></tr>';
        return;
    }

    productsList.forEach(product => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0';
        
        const iconClass = product.imageIcon ? product.imageIcon : 'ph-package';

        tr.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0">
                        <i class="ph-duotone ${iconClass} text-xl"></i>
                    </div>
                    <span class="font-medium text-gray-800">${product.name}</span>
                </div>
            </td>
            <td class="p-4 text-gray-500 hidden sm:table-cell">${product.category}</td>
            <td class="p-4 text-gray-800 font-semibold">$${Number(product.price).toFixed(2)}</td>
            <td class="p-4 hidden md:table-cell">
                <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">En Stock</span>
            </td>
            <td class="p-4 text-center">
                <div class="flex justify-center gap-2">
                    <button class="text-gray-400 hover:text-red-500 p-1 transition-colors btn-eliminar" data-id="${product.id}" title="Eliminar">
                        <i class="ph ph-trash text-lg"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Eventos para eliminar productos
    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('button').getAttribute('data-id');
            eliminarProducto(id);
        });
    });
}

/**
 * Configura los eventos de los botones del panel
 */
function setupEventListeners() {
    const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
    const modalProducto = document.getElementById('modal-producto');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const btnCancelarModal = document.getElementById('btn-cancelar-modal');
    const btnGuardarProducto = document.getElementById('btn-guardar-producto');
    const formProducto = document.getElementById('form-producto');
    const btnCerrarSesion = document.querySelector('aside button.text-red-500');

    const abrirModal = () => modalProducto.classList.remove('hidden');
    const cerrarModal = () => {
        modalProducto.classList.add('hidden');
        formProducto.reset(); 
    };

    if (btnNuevoProducto) btnNuevoProducto.addEventListener('click', abrirModal);
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
    if (btnCancelarModal) btnCancelarModal.addEventListener('click', cerrarModal);

    if (btnGuardarProducto) {
        btnGuardarProducto.addEventListener('click', (e) => {
            e.preventDefault();
            guardarNuevoProducto();
        });
    }

    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            if(confirm('¿Estás seguro que deseas cerrar la sesión?')) {
                try {
                    await signOut(auth);
                } catch (error) {
                    console.error("Error al cerrar sesión", error);
                }
            }
        });
    }
}

/**
 * Guarda un nuevo producto directamente en Firestore
 */
async function guardarNuevoProducto() {
    const nombre = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const precio = parseFloat(document.getElementById('prod-precio').value);
    const imagen = document.getElementById('prod-imagen').value.trim() || 'ph-package';

    if (!nombre || !categoria || isNaN(precio)) {
        alert('Por favor, completa los campos obligatorios (*).');
        return; 
    }

    const btnGuardar = document.getElementById('btn-guardar-producto');
    const originalText = btnGuardar.innerHTML;
    btnGuardar.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';
    btnGuardar.disabled = true;

    // Objeto con los datos que irán a la base de datos
    const nuevoProducto = {
        name: nombre,
        category: categoria,
        price: precio,
        imageIcon: imagen,
        isNew: true,
        createdAt: new Date().toISOString() // Fecha de creación
    };

    try {
        // Magia: Enviamos los datos a Firebase
        await addDoc(productsRef, nuevoProducto);
        
        // Si funcionó:
        document.getElementById('modal-producto').classList.add('hidden');
        document.getElementById('form-producto').reset();
        
        // Volvemos a descargar los productos para actualizar la tabla
        await loadProducts();
        
    } catch (error) {
        console.error("Error al guardar en BD:", error);
        alert("Hubo un error al guardar el producto.");
    } finally {
        btnGuardar.innerHTML = originalText;
        btnGuardar.disabled = false;
    }
}

/**
 * Elimina un producto de Firestore
 */
async function eliminarProducto(id) {
    if (confirm('¿Estás seguro de que deseas eliminar este producto PERMANENTEMENTE de la base de datos?')) {
        try {
            // Apuntamos al documento exacto en Firebase y lo borramos
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'products', id));
            
            // Volvemos a descargar los productos para actualizar la tabla
            await loadProducts();
        } catch (error) {
            console.error("Error al eliminar de BD:", error);
            alert("Error al eliminar el producto.");
        }
    }
}
