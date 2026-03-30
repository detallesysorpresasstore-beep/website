/**
 * Detalles y Sorpresas STORE - Lógica del Panel de Administración (Módulo)
 */
import { products } from './products.js';
import { auth, onAuthStateChanged, signOut } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. Proteger la ruta: Verificar si hay un usuario administrador activo
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // El usuario está verificado, inicializamos el panel
            console.log("Acceso concedido al admin:", user.email);
            initAdmin();
        } else {
            // No hay usuario logueado, lo expulsamos al index
            window.location.href = 'index.html';
        }
    });
});

function initAdmin() {
    renderAdminProducts();
    setupEventListeners();
}

/**
 * Renderiza la lista de productos en la tabla del panel
 */
function renderAdminProducts() {
    const tbody = document.getElementById('admin-products-list');
    if (!tbody) return;

    // Limpiamos el contenido actual
    tbody.innerHTML = '';

    // Generamos las filas dinámicamente
    products.forEach(product => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0';
        
        const iconClass = product.imageIcon ? product.imageIcon : 'ph-package';

        tr.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                        <i class="ph-duotone ${iconClass} text-xl"></i>
                    </div>
                    <span class="font-medium text-gray-800">${product.name}</span>
                </div>
            </td>
            <td class="p-4 text-gray-500">${product.category}</td>
            <td class="p-4 text-gray-800 font-semibold">$${Number(product.price).toFixed(2)}</td>
            <td class="p-4">
                <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">En Stock</span>
            </td>
            <td class="p-4 text-center">
                <button class="text-gray-400 hover:text-brand-blue p-1 transition-colors" title="Editar">
                    <i class="ph ph-pencil-simple text-lg"></i>
                </button>
                <button class="text-gray-400 hover:text-red-500 p-1 transition-colors btn-eliminar" data-id="${product.id}" title="Eliminar">
                    <i class="ph ph-trash text-lg"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Como ahora es un módulo, asignamos los eventos de eliminar de esta forma segura:
    document.querySelectorAll('.btn-eliminar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('button').getAttribute('data-id');
            eliminarProductoSimulado(id);
        });
    });
}

/**
 * Configura los eventos del panel
 */
function setupEventListeners() {
    const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
    const modalProducto = document.getElementById('modal-producto');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const btnCancelarModal = document.getElementById('btn-cancelar-modal');
    const btnGuardarProducto = document.getElementById('btn-guardar-producto');
    const formProducto = document.getElementById('form-producto');
    
    // Seleccionamos el botón de Cerrar Sesión de la barra lateral (el que es de color rojo)
    const btnCerrarSesion = document.querySelector('aside button.text-red-500');

    // Funciones para manejar el modal
    const abrirModal = () => modalProducto.classList.remove('hidden');
    const cerrarModal = () => {
        modalProducto.classList.add('hidden');
        formProducto.reset(); 
    };

    if (btnNuevoProducto) btnNuevoProducto.addEventListener('click', abrirModal);
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
    if (btnCancelarModal) btnCancelarModal.addEventListener('click', cerrarModal);

    if (btnGuardarProducto) {
        btnGuardarProducto.addEventListener('click', () => {
            if (guardarNuevoProducto()) {
                cerrarModal();
            }
        });
    }

    // Lógica para cerrar sesión con Firebase
    if (btnCerrarSesion) {
        btnCerrarSesion.addEventListener('click', async () => {
            if(confirm('¿Estás seguro que deseas cerrar la sesión del panel?')) {
                try {
                    await signOut(auth);
                    // No necesitamos redireccionar manualmente aquí, 
                    // la función 'onAuthStateChanged' de arriba detectará que saliste y te expulsará.
                } catch (error) {
                    console.error("Error al cerrar sesión", error);
                }
            }
        });
    }
}

function guardarNuevoProducto() {
    const nombre = document.getElementById('prod-nombre').value;
    const categoria = document.getElementById('prod-categoria').value;
    const precio = parseFloat(document.getElementById('prod-precio').value);
    const imagen = document.getElementById('prod-imagen').value || 'ph-package';

    if (!nombre || !categoria || isNaN(precio)) {
        alert('Por favor, completa todos los campos obligatorios (*) con valores válidos.');
        return false; 
    }

    const nuevoProducto = {
        id: 'prod_' + Date.now(),
        name: nombre,
        category: categoria,
        price: precio,
        originalPrice: null,
        imageIcon: imagen,
        isNew: true,
        tagColor: "brand-blue"
    };

    products.unshift(nuevoProducto);
    renderAdminProducts();
    
    alert('¡Producto agregado con éxito! (Simulación local)');
    return true; 
}

function eliminarProductoSimulado(id) {
    if (confirm('¿Estás seguro de que deseas eliminar este producto?')) {
        const indice = products.findIndex(p => p.id === id);
        if (indice !== -1) {
            products.splice(indice, 1);
            renderAdminProducts(); 
        }
    }
}
