/**
 * Detalles y Sorpresas STORE - Archivo Principal JS
 */

import { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase-config.js';
// Importamos la función para registrar nuevos usuarios directamente de Firebase
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Correos que tienen permisos de Administrador
const ADMIN_EMAILS = ['detallesysorpresasstore@gmail.com', 'admin@tienda.com', 'admin@detalles.com'];

let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    setupMobileMenu();
    setupLoginModal();
    monitorAuthState();
}

/**
 * Escucha los cambios de sesión (Si alguien se loguea o desloguea)
 */
function monitorAuthState() {
    const btnLogin = document.getElementById('btn-abrir-login');
    const btnLoginIcon = btnLogin ? btnLogin.querySelector('i') : null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        
        if (user) {
            console.log('Usuario activo:', user.email);
            // Cambiamos el color del ícono para indicar que está logueado
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('text-gray-600', 'ph');
                btnLoginIcon.classList.add('text-brand-orange', 'ph-fill');
            }
        } else {
            console.log('No hay usuario activo.');
            // Restauramos el ícono normal
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('text-brand-orange', 'ph-fill');
                btnLoginIcon.classList.add('text-gray-600', 'ph');
            }
        }
    });
}

/**
 * Configura la interactividad del menú móvil
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
 * Configura la interactividad del Modal de Usuarios (Login / Registro)
 */
function setupLoginModal() {
    const modal = document.getElementById('modal-login');
    const btnAbrir = document.getElementById('btn-abrir-login');
    const btnAbrirMovil = document.getElementById('btn-abrir-login-movil');
    const btnCerrar = document.getElementById('btn-cerrar-login');
    
    // Elementos del formulario
    const formLogin = document.getElementById('form-login');
    const divNombre = document.getElementById('div-nombre');
    const passHint = document.getElementById('password-hint');
    const loginError = document.getElementById('login-error');
    const loginSuccess = document.getElementById('login-success');
    const btnSubmit = document.getElementById('btn-submit-login');
    
    // Elementos para alternar modo
    const btnToggleMode = document.getElementById('btn-toggle-mode');
    const toggleText = document.getElementById('toggle-text');
    const modalTitle = document.getElementById('modal-title');

    let isLoginMode = true; // Por defecto empezamos en modo Iniciar Sesión

    // Función para abrir el modal (o preguntar si quiere cerrar sesión)
    const handleOpenModal = () => {
        if (currentUser) {
            // Si ya hay alguien logueado, le preguntamos si quiere salir
            if (confirm(`Sesión iniciada como: ${currentUser.email}\n¿Deseas cerrar tu sesión?`)) {
                signOut(auth).then(() => {
                    alert('Sesión cerrada correctamente.');
                    window.location.reload();
                });
            }
        } else {
            // Si no hay nadie logueado, abrimos el modal
            modal.classList.remove('hidden');
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
        }
    };

    const cerrarModal = () => {
        modal.classList.add('hidden');
        formLogin.reset(); 
    };

    // Alternar entre Iniciar Sesión y Registro
    const toggleMode = () => {
        isLoginMode = !isLoginMode;
        loginError.classList.add('hidden');
        loginSuccess.classList.add('hidden');

        if (isLoginMode) {
            // Diseño de Iniciar Sesión
            modalTitle.innerHTML = '<i class="ph-fill ph-user-circle text-brand-blue text-2xl"></i> Mi Cuenta';
            divNombre.classList.add('hidden');
            passHint.classList.add('hidden');
            btnSubmit.innerHTML = '<span>Ingresar</span>';
            toggleText.textContent = '¿No tienes cuenta?';
            btnToggleMode.textContent = 'Regístrate aquí';
        } else {
            // Diseño de Registro
            modalTitle.innerHTML = '<i class="ph-fill ph-user-plus text-brand-orange text-2xl"></i> Crear Cuenta';
            divNombre.classList.remove('hidden');
            passHint.classList.remove('hidden');
            btnSubmit.innerHTML = '<span>Registrarse</span>';
            toggleText.textContent = '¿Ya tienes cuenta?';
            btnToggleMode.textContent = 'Inicia sesión';
        }
    };

    // Asignar eventos
    if (btnAbrir) btnAbrir.addEventListener('click', handleOpenModal);
    if (btnAbrirMovil) btnAbrirMovil.addEventListener('click', () => {
        document.getElementById('mobile-menu').classList.add('hidden');
        handleOpenModal();
    });
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarModal);
    if (btnToggleMode) btnToggleMode.addEventListener('click', toggleMode);

    // Procesar el formulario con Firebase
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            // Cambiamos el estado del botón a "Cargando"
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Procesando...';
            btnSubmit.disabled = true;
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');

            try {
                let userCredential;

                if (isLoginMode) {
                    // Acción: Iniciar Sesión
                    userCredential = await signInWithEmailAndPassword(auth, email, password);
                } else {
                    // Acción: Registrarse
                    userCredential = await createUserWithEmailAndPassword(auth, email, password);
                }
                
                // VERIFICACIÓN: ¿Es un usuario normal o un Administrador?
                const userEmail = userCredential.user.email.toLowerCase();
                
                if (ADMIN_EMAILS.includes(userEmail)) {
                    // Es un administrador -> Lo mandamos al panel
                    window.location.href = 'admin.html';
                } else {
                    // Es un cliente normal -> Lo dejamos en la tienda y damos bienvenida
                    loginSuccess.classList.remove('hidden');
                    loginSuccess.textContent = isLoginMode ? '¡Sesión iniciada con éxito!' : '¡Cuenta creada con éxito!';
                    
                    setTimeout(() => {
                        cerrarModal();
                        alert(`¡Hola! Bienvenido/a a Detalles y Sorpresas STORE.`);
                        // Al recargar la página, se aplicarán los estilos de "Logueado" en el botón
                        window.location.reload(); 
                    }, 1000);
                }
                
            } catch (error) {
                console.error('Error de autenticación:', error.code, error.message);
                loginError.classList.remove('hidden');
                
                // Manejo de errores comunes para el usuario
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                    loginError.textContent = 'Usuario o contraseña incorrectos.';
                } else if (error.code === 'auth/email-already-in-use') {
                    loginError.textContent = 'Este correo ya está registrado.';
                } else if (error.code === 'auth/weak-password') {
                    loginError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                } else {
                    loginError.textContent = 'Ocurrió un error. Intenta de nuevo.';
                }
            } finally {
                // Restauramos el botón
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }
}
