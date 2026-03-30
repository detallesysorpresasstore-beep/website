/**
 * Detalles y Sorpresas STORE - Archivo Principal JS
 */

// Importamos los servicios de Firebase desde nuestro archivo de configuración
import { auth, signInWithEmailAndPassword } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    setupMobileMenu();
    setupLoginModal();
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
    }
}

/**
 * Configura la interactividad del Modal de Login y la conexión con Firebase Auth
 */
function setupLoginModal() {
    const modal = document.getElementById('modal-login');
    const btnAbrir = document.getElementById('btn-abrir-login');
    const btnAbrirMovil = document.getElementById('btn-abrir-login-movil');
    const btnCerrar = document.getElementById('btn-cerrar-login');
    const formLogin = document.getElementById('form-login');
    const loginError = document.getElementById('login-error');
    const btnSubmit = document.getElementById('btn-submit-login');

    // Funciones para mostrar y ocultar el modal
    const abrirModal = () => {
        modal.classList.remove('hidden');
        loginError.classList.add('hidden'); // Ocultamos errores previos
    };
    
    const cerrarModal = () => {
        modal.classList.add('hidden');
        formLogin.reset(); // Limpiamos los campos de texto
    };

    // Asignar eventos de clic
    if (btnAbrir) btnAbrir.addEventListener('click', abrirModal);
    if (btnAbrirMovil) btnAbrirMovil.addEventListener('click', () => {
        abrirModal();
        document.getElementById('mobile-menu').classList.add('hidden'); // Cierra el menú móvil
    });
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarModal);

    // LÓGICA DE FIREBASE: Procesar el formulario
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault(); // Evita que la página se recargue

            // Capturamos los datos escritos
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            // Cambiamos el estado del botón a "Cargando" para mejor UX
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Verificando...';
            btnSubmit.disabled = true;
            loginError.classList.add('hidden');

            try {
                // 1. Intento de inicio de sesión con Firebase
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                // 2. Si llegamos a esta línea, el login fue exitoso.
                console.log('Sesión iniciada correctamente:', userCredential.user.email);
                
                // 3. Redirigimos a la página de administración
                window.location.href = 'admin.html';
                
            } catch (error) {
                console.error('Error de autenticación:', error.code, error.message);
                
                // Si hay un error (contraseña equivocada, etc.), mostramos el mensaje rojo
                loginError.classList.remove('hidden');
                
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                    loginError.textContent = 'Usuario o contraseña incorrectos.';
                } else {
                    loginError.textContent = 'Ocurrió un error. Intenta de nuevo.';
                }

                // Restauramos el botón a su estado normal
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }
}
