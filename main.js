/**
 * Detalles y Sorpresas STORE - Archivo Principal JS (Módulo Seguro)
 */

import { auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const appId = typeof __app_id !== 'undefined' ? __app_id : 'detalles-y-sorpresas-store';
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
 * Escucha los cambios de sesión para actualizar la UI
 */
function monitorAuthState() {
    const btnLogin = document.getElementById('btn-abrir-login');
    const btnLoginIcon = btnLogin ? btnLogin.querySelector('i') : null;

    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            // Usuario logueado: Ícono resaltado
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('text-gray-600', 'ph');
                btnLoginIcon.classList.add('text-brand-orange', 'ph-fill');
            }
        } else {
            // Usuario desconectado: Ícono normal
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('text-brand-orange', 'ph-fill');
                btnLoginIcon.classList.add('text-gray-600', 'ph');
            }
        }
    });
}

/**
 * Control del menú de navegación móvil
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
 * Lógica del Modal de Autenticación (Login y Registro)
 */
function setupLoginModal() {
    const modal = document.getElementById('modal-login');
    const btnAbrir = document.getElementById('btn-abrir-login');
    const btnAbrirMovil = document.getElementById('btn-abrir-login-movil');
    const btnCerrar = document.getElementById('btn-cerrar-login');
    
    const formLogin = document.getElementById('form-login');
    const divNombre = document.getElementById('div-nombre');
    const loginError = document.getElementById('login-error');
    const loginSuccess = document.getElementById('login-success');
    const btnSubmit = document.getElementById('btn-submit-login');
    
    const btnToggleMode = document.getElementById('btn-toggle-mode');
    const toggleText = document.getElementById('toggle-text');
    const modalTitle = document.getElementById('modal-title');

    let isLoginMode = true;

    const handleOpenModal = () => {
        if (currentUser) {
            // Si ya hay sesión, ofrecer cerrar sesión directamente
            const confirmLogout = confirm(`Sesión activa: ${currentUser.email}\n¿Deseas cerrar sesión?`);
            if (confirmLogout) {
                signOut(auth).then(() => window.location.reload());
            }
        } else {
            modal.classList.remove('hidden');
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
        }
    };

    const toggleMode = () => {
        isLoginMode = !isLoginMode;
        loginError.classList.add('hidden');
        loginSuccess.classList.add('hidden');

        if (isLoginMode) {
            modalTitle.innerHTML = '<i class="ph-fill ph-user-circle text-brand-blue text-2xl"></i> Mi Cuenta';
            divNombre.classList.add('hidden');
            btnSubmit.innerHTML = '<span>Ingresar</span>';
            toggleText.textContent = '¿No tienes cuenta?';
            btnToggleMode.textContent = 'Regístrate aquí';
        } else {
            modalTitle.innerHTML = '<i class="ph-fill ph-user-plus text-brand-orange text-2xl"></i> Crear Cuenta';
            divNombre.classList.remove('hidden');
            btnSubmit.innerHTML = '<span>Registrarse</span>';
            toggleText.textContent = '¿Ya tienes cuenta?';
            btnToggleMode.textContent = 'Inicia sesión';
        }
    };

    if (btnAbrir) btnAbrir.addEventListener('click', handleOpenModal);
    if (btnAbrirMovil) btnAbrirMovil.addEventListener('click', handleOpenModal);
    if (btnCerrar) btnCerrar.addEventListener('click', () => modal.classList.add('hidden'));
    if (btnToggleMode) btnToggleMode.addEventListener('click', toggleMode);

    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const name = document.getElementById('login-name').value.trim();

            btnSubmit.disabled = true;
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Procesando...';
            loginError.classList.add('hidden');

            try {
                let userCredential;

                if (isLoginMode) {
                    // INICIO DE SESIÓN
                    userCredential = await signInWithEmailAndPassword(auth, email, password);
                } else {
                    // REGISTRO DE NUEVO USUARIO
                    userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    
                    // CREACIÓN AUTOMÁTICA EN FIRESTORE (Rol por defecto: 'user')
                    // Path: /artifacts/{appId}/public/data/users/{uid}
                    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userCredential.user.uid), {
                        uid: userCredential.user.uid,
                        email: email,
                        name: name || 'Usuario',
                        role: 'user', // <--- Tú podrás cambiar esto a 'admin' en la consola
                        createdAt: new Date().toISOString()
                    });
                }

                // VERIFICACIÓN DE ROL: Consultamos Firestore para ver a dónde enviar al usuario
                const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userCredential.user.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists() && userSnap.data().role === 'admin') {
                    // Es Administrador: Redirigir al panel
                    window.location.href = 'admin.html';
                } else {
                    // Es Cliente: Mostrar éxito y recargar la tienda
                    loginSuccess.classList.remove('hidden');
                    loginSuccess.textContent = isLoginMode ? '¡Bienvenido de nuevo!' : '¡Cuenta creada con éxito!';
                    
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        window.location.reload();
                    }, 1000);
                }

            } catch (error) {
                console.error("Error Auth/Firestore:", error);
                loginError.classList.remove('hidden');
                
                // Traducción de errores comunes de Firebase
                switch (error.code) {
                    case 'auth/wrong-password':
                    case 'auth/user-not-found':
                    case 'auth/invalid-credential':
                        loginError.textContent = 'Correo o contraseña incorrectos.';
                        break;
                    case 'auth/email-already-in-use':
                        loginError.textContent = 'Este correo ya está registrado.';
                        break;
                    case 'auth/weak-password':
                        loginError.textContent = 'La contraseña debe tener al menos 6 caracteres.';
                        break;
                    default:
                        loginError.textContent = 'Ocurrió un problema técnico. Intenta más tarde.';
                }
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalText;
            }
        });
    }
}
