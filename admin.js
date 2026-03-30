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

    // Limpiamos el contenido actual (el esqueleto de carga)
    tbody.innerHTML = '';

    // Verificamos si existe el array 'products' (de products.js)
    if (typeof products === 'undefined') {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error: No se encontró products.js. Asegúrate de enlazarlo en admin.html</td></tr>';
        return;
    }

    // Generamos las filas dinámicamente
    products.forEach(product => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0';
        
        tr.innerHTML = `
            <td class="p-4">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500">
                        <i class="ph-duotone ${product.imageIcon} text-xl"></i>
                    </div>
                    <span class="font-medium text-gray-800">${product.name}</span>
                </div>
            </td>
            <td class="p-4 text-gray-500">${product.category}</td>
            <td class="p-4 text-gray-800 font-semibold">$${product.price.toFixed(2)}</td>
            <td class="p-4">
                <span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">En Stock</span>
            </td>
            <td class="p-4 text-center">
                <button class="text-gray-400 hover:text-brand-blue p-1 transition-colors" title="Editar">
                    <i class="ph ph-pencil-simple text-lg"></i>
                </button>
                <button class="text-gray-400 hover:text-red-500 p-1 transition-colors" title="Eliminar">
                    <i class="ph ph-trash text-lg"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

/**
 * Configura los eventos de los botones en el panel
 */
function setupEventListeners() {
    // Seleccionamos el botón "Nuevo Producto"
    const btnNuevoProducto = document.querySelector('button.bg-brand-blue');
    
    if (btnNuevoProducto) {
        btnNuevoProducto.addEventListener('click', () => {
            alert('¡Próximo paso! Aquí diseñaremos y abriremos un modal/formulario para cargar un producto nuevo a la base de datos.');
        });
    }
}
