/**
 * Detalles y Sorpresas STORE - Archivo Principal JS (Tienda Pública y Autenticación)
 */

import { auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let currentUser = null;
window.productosPublicos = []; // Guardamos los productos en memoria para cargarlos rápido en el modal

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    setupMobileMenu();
    setupLoginModal();
    monitorAuthState();
    
    // Cargar datos de la tienda
    cargarCategoriasPublicas();
    cargarProductosPublicos();
    
    // Activar lógica del modal de productos
    setupModalDetalle();
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
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('ph');
                btnLoginIcon.classList.add('text-brand-orange', 'ph-fill');
            }
            if(btnLoginMovil) btnLoginMovil.textContent = "Mi Perfil";
        } else {
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
    
    const divNombre = document.getElementById('div-nombre');
    const divTelefono = document.getElementById('div-telefono');
    const inputName = document.getElementById('login-name');
    const inputPhone = document.getElementById('login-phone');
    const inputEmail = document.getElementById('login-email');
    const inputPassword = document.getElementById('login-password');
    const passHint = document.getElementById('password-hint');
    const loginError = document.getElementById('login-error');
    const loginSuccess = document.getElementById('login-success');

    let isLoginMode = true;

    const abrirModal = async () => {
        if(currentUser) {
            const conf = confirm("Ya tienes una sesión iniciada. ¿Deseas cerrar sesión?");
            if(conf) {
                await signOut(auth);
                window.location.reload();
            } else {
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
    
    if(btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            modal.classList.add('hidden');
            form.reset();
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
        });
    }

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            
            modalTitle.innerHTML = isLoginMode ? '<i class="ph-fill ph-user-circle text-brand-blue text-2xl"></i> Mi Cuenta' : '<i class="ph-fill ph-user-plus text-brand-orange text-2xl"></i> Crear Cuenta';
            btnSubmit.innerHTML = isLoginMode ? '<span>Ingresar</span>' : '<span>Registrarse</span>';
            toggleText.textContent = isLoginMode ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
            btnToggle.textContent = isLoginMode ? 'Regístrate aquí' : 'Ingresa aquí';
            
            divNombre.classList.toggle('hidden', isLoginMode);
            divTelefono.classList.toggle('hidden', isLoginMode);
            passHint.classList.toggle('hidden', isLoginMode);
            
            inputName.required = !isLoginMode;

            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            loginError.classList.add('hidden');
            loginSuccess.classList.add('hidden');
            
            const email = inputEmail.value.trim();
            const password = inputPassword.value;
            const name = inputName.value.trim();
            const phone = inputPhone.value.trim();

            const originalText = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Procesando...';

            try {
                if (isLoginMode) {
                    await signInWithEmailAndPassword(auth, email, password);
                    loginSuccess.textContent = '¡Bienvenido de nuevo!';
                    loginSuccess.classList.remove('hidden');
                    
                    setTimeout(async () => {
                        const userDoc = await getDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", auth.currentUser.uid));
                        if(userDoc.exists() && userDoc.data().role === 'admin'){
                            window.location.href = 'admin.html';
                        } else {
                            modal.classList.add('hidden');
                            window.location.reload();
                        }
                    }, 1000);
                } else {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    const user = userCredential.user;
                    
                    await setDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", user.uid), {
                        name: name,
                        email: email,
                        phone: phone || '',
                        role: 'client',
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

// ==========================================
// CREADORES DE TIENDA PÚBLICA (FRONTEND DINÁMICO)
// ==========================================

async function cargarCategoriasPublicas() {
    const contenedor = document.getElementById('public-categories');
    if (!contenedor) return;

    try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        contenedor.innerHTML = '';

        if (querySnapshot.empty) {
            contenedor.innerHTML = '<p class="col-span-full text-center text-gray-500">Próximamente nuevas categorías.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const cat = docSnap.data();
            contenedor.innerHTML += `
                <a href="#destacados" class="category-card block p-6 bg-white rounded-3xl transition-all duration-300 border border-gray-100 hover:border-brand-blue flex flex-col items-center justify-center">
                    <i class="${cat.icono} text-5xl mb-3 text-brand-blue"></i>
                    <h3 class="font-semibold text-gray-700">${cat.nombre}</h3>
                </a>
            `;
        });
    } catch (error) {
        console.error("Error al cargar categorías:", error);
        contenedor.innerHTML = '<p class="col-span-full text-center text-red-500">Error al conectar con el servidor.</p>';
    }
}

async function cargarProductosPublicos() {
    const contenedor = document.getElementById('public-products');
    if (!contenedor) return;

    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        contenedor.innerHTML = '';
        window.productosPublicos = []; // Reseteamos la memoria local

        if (querySnapshot.empty) {
            contenedor.innerHTML = '<p class="col-span-full text-center text-gray-500">No hay productos disponibles por ahora.</p>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const prod = docSnap.data();
            prod.id = docSnap.id;
            
            // Compatibilidad de imágenes
            prod.imagenes = prod.imagenes || (prod.imagen ? [prod.imagen] : []);
            window.productosPublicos.push(prod);

            // Generar vista de la tarjeta
            const imgPortada = prod.imagenes.length > 0 ? prod.imagenes[0] : 'https://via.placeholder.com/300?text=Sin+Foto';
            let imgHTML = imgPortada.startsWith('http') 
                ? `<img src="${imgPortada}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="${prod.nombre}">`
                : `<div class="w-full h-full flex items-center justify-center bg-gray-100 text-6xl text-gray-300"><i class="${imgPortada}"></i></div>`;

            contenedor.innerHTML += `
                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group cursor-pointer flex flex-col" onclick="abrirModalDetalle('${prod.id}')">
                    <div class="relative h-64 overflow-hidden bg-gray-50 flex items-center justify-center p-2">
                        ${imgHTML}
                        <div class="absolute inset-0 bg-black bg-opacity-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span class="bg-white text-gray-800 font-bold py-2 px-4 rounded-full shadow-lg flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all">
                                <i class="ph ph-eye text-xl"></i> Ver Detalle
                            </span>
                        </div>
                    </div>
                    <div class="p-5 flex flex-col flex-grow">
                        <span class="text-xs font-bold text-brand-blue uppercase tracking-wider mb-1">${prod.categoria}</span>
                        <h3 class="text-lg font-semibold text-gray-800 mb-2 line-clamp-2">${prod.nombre}</h3>
                        <div class="mt-auto flex items-center justify-between">
                            <span class="text-2xl font-bold text-brand-pink">$${prod.precio.toFixed(2)}</span>
                            <button class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-brand-orange hover:text-white transition-colors" onclick="event.stopPropagation(); alert('Se añadirá al carrito pronto')">
                                <i class="ph ph-shopping-cart text-xl font-bold"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error al cargar productos:", error);
        contenedor.innerHTML = '<p class="col-span-full text-center text-red-500">Error al cargar el catálogo de productos.</p>';
    }
}

// ==========================================
// LÓGICA DEL MODAL DE DETALLES DEL PRODUCTO
// ==========================================

function setupModalDetalle() {
    const modal = document.getElementById('modal-detalle-producto');
    const btnCerrar = document.getElementById('btn-cerrar-detalle');
    const btnRestar = document.getElementById('btn-restar-qty');
    const btnSumar = document.getElementById('btn-sumar-qty');
    const inputQty = document.getElementById('detalle-qty');

    if(btnCerrar) {
        btnCerrar.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Control del contador de cantidad
    if(btnRestar && btnSumar && inputQty) {
        btnRestar.addEventListener('click', () => {
            let val = parseInt(inputQty.value);
            if(val > 1) inputQty.value = val - 1;
        });
        btnSumar.addEventListener('click', () => {
            let val = parseInt(inputQty.value);
            inputQty.value = val + 1; // Aquí luego limitaremos según el stock
        });
    }

    // Función expuesta globalmente para que funcione en el onclick del HTML inyectado
    window.abrirModalDetalle = (id) => {
        const prod = window.productosPublicos.find(p => p.id === id);
        if(!prod) return;

        // Inyectar textos
        document.getElementById('detalle-categoria').textContent = prod.categoria;
        document.getElementById('detalle-nombre').textContent = prod.nombre;
        document.getElementById('detalle-precio').textContent = `$${prod.precio.toFixed(2)}`;
        document.getElementById('detalle-descripcion').textContent = prod.descripcion || 'Este producto no tiene una descripción detallada.';
        inputQty.value = 1;

        // Inyectar imágenes
        const imgPrincipal = document.getElementById('detalle-img-principal');
        const contMiniaturas = document.getElementById('detalle-miniaturas');
        
        imgPrincipal.src = '';
        contMiniaturas.innerHTML = '';

        if(prod.imagenes && prod.imagenes.length > 0 && prod.imagenes[0].startsWith('http')) {
            imgPrincipal.src = prod.imagenes[0];
            
            // Generar miniaturas solo si hay más de 1 imagen
            if(prod.imagenes.length > 1) {
                prod.imagenes.forEach((url, index) => {
                    const borderClass = index === 0 ? 'border-brand-blue' : 'border-transparent';
                    contMiniaturas.innerHTML += `
                        <button onclick="cambiarImagenPrincipal(this, '${url}')" class="miniatura-btn flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${borderClass} transition-colors p-1 bg-white">
                            <img src="${url}" class="w-full h-full object-contain">
                        </button>
                    `;
                });
            }
        }

        modal.classList.remove('hidden');
    };

    // Función para cambiar la imagen grande al tocar una miniatura
    window.cambiarImagenPrincipal = (btn, url) => {
        document.getElementById('detalle-img-principal').src = url;
        
        // Quitar borde azul de todos los botones y ponérselo al que se clickeó
        document.querySelectorAll('.miniatura-btn').forEach(b => {
            b.classList.remove('border-brand-blue');
            b.classList.add('border-transparent');
        });
        btn.classList.remove('border-transparent');
        btn.classList.add('border-brand-blue');
    };
}
