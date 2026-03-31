/**
 * Detalles y Sorpresas STORE - Archivo Principal JS (Módulo Seguro)
 */

import { auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
 * Control del Menú Móvil
 */
function setupMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if(btn && menu) {
        btn.addEventListener('click', () => {
            menu.classList.toggle('hidden');
        });
    }
}

/**
 * Escucha los cambios de sesión para actualizar la UI
 */
function monitorAuthState() {
    const btnLogin = document.getElementById('btn-abrir-login');
    const btnLoginMovil = document.getElementById('btn-abrir-login-movil');
    const btnLoginIcon = btnLogin ? btnLogin.querySelector('i') : null;

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            // Usuario logueado: Ícono resaltado
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('ph');
                btnLoginIcon.classList.add('text-brand-orange', 'ph-fill');
            }
            if(btnLoginMovil) btnLoginMovil.textContent = "Mi Perfil";
        } else {
            // Usuario desconectado: Ícono normal
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('text-brand-orange', 'ph-fill');
                btnLoginIcon.classList.add('ph');
            }
            if(btnLoginMovil) btnLoginMovil.textContent = "Mi Cuenta";
        }
    });
}

/**
 * Configuración del Modal de Login y Registro
 */
function setupLoginModal() {
    const modal = document.getElementById('modal-login');
    const btnAbrir = document.getElementById('btn-abrir-login');
    const btnAbrirMovil = document.getElementById('btn-abrir-login-movil');
    const btnCerrar = document.getElementById('btn-cerrar-login');
    
    const form = document.getElementById('form-login');
    const btnToggle = document.getElementById('btn-toggle-mode');
    const toggleText = document.getElementById('toggle-text');
    const btnSubmit = document.getElementById('btn-submit-login');
    const modalTitle = document.getElementById('modal-title');
    
    // Elementos del formulario
    const divNombre = document.getElementById('div-nombre');
    const divTelefono = document.getElementById('div-telefono'); // NUEVO: Contenedor del teléfono
    const inputName = document.getElementById('login-name');
    const inputPhone = document.getElementById('login-phone'); // NUEVO: Input del teléfono
    const inputEmail = document.getElementById('login-email');
    const inputPassword = document.getElementById('login-password');
    const passHint = document.getElementById('password-hint');
    const loginError = document.getElementById('login-error');
    const loginSuccess = document.getElementById('login-success');

    let isLoginMode = true;

    // Función para abrir el modal o gestionar la sesión activa
    const abrirModal = async () => {
        if(currentUser) {
            // Si ya hay sesión, le preguntamos si quiere cerrarla
            const conf = confirm("Ya tienes una sesión iniciada. ¿Deseas cerrar sesión?");
            if(conf) {
                await signOut(auth);
                window.location.reload();
            } else {
                // Si no quiere cerrar, verificamos si es admin para enviarlo a su panel
                try {
                    const userDoc = await getDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", currentUser.uid));
                    if(userDoc.exists() && userDoc.data().role === 'admin'){
                        window.location.href = 'admin.html';
                    }
                } catch(e) { console.error(e); }
            }
            return;
        }
        modal.classList.remove('hidden');
    };

    if(btnAbrir) btnAbrir.addEventListener('click', abrirModal);
    if(btnAbrirMovil) btnAbrirMovil.addEventListener('click', abrirModal);
    
    // Cerrar modal
    if(btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            modal.classList.add('hidden');
            form.reset();
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
        });
    }

    // Alternar entre Login y Registro
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            
            // Actualizar UI general
            modalTitle.innerHTML = isLoginMode ? '<i class="ph-fill ph-user-circle text-brand-blue text-2xl"></i> Mi Cuenta' : '<i class="ph-fill ph-user-plus text-brand-orange text-2xl"></i> Crear Cuenta';
            btnSubmit.innerHTML = isLoginMode ? '<span>Ingresar</span>' : '<span>Registrarse</span>';
            toggleText.textContent = isLoginMode ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
            btnToggle.textContent = isLoginMode ? 'Regístrate aquí' : 'Ingresa aquí';
            
            // Mostrar/Ocultar campos extra (Nombre y Teléfono)
            divNombre.classList.toggle('hidden', isLoginMode);
            divTelefono.classList.toggle('hidden', isLoginMode);
            passHint.classList.toggle('hidden', isLoginMode);
            
            // Solo el nombre es requerido en el registro (el teléfono es opcional)
            inputName.required = !isLoginMode;

            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
        });
    }

    // Enviar Formulario
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
            
            const email = inputEmail.value.trim();
            const password = inputPassword.value;
            const name = inputName.value.trim();
            const phone = inputPhone.value.trim(); // NUEVO: Capturar teléfono

            const originalText = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Procesando...';

            try {
                if (isLoginMode) {
                    // MODO LOGIN
                    await signInWithEmailAndPassword(auth, email, password);
                    loginSuccess.textContent = '¡Bienvenido de nuevo!';
                    loginSuccess.classList.remove('hidden');
                    
                    setTimeout(async () => {
                        // Verificamos el rol antes de redirigir
                        const userDoc = await getDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", auth.currentUser.uid));
                        if(userDoc.exists() && userDoc.data().role === 'admin'){
                            window.location.href = 'admin.html';
                        } else {
                            modal.classList.add('hidden');
                            window.location.reload();
                        }
                    }, 1000);

                } else {
                    // MODO REGISTRO
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const user = userCredential.user;
                    
                    // Guardar datos adicionales en Firestore
                    await setDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", user.uid), {
                        name: name,
                        email: email,
                        phone: phone || '', // NUEVO: Guardar teléfono (o vacío si no lo puso)
                        role: 'client', // Por defecto todos son clientes
                        createdAt: new Date().toISOString()
                    });

                    loginSuccess.textContent = '¡Cuenta creada con éxito!';
                    loginSuccess.classList.remove('hidden');
                    
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        window.location.reload();
                    }, 1500);
                }

            } catch (error) {
                console.error("Error Auth/Firestore:", error);
                loginError.classList.remove('hidden');
                
                // Manejo de errores de Firebase
                switch (error.code) {
                    case 'auth/invalid-credential':
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
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
