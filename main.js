/**
 * Detalles y Sorpresas STORE - Archivo Principal JS
 * Aquí centralizaremos la lógica de la interfaz de usuario.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar todas las funciones principales de la app
    initApp();
});

function initApp() {
    setupMobileMenu();
    // Aquí agregaremos más adelante funciones como:
    // renderProducts();
    // setupCart();
    // initFirebaseAuth();
}

/**
 * Configura la interactividad del menú de navegación para dispositivos móviles
 */
function setupMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');

    if (btn && menu) {
        btn.addEventListener('click', () => {
            menu.classList.toggle('hidden');
        });
    } else {
        console.warn('Elementos del menú móvil no encontrados en el DOM.');
    }
}
