/**
 * Detalles y Sorpresas STORE - Lógica del Panel de Administración
 */

document.addEventListener('DOMContentLoaded', () => {
    initAdmin();
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

    if (typeof products === 'undefined') {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error: No se encontró products.js. Asegúrate de enlazarlo.</td></tr>';
        return;
    }

    // Generamos las filas dinámicamente
    products.forEach(product => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0';
        
        // Si el usuario no pone un ícono, le damos uno por defecto (una cajita)
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
                <button class="text-gray-400 hover:text-red-500 p-1 transition-colors" title="Eliminar" onclick="eliminarProductoSimulado('${product.id}')">
                    <i class="ph ph-trash text-lg"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Configura los eventos del panel (Abrir/Cerrar Modal y Guardar)
 */
function setupEventListeners() {
    const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
    const modalProducto = document.getElementById('modal-producto');
    const btnCerrarModal = document.getElementById('btn-cerrar-modal');
    const btnCancelarModal = document.getElementById('btn-cancelar-modal');
    const btnGuardarProducto = document.getElementById('btn-guardar-producto');
    const formProducto = document.getElementById('form-producto');

    // Funciones para manejar el modal
    const abrirModal = () => modalProducto.classList.remove('hidden');
    const cerrarModal = () => {
        modalProducto.classList.add('hidden');
        formProducto.reset(); // Limpiamos los campos al cerrar
    };

    // Asignamos los eventos de clic a los botones
    if (btnNuevoProducto) btnNuevoProducto.addEventListener('click', abrirModal);
    if (btnCerrarModal) btnCerrarModal.addEventListener('click', cerrarModal);
    if (btnCancelarModal) btnCancelarModal.addEventListener('click', cerrarModal);

    // Evento de guardar
    if (btnGuardarProducto) {
        btnGuardarProducto.addEventListener('click', () => {
            if (guardarNuevoProducto()) {
                cerrarModal();
            }
        });
    }
}

/**
 * Captura los datos del formulario, los valida y simula el guardado
 */
function guardarNuevoProducto() {
    const nombre = document.getElementById('prod-nombre').value;
    const categoria = document.getElementById('prod-categoria').value;
    const precio = parseFloat(document.getElementById('prod-precio').value);
    const imagen = document.getElementById('prod-imagen').value || 'ph-package';

    // Validación simple
    if (!nombre || !categoria || isNaN(precio)) {
        alert('Por favor, completa todos los campos obligatorios (*) con valores válidos.');
        return false; // Retorna falso para que el modal no se cierre
    }

    // Creamos el objeto tal como lo espera nuestra tabla
    const nuevoProducto = {
        id: 'prod_' + Date.now(), // Generamos un ID temporal único
        name: nombre,
        category: categoria,
        price: precio,
        originalPrice: null,
        imageIcon: imagen,
        isNew: true,
        tagColor: "brand-blue"
    };

    // Lo agregamos al principio del array "products"
    products.unshift(nuevoProducto);

    // Volvemos a dibujar la tabla
    renderAdminProducts();
    
    // Mostramos un mensajito temporal
    alert('¡Producto agregado con éxito! (Simulación local)');
    return true; // Retorna verdadero para cerrar el modal
}

/**
 * Función temporal para simular la eliminación de un producto
 */
function eliminarProductoSimulado(id) {
    if (confirm('¿Estás seguro de que deseas eliminar este producto?')) {
        const indice = products.findIndex(p => p.id === id);
        if (indice !== -1) {
            products.splice(indice, 1); // Lo borramos del array
            renderAdminProducts(); // Redibujamos la tabla
        }
    }
}
