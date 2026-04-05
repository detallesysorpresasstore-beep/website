/**
 * Detalles y Sorpresas STORE - Archivo Principal JS (Tienda Pública)
 */

import { auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, increment, runTransaction, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const IMGBB_API_KEY = '6b8e2fe1e92a74135200cbf5317aa9bf';

let currentUser = null;
let currentUserData = null; 
window.productosPublicos = []; 
window.categoriasPublicas = []; // Para guardar las subcategorías
let carritoCompras = []; 
let subtotalGlobal = 0; 

let configuracionTienda = { tasaBcv: 1, tasaCop: 1, whatsapp: '' };
let metodosPagoPublicos = [];
let promocionesPublicas = [];
let urlComprobantePago = ''; 

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupMobileMenu();
    setupLoginModal();
    setupPerfilEdicion(); 
    monitorAuthState();
    setupLightbox(); 
    
    await cargarConfiguracionPublica();
    await cargarMetodosPago();
    await cargarPromocionesPublicas();

    await cargarCategoriasPublicas();
    await cargarProductosPublicos();
    
    iniciarSliderHero();
    
    cargarCarritoLocal();
    setupModalDetalle();
    setupCheckout(); 
    
    verificarCarritoAbandonado(); // Activamos el radar de ventas perdidas
}

// ==========================================
// MÓDULO: CARGAS DESDE EL PANEL ADMIN
// ==========================================

async function cargarConfiguracionPublica() {
    try {
        const docSnap = await getDoc(doc(db, "config", "store_settings"));
        if (docSnap.exists()) {
            const data = docSnap.data();
            configuracionTienda.tasaBcv = parseFloat(data.tasaBcv) || 1;
            configuracionTienda.tasaCop = parseFloat(data.tasaCop) || 1;
            configuracionTienda.whatsapp = data.whatsapp || ''; 

            // Mostrar botón de WhatsApp flotante si hay un número configurado
            const btnWaFlotante = document.getElementById('btn-whatsapp-flotante');
            if (btnWaFlotante && configuracionTienda.whatsapp) {
                const numeroLimpio = configuracionTienda.whatsapp.replace(/\D/g,'');
                btnWaFlotante.href = `https://wa.me/${numeroLimpio}?text=Hola,%20tengo%20una%20duda%20sobre%20los%20productos%20de%20la%20tienda.`;
                btnWaFlotante.classList.remove('hidden');
            }
        }
    } catch (error) { console.error("Error al cargar configuración:", error); }
}

async function cargarMetodosPago() {
    try {
        const snap = await getDocs(collection(db, "payment_methods"));
        metodosPagoPublicos = [];
        snap.forEach(doc => {
            let m = doc.data(); m.id = doc.id;
            metodosPagoPublicos.push(m);
        });
    } catch (e) { console.error("Error al cargar métodos de pago:", e); }
}

async function cargarPromocionesPublicas() {
    try {
        const snap = await getDocs(collection(db, "promotions"));
        promocionesPublicas = [];
        snap.forEach(doc => {
            let p = doc.data(); p.id = doc.id;
            if(p.activa) promocionesPublicas.push(p);
        });
    } catch (e) { console.error("Error al cargar promociones:", e); }
}

function formatearMoneda(montoUSD, moneda) {
    if (moneda === 'VES') return `Bs. ${(montoUSD * configuracionTienda.tasaBcv).toFixed(2)}`;
    if (moneda === 'COP') return `$ ${(montoUSD * configuracionTienda.tasaCop).toFixed(2)} COP`;
    return `$${montoUSD.toFixed(2)}`;
}

// ==========================================
// MÓDULO: MENÚ Y AUTENTICACIÓN
// ==========================================

function setupMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    
    if(btn && menu) {
        // Abrir/Cerrar al presionar el botón de hamburguesa
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Evita que el clic cierre el menú inmediatamente
            menu.classList.toggle('hidden');
        });

        // Cerrar el menú si se hace clic en cualquier enlace o botón dentro de él
        menu.querySelectorAll('a, button').forEach(link => {
            link.addEventListener('click', () => {
                menu.classList.add('hidden');
            });
        });

        // Cerrar el menú si se hace clic fuera de él (en el resto de la página)
        document.addEventListener('click', (e) => {
            if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== btn) {
                menu.classList.add('hidden');
            }
        });
    }
}

function monitorAuthState() {
    const btnLogin = document.getElementById('btn-abrir-login');
    const btnLoginMovil = document.getElementById('btn-abrir-login-movil');
    const btnLoginIcon = btnLogin ? btnLogin.querySelector('i') : null;

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            if (btnLoginIcon) { btnLoginIcon.classList.remove('ph'); btnLoginIcon.classList.add('text-brand-orange', 'ph-fill'); }
            if(btnLoginMovil) btnLoginMovil.textContent = "Mi Perfil";
            
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if(userDoc.exists()) {
                    currentUserData = userDoc.data();
                    if(currentUserData.role === 'admin' && !window.location.href.includes('admin.html')) {
                        window.location.href = 'admin.html';
                    }
                }
            } catch (err) {
                console.warn("No se pudieron cargar los datos del perfil:", err);
            }
        } else {
            currentUserData = null;
            if (btnLoginIcon) { btnLoginIcon.classList.remove('text-brand-orange', 'ph-fill'); btnLoginIcon.classList.add('ph'); }
            if(btnLoginMovil) btnLoginMovil.textContent = "Mi Cuenta";
        }
    });
}

function setupLoginModal() {
    const modal = document.getElementById('modal-login');
    const btnAbrir = document.getElementById('btn-abrir-login');
    const btnAbrirMovil = document.getElementById('btn-abrir-login-movil');
    const btnCerrar = document.getElementById('btn-cerrar-login');
    const form = document.getElementById('form-login');
    const btnToggle = document.getElementById('btn-toggle-mode');
    
    const modalPerfil = document.getElementById('modal-perfil');
    const btnCerrarPerfil = document.getElementById('btn-cerrar-perfil');
    const btnCerrarSesionPerfil = document.getElementById('btn-cerrar-sesion-perfil');
    let isLoginMode = true;

    const abrirModal = async () => {
        if(currentUser) {
            if(currentUserData && currentUserData.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                document.getElementById('perfil-vista-editar').classList.add('hidden');
                document.getElementById('perfil-vista-datos').classList.remove('hidden');
                modalPerfil.classList.remove('hidden');
                cargarPerfilUsuario();
            }
            return;
        }
        document.getElementById('login-mensaje-checkout').classList.add('hidden'); 
        modal.classList.remove('hidden');
    };

    if(btnAbrir) btnAbrir.addEventListener('click', abrirModal);
    if(btnAbrirMovil) btnAbrirMovil.addEventListener('click', abrirModal);
    
    if(btnCerrar) { 
        btnCerrar.addEventListener('click', () => { 
            modal.classList.add('hidden'); 
            form.reset(); 
            document.getElementById('login-mensaje-checkout').classList.add('hidden');
        }); 
    }

    if(btnCerrarPerfil) btnCerrarPerfil.addEventListener('click', () => modalPerfil.classList.add('hidden'));
    if(btnCerrarSesionPerfil) {
        btnCerrarSesionPerfil.addEventListener('click', async () => {
            if(confirm("¿Seguro que deseas cerrar tu sesión?")) {
                await signOut(auth);
                window.location.reload();
            }
        });
    }

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            isLoginMode = !isLoginMode;
            document.getElementById('modal-title').innerHTML = isLoginMode ? '<i class="ph-fill ph-user-circle text-brand-blue text-2xl"></i> Mi Cuenta' : '<i class="ph-fill ph-user-plus text-brand-orange text-2xl"></i> Crear Cuenta';
            document.getElementById('btn-submit-login').innerHTML = isLoginMode ? '<span>Ingresar</span>' : '<span>Registrarse</span>';
            document.getElementById('toggle-text').textContent = isLoginMode ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
            btnToggle.textContent = isLoginMode ? 'Regístrate aquí' : 'Ingresa aquí';
            document.getElementById('div-nombre').classList.toggle('hidden', isLoginMode);
            document.getElementById('div-telefono').classList.toggle('hidden', isLoginMode);
            document.getElementById('password-hint').classList.toggle('hidden', isLoginMode);
            document.getElementById('login-name').required = !isLoginMode;
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = document.getElementById('btn-submit-login');
            const loginError = document.getElementById('login-error');
            const loginSuccess = document.getElementById('login-success');
            loginError.classList.add('hidden'); loginSuccess.classList.add('hidden');
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const name = document.getElementById('login-name').value.trim();
            const phone = document.getElementById('login-phone').value.trim();

            const originalText = btnSubmit.innerHTML;
            btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Procesando...';

            try {
                let uid = null;

                if (isLoginMode) {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    uid = userCredential.user.uid;
                    loginSuccess.textContent = '¡Bienvenido de nuevo!'; 
                    loginSuccess.classList.remove('hidden');
                } else {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    uid = userCredential.user.uid;
                    await setDoc(doc(db, "users", uid), {
                        name: name, email: email, phone: phone || '', address: '', role: 'client', createdAt: new Date().toISOString()
                    });
                    loginSuccess.textContent = '¡Cuenta creada con éxito!'; 
                    loginSuccess.classList.remove('hidden');
                }

                const userDoc = await getDoc(doc(db, "users", uid));
                if(userDoc.exists()) currentUserData = userDoc.data();
                currentUser = auth.currentUser;

                if(currentUserData && currentUserData.role === 'admin') {
                    setTimeout(() => { window.location.href = 'admin.html'; }, 800);
                    return; 
                }

                const vieneDelCheckout = !document.getElementById('login-mensaje-checkout').classList.contains('hidden');

                setTimeout(() => {
                    modal.classList.add('hidden'); 
                    
                    if (vieneDelCheckout) {
                        const selectMetodo = document.getElementById('checkout-metodo');
                        selectMetodo.innerHTML = '<option value="">Selecciona cómo vas a pagar...</option>';
                        metodosPagoPublicos.forEach(m => { selectMetodo.innerHTML += `<option value="${m.id}">${m.nombre}</option>`; });
                        
                        document.getElementById('div-instrucciones-pago').classList.add('hidden'); 
                        document.getElementById('div-referencia').classList.add('hidden'); 
                        document.getElementById('div-comprobante').classList.add('hidden');
                        
                        document.getElementById('checkout-total').textContent = `$${subtotalGlobal.toFixed(2)}`;
                        document.getElementById('checkout-total-bs').textContent = formatearMoneda(subtotalGlobal, 'VES');
                        
                        if(currentUserData && currentUserData.address) {
                            document.getElementById('checkout-direccion').value = currentUserData.address;
                        }

                        document.getElementById('modal-checkout').classList.remove('hidden');
                    } else {
                        window.location.reload(); 
                    }
                }, 1000);

            } catch (error) {
                console.error("Error en Auth:", error);
                loginError.classList.remove('hidden'); loginError.textContent = 'Error: Verifica tus credenciales o conexión.';
            } finally { 
                btnSubmit.disabled = false; btnSubmit.innerHTML = originalText; 
            }
        });
    }
}

// ==========================================
// LÓGICA DE PERFIL (EDICIÓN Y PEDIDOS)
// ==========================================

function setupPerfilEdicion() {
    const btnEditar = document.getElementById('btn-editar-perfil');
    const btnCancelar = document.getElementById('btn-cancelar-edicion');
    const formEditar = document.getElementById('form-editar-perfil');
    const vistaDatos = document.getElementById('perfil-vista-datos');
    const vistaEditar = document.getElementById('perfil-vista-editar');

    if(btnEditar) {
        btnEditar.addEventListener('click', () => {
            document.getElementById('edit-perfil-email').value = currentUser.email;
            document.getElementById('edit-perfil-nombre').value = currentUserData?.name || '';
            document.getElementById('edit-perfil-telefono').value = currentUserData?.phone || '';
            document.getElementById('edit-perfil-direccion').value = currentUserData?.address || '';
            
            vistaDatos.classList.add('hidden');
            vistaEditar.classList.remove('hidden');
        });
    }

    if(btnCancelar) {
        btnCancelar.addEventListener('click', () => {
            vistaEditar.classList.add('hidden');
            vistaDatos.classList.remove('hidden');
        });
    }

    if(formEditar) {
        formEditar.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnGuardar = document.getElementById('btn-guardar-edicion');
            const nombre = document.getElementById('edit-perfil-nombre').value.trim();
            const telefono = document.getElementById('edit-perfil-telefono').value.trim();
            const direccion = document.getElementById('edit-perfil-direccion').value.trim();

            const originalText = btnGuardar.innerHTML;
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Guardando...';

            try {
                await updateDoc(doc(db, "users", currentUser.uid), {
                    name: nombre, phone: telefono, address: direccion
                });
                
                if(currentUserData) {
                    currentUserData.name = nombre;
                    currentUserData.phone = telefono;
                    currentUserData.address = direccion;
                }

                window.cargarPerfilUsuario();
                vistaEditar.classList.add('hidden');
                vistaDatos.classList.remove('hidden');
            } catch(err) {
                console.error("Error actualizando perfil:", err);
                alert("Ocurrió un error al guardar tus datos.");
            } finally {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = '<i class="ph-bold ph-floppy-disk"></i> Guardar';
            }
        });
    }
}

window.cargarPerfilUsuario = async () => {
    if(!currentUser) return;
    
    document.getElementById('perfil-nombre').textContent = currentUserData?.name || 'Cliente de Detalles y Sorpresas';
    document.getElementById('perfil-email').textContent = currentUser.email;
    document.getElementById('perfil-telefono').textContent = currentUserData?.phone || 'Sin teléfono registrado';
    document.getElementById('perfil-direccion').textContent = currentUserData?.address || 'Sin dirección guardada';
    
    let inicial = (currentUserData?.name || 'U').charAt(0).toUpperCase();
    document.getElementById('perfil-avatar').textContent = inicial;

    const lista = document.getElementById('perfil-pedidos-lista');
    lista.innerHTML = '<li class="text-center text-brand-blue py-6"><i class="ph-duotone ph-spinner animate-spin text-4xl mb-2"></i><p class="text-sm font-bold">Buscando tus pedidos...</p></li>';

    try {
        const q = query(collection(db, "orders"), where("clienteId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        let pedidos = [];
        querySnapshot.forEach(doc => {
            let p = doc.data(); p.id = doc.id;
            pedidos.push(p);
        });

        if(pedidos.length === 0) {
            lista.innerHTML = '<li class="text-center text-gray-400 py-6"><i class="ph-duotone ph-receipt text-4xl mb-2 text-gray-300"></i><p>Aún no tienes pedidos registrados.</p></li>';
            return;
        }

        pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        let htmlTemporal = '';
        pedidos.forEach(pedido => {
            let colorEstado = 'bg-gray-100 text-gray-600';
            if(pedido.estado === 'Pendiente') colorEstado = 'bg-yellow-100 text-yellow-700 border-yellow-200'; 
            if(pedido.estado === 'Procesando') colorEstado = 'bg-blue-100 text-blue-700 border-blue-200'; 
            if(pedido.estado === 'Enviado') colorEstado = 'bg-indigo-100 text-indigo-700 border-indigo-200'; 
            if(pedido.estado === 'Entregado') colorEstado = 'bg-green-100 text-green-700 border-green-200'; 
            if(pedido.estado === 'Cancelado') colorEstado = 'bg-red-100 text-red-700 border-red-200';

            let fechaF = 'N/A';
            if(pedido.fecha) {
                fechaF = new Date(pedido.fecha).toLocaleDateString('es-VE', {day:'2-digit', month:'short', year:'numeric'});
            }

            let cantItems = 0;
            if(pedido.productos) pedido.productos.forEach(p => cantItems += p.cantidad);

            htmlTemporal += `
                <li class="bg-white p-3 sm:p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-brand-blue transition-colors">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="font-bold text-gray-800 text-sm">Orden #${pedido.id.slice(-6).toUpperCase()}</span>
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${colorEstado}">${pedido.estado}</span>
                        </div>
                        <p class="text-xs text-gray-500"><i class="ph-fill ph-calendar-blank text-gray-400"></i> ${fechaF} <span class="mx-1">•</span> <i class="ph-fill ph-package text-gray-400"></i> ${cantItems} producto(s)</p>
                    </div>
                    <div class="text-left sm:text-right">
                        <p class="font-black text-gray-800 text-lg leading-none">$${pedido.totalUSD.toFixed(2)}</p>
                        <p class="text-[10px] font-bold text-gray-400 uppercase mt-1">${pedido.metodoPago}</p>
                    </div>
                </li>
            `;
        });

        lista.innerHTML = htmlTemporal;

    } catch (error) {
        console.error("Error cargando historial:", error);
        lista.innerHTML = '<li class="text-center text-red-500 py-6"><i class="ph-fill ph-warning-circle text-4xl mb-2"></i><p>Ocurrió un error al buscar tus pedidos.</p></li>';
    }
};

// ==========================================
// MÓDULO: TIENDA PÚBLICA (CATÁLOGO Y FILTROS)
// ==========================================

async function cargarCategoriasPublicas() {
    const contenedor = document.getElementById('public-categories');
    if (!contenedor) return;
    try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        if (querySnapshot.empty) { contenedor.innerHTML = '<p class="col-span-full text-center text-gray-500">Próximamente nuevas categorías.</p>'; return; }
        
        let htmlTemporal = '';
        window.categoriasPublicas = []; // Reiniciamos arreglo global

        querySnapshot.forEach((docSnap) => {
            const cat = docSnap.data();
            window.categoriasPublicas.push(cat); // Guardamos la categoría completa
            
            // INTELIGENCIA DE COLOR: Evaluamos si es de "niñas"
            const esNina = cat.nombre.toLowerCase().includes('niña');
            const colorBase = esNina ? 'text-brand-pink' : 'text-brand-blue';
            const hoverColor = esNina ? 'hover:border-brand-pink' : 'hover:border-brand-blue';

            htmlTemporal += `<a href="#destacados" onclick="filtrarPorCategoria('${cat.nombre}')" class="category-card block p-6 bg-white rounded-3xl transition-all duration-300 border border-gray-100 ${hoverColor} flex flex-col items-center justify-center"><i class="${cat.icono} text-5xl mb-3 ${colorBase}"></i><h3 class="font-semibold text-gray-700">${cat.nombre}</h3></a>`;
        });
        contenedor.innerHTML = htmlTemporal;
    } catch (error) { console.error(error); }
}

async function cargarProductosPublicos() {
    const contenedor = document.getElementById('public-products');
    if (!contenedor) return;
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        window.productosPublicos = []; 
        let listaOfertas = [];

        querySnapshot.forEach((docSnap) => {
            const prod = docSnap.data(); prod.id = docSnap.id;
            prod.imagenes = prod.imagenes || (prod.imagen ? [prod.imagen] : []);
            prod.stock = prod.stock !== undefined ? prod.stock : 10;
            
            if(prod.descuento && prod.descuento > 0) {
                prod.precioOriginal = prod.precio; 
                prod.precio = prod.precio * (1 - (prod.descuento / 100)); 
                if(prod.stock > 0) listaOfertas.push(prod);
            }

            if(prod.stock > 0) window.productosPublicos.push(prod);
        });

        renderizarCatalogo(window.productosPublicos);
        renderizarOfertas(listaOfertas); 
    } catch (error) { console.error(error); }
}

function generarHtmlTarjetaProducto(prod) {
    const imgPortada = prod.imagenes.length > 0 ? prod.imagenes[0] : 'https://via.placeholder.com/300';
    let imgHTML = imgPortada.startsWith('http') 
        ? `<img src="${imgPortada}" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">` 
        : `<div class="w-full h-full flex items-center justify-center bg-gray-100 text-4xl sm:text-6xl text-gray-300"><i class="${imgPortada}"></i></div>`;
        
    let precioHTML = `<span class="text-base sm:text-2xl font-black text-gray-800">$${prod.precio.toFixed(2)}</span>`;
    let badgeHTML = '';

    if(prod.descuento && prod.descuento > 0) {
        badgeHTML = `<div class="absolute top-2 left-2 bg-red-500 text-white text-[10px] sm:text-xs font-black px-2 py-1 rounded-md shadow-md z-10">-${prod.descuento}%</div>`;
        precioHTML = `
            <div class="flex flex-col">
                <span class="text-[10px] sm:text-xs text-gray-400 line-through leading-none mb-0.5">$${prod.precioOriginal.toFixed(2)}</span>
                <span class="text-base sm:text-2xl font-black text-brand-orange leading-none">$${prod.precio.toFixed(2)}</span>
            </div>
        `;
    }

    // INTELIGENCIA DE COLOR: Etiqueta pequeña (solo rosada si implica niñas)
    const catNom = (prod.categoria || "").toLowerCase();
    const subCatNom = (prod.subcategoria || "").toLowerCase();
    const esNina = catNom.includes('niña') || subCatNom.includes('niña');
    const colorBadgeCat = esNina ? 'bg-pink-50 text-brand-pink' : 'bg-blue-50 text-brand-blue';

    return `
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group cursor-pointer flex flex-col transition-all hover:shadow-md relative" onclick="abrirModalDetalle('${prod.id}')">
            ${badgeHTML}
            <div class="relative w-full aspect-square bg-gray-50 flex items-center justify-center p-2 overflow-hidden">
                ${imgHTML}
                <div class="absolute inset-0 bg-black bg-opacity-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                    <span class="bg-white text-gray-800 font-bold py-1.5 px-3 sm:py-2 sm:px-4 rounded-full shadow-lg flex items-center gap-1 sm:gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all text-xs sm:text-base">
                        <i class="ph ph-eye sm:text-xl"></i> <span class="hidden sm:inline">Ver Detalle</span>
                    </span>
                </div>
            </div>
            <div class="p-3 sm:p-5 flex flex-col flex-grow z-10">
                <span class="text-[10px] sm:text-xs font-bold ${colorBadgeCat} px-2 py-0.5 rounded w-max uppercase tracking-wider mb-2 truncate">${prod.categoria}</span>
                <h3 class="text-sm sm:text-lg font-semibold text-gray-800 mb-1 sm:mb-2 line-clamp-2 leading-tight">${prod.nombre}</h3>
                <div class="mt-auto flex items-center justify-between">
                    ${precioHTML}
                    <button class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-brand-orange hover:text-white transition-colors flex-shrink-0" onclick="event.stopPropagation(); agregarAlCarritoGlobal('${prod.id}', 1);">
                        <i class="ph ph-shopping-cart text-lg sm:text-xl font-bold"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderizarCatalogo(productosAMostrar) {
    const contenedor = document.getElementById('public-products'); 
    if (productosAMostrar.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-12 flex flex-col items-center justify-center text-gray-400"><i class="ph-duotone ph-package text-6xl mb-4 text-gray-300"></i><p class="text-lg">No encontramos productos en esta categoría.</p><button onclick="limpiarFiltros()" class="mt-4 text-brand-blue font-bold hover:underline">Ver todo el catálogo</button></div>`; 
        return;
    }
    let htmlTemporal = '';
    productosAMostrar.forEach(prod => { htmlTemporal += generarHtmlTarjetaProducto(prod); });
    contenedor.innerHTML = htmlTemporal;
}

function renderizarOfertas(listaOfertas) {
    const seccionOfertas = document.getElementById('ofertas');
    const contenedorOfertas = document.getElementById('public-ofertas');
    
    if (listaOfertas.length === 0) {
        seccionOfertas.classList.add('hidden');
        return;
    }

    seccionOfertas.classList.remove('hidden');
    let htmlTemporal = '';
    listaOfertas.forEach(prod => { htmlTemporal += generarHtmlTarjetaProducto(prod); });
    contenedorOfertas.innerHTML = htmlTemporal;
}

// Función para generar los botones de subcategoría
window.filtrarPorCategoria = (categoriaNombre) => {
    const filtrados = window.productosPublicos.filter(p => p.categoria === categoriaNombre);
    const tituloSeccion = document.getElementById('titulo-catalogo');
    
    // Validar color
    const esNina = categoriaNombre.toLowerCase().includes('niña');
    const colorTitulo = esNina ? 'text-brand-pink' : 'text-brand-blue';

    if (tituloSeccion) {
        tituloSeccion.innerHTML = `Categoría: <span class="${colorTitulo}">${categoriaNombre}</span> <button onclick="limpiarFiltros()" class="ml-4 align-middle text-sm bg-gray-100 border border-gray-200 text-gray-600 px-4 py-1.5 rounded-full hover:bg-gray-200 transition-colors shadow-sm inline-flex items-center gap-1"><i class="ph ph-x"></i> Ver todo</button>`;
    }
    
    renderizarCatalogo(filtrados);

    // LÓGICA DE BOTONES RÁPIDOS DE SUBCATEGORÍA
    const contenedorSub = document.getElementById('filtros-subcategorias');
    const catObj = window.categoriasPublicas.find(c => c.nombre === categoriaNombre);
    
    if (contenedorSub && catObj && catObj.subcategorias && catObj.subcategorias.length > 0) {
        let subHtml = `<button onclick="filtrarPorCategoria('${categoriaNombre}')" class="px-4 py-2 rounded-full text-sm font-bold bg-gray-800 text-white shadow-sm transition-colors">Ver Todo</button>`;
        
        catObj.subcategorias.forEach(sub => {
            const esSubNina = sub.toLowerCase().includes('niña') || esNina;
            const hoverColor = esSubNina ? 'hover:bg-brand-pink hover:border-brand-pink' : 'hover:bg-brand-blue hover:border-brand-blue';
            
            subHtml += `<button onclick="filtrarPorSubcategoria('${categoriaNombre}', '${sub}')" class="px-4 py-2 rounded-full text-sm font-medium border bg-white text-gray-600 border-gray-200 ${hoverColor} hover:text-white transition-colors shadow-sm">${sub}</button>`;
        });
        
        contenedorSub.innerHTML = subHtml;
        contenedorSub.classList.remove('hidden');
    } else if(contenedorSub) {
        contenedorSub.classList.add('hidden');
        contenedorSub.innerHTML = '';
    }
};

window.filtrarPorSubcategoria = (categoriaNombre, subcategoriaNombre) => {
    const filtrados = window.productosPublicos.filter(p => p.categoria === categoriaNombre && p.subcategoria === subcategoriaNombre);
    renderizarCatalogo(filtrados);

    // Actualizar el estado visual de los botones
    const contenedorSub = document.getElementById('filtros-subcategorias');
    if (contenedorSub) {
        const botones = contenedorSub.querySelectorAll('button');
        const esNina = categoriaNombre.toLowerCase().includes('niña') || subcategoriaNombre.toLowerCase().includes('niña');
        const colorActivo = esNina ? 'bg-brand-pink' : 'bg-brand-blue';

        botones.forEach(btn => {
            if (btn.innerText === subcategoriaNombre) {
                // Botón Seleccionado
                btn.className = `px-4 py-2 rounded-full text-sm font-bold ${colorActivo} text-white shadow-sm transition-colors`;
            } else if (btn.innerText === 'Ver Todo') {
                // Botón "Ver Todo" apagado
                btn.className = `px-4 py-2 rounded-full text-sm font-medium border bg-white text-gray-600 border-gray-200 hover:bg-gray-100 transition-colors shadow-sm`;
            } else {
                // Otros botones apagados
                const esSubNina = btn.innerText.toLowerCase().includes('niña') || esNina;
                const hoverColor = esSubNina ? 'hover:bg-brand-pink hover:border-brand-pink' : 'hover:bg-brand-blue hover:border-brand-blue';
                btn.className = `px-4 py-2 rounded-full text-sm font-medium border bg-white text-gray-600 border-gray-200 ${hoverColor} hover:text-white transition-colors shadow-sm`;
            }
        });
    }
};

window.limpiarFiltros = () => {
    const tituloSeccion = document.getElementById('titulo-catalogo');
    if (tituloSeccion) tituloSeccion.innerHTML = `Lo Más <span class="text-brand-orange">Nuevo</span>`;
    
    // Ocultar botones de subcategoría al limpiar
    const contenedorSub = document.getElementById('filtros-subcategorias');
    if(contenedorSub) {
        contenedorSub.classList.add('hidden');
        contenedorSub.innerHTML = '';
    }

    renderizarCatalogo(window.productosPublicos);
};

// ==========================================
// MÓDULO: SLIDER DINÁMICO (HERO)
// ==========================================
window.diapositivasHero = [];
let slideIndexActual = 0;
let heroSliderInterval = null;

function iniciarSliderHero() {
    const container = document.getElementById('hero-slider-container');
    if (!container) return;

    window.diapositivasHero = [];

    promocionesPublicas.forEach(promo => {
        const prod = window.productosPublicos.find(p => p.id === promo.productoOfertaId);
        if (prod && prod.imagenes && prod.imagenes.length > 0) {
            window.diapositivasHero.push({
                id: prod.id,
                tipo: 'promo',
                etiqueta: '🎁 ' + promo.nombre,
                titulo: prod.nombre,
                descripcion: `¡Oferta Especial! Aprovecha un ${promo.porcentajeDescuento}% de descuento cumpliendo las condiciones de compra.`,
                imagen: prod.imagenes[0]
            });
        }
    });

    const subcategoriasVistas = new Set();
    const productosInvertidos = [...window.productosPublicos].reverse(); 
    
    productosInvertidos.forEach(prod => {
        const subcat = prod.subcategoria || 'General';
        if (!subcategoriasVistas.has(subcat) && prod.imagenes && prod.imagenes.length > 0) {
            subcategoriasVistas.add(subcat);
            window.diapositivasHero.push({
                id: prod.id,
                tipo: 'producto',
                etiqueta: `🌟 Colección ${prod.categoria}`,
                titulo: prod.nombre,
                descripcion: `Descubre nuestra variedad en la sección de ${subcat}. ¡Calidad garantizada para los consentidos de la casa!`,
                imagen: prod.imagenes[0]
            });
        }
    });

    if (window.diapositivasHero.length === 0) return;

    dibujarSlideHero();
    if(heroSliderInterval) clearInterval(heroSliderInterval);
    heroSliderInterval = setInterval(siguienteSlideHero, 5000); 
}

function dibujarSlideHero() {
    const container = document.getElementById('hero-slider-container');
    if (!container || window.diapositivasHero.length === 0) return;

    const slide = window.diapositivasHero[slideIndexActual];
    
    // INTELIGENCIA DE COLOR:
    let colorEtiqueta = 'bg-white text-brand-blue';
    if(slide.tipo === 'promo') {
        colorEtiqueta = 'bg-brand-orange text-white';
    } else if (slide.etiqueta.toLowerCase().includes('niña') || slide.descripcion.toLowerCase().includes('niña')) {
        colorEtiqueta = 'bg-brand-pink text-white';
    }

    // NUEVO: Actualizar la "sombra" de color dinámica (Glow)
    const heroGlow = document.getElementById('hero-glow');
    if (heroGlow) {
        heroGlow.style.backgroundImage = `url('${slide.imagen}')`;
    }

    // AQUI SE APLICÓ LA SOLUCIÓN DEL HEIGHT COLLAPSE (Cambiamos absolute inset-0 por relative)
    container.innerHTML = `
        <div class="relative w-full h-full cursor-pointer group animate-fade-in bg-white flex items-center justify-center" onclick="abrirModalDetalle('${slide.id}')">
            <img src="${slide.imagen}" class="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-700">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent opacity-90 pointer-events-none"></div>
            <div class="absolute bottom-0 left-0 right-0 p-5 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300 z-10">
                <span class="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2 shadow-sm ${colorEtiqueta}">
                    ${slide.etiqueta}
                </span>
                <h3 class="text-white font-bold text-lg sm:text-xl leading-tight line-clamp-2 drop-shadow-md mb-1">${slide.titulo}</h3>
                <p class="text-gray-200 text-xs sm:text-sm font-medium drop-shadow-md line-clamp-2">${slide.descripcion}</p>
            </div>
        </div>
    `;
}

function siguienteSlideHero() {
    slideIndexActual++;
    if (slideIndexActual >= window.diapositivasHero.length) slideIndexActual = 0;
    dibujarSlideHero();
}

// ==========================================
// LÓGICA DEL MODAL DE DETALLES Y LIGHTBOX
// ==========================================

function setupLightbox() {
    const modalLightbox = document.getElementById('modal-lightbox');
    const btnCerrarLightbox = document.getElementById('btn-cerrar-lightbox');

    if(btnCerrarLightbox) {
        btnCerrarLightbox.addEventListener('click', () => modalLightbox.classList.add('hidden'));
    }
    if(modalLightbox) {
        modalLightbox.addEventListener('click', (e) => {
            if(e.target === modalLightbox) modalLightbox.classList.add('hidden');
        });
    }
}

function setupModalDetalle() {
    const modal = document.getElementById('modal-detalle-producto');
    const btnCerrar = document.getElementById('btn-cerrar-detalle');
    const btnRestar = document.getElementById('btn-restar-qty');
    const btnSumar = document.getElementById('btn-sumar-qty');
    const inputQty = document.getElementById('detalle-qty');
    const btnAgregar = document.getElementById('btn-agregar-carrito');
    const imgContainerZoom = document.querySelector('.cursor-zoom-in');
    
    let currentProductId = null; 

    if (imgContainerZoom) {
        imgContainerZoom.addEventListener('click', () => {
            const src = document.getElementById('detalle-img-principal').src;
            if(src) {
                document.getElementById('lightbox-img').src = src;
                document.getElementById('modal-lightbox').classList.remove('hidden');
            }
        });
    }

    if(btnCerrar) btnCerrar.addEventListener('click', () => modal.classList.add('hidden'));

    if(btnRestar && btnSumar && inputQty) {
        btnRestar.addEventListener('click', () => { let val = parseInt(inputQty.value); if(val > 1) inputQty.value = val - 1; });
        btnSumar.addEventListener('click', () => {
            if(!currentProductId) return;
            const prod = window.productosPublicos.find(p => p.id === currentProductId);
            let val = parseInt(inputQty.value);
            if(prod && val < prod.stock) inputQty.value = val + 1;
            else alert(`¡Lo sentimos! Solo tenemos ${prod.stock} unidades en stock.`);
        });
    }

    if(btnAgregar) {
        btnAgregar.addEventListener('click', () => {
            if(!currentProductId) return;
            const cantidad = parseInt(inputQty.value);
            agregarAlCarritoGlobal(currentProductId, cantidad);
            modal.classList.add('hidden'); 
        });
    }

    window.abrirModalDetalle = (id) => {
        const idReal = id.replace('_promo', '');
        const prod = window.productosPublicos.find(p => p.id === idReal); 
        if(!prod) return;
        currentProductId = prod.id; 

        // INTELIGENCIA DE COLOR
        const esNina = (prod.categoria && prod.categoria.toLowerCase().includes('niña')) || (prod.subcategoria && prod.subcategoria.toLowerCase().includes('niña'));
        const colorCat = esNina ? 'bg-pink-50 text-brand-pink' : 'bg-blue-50 text-brand-blue';

        document.getElementById('detalle-categoria').textContent = prod.categoria;
        document.getElementById('detalle-categoria').className = `inline-block px-3 py-1 ${colorCat} font-bold text-xs rounded-full uppercase tracking-wider w-max`;
        
        document.getElementById('detalle-subcategoria').textContent = prod.subcategoria || '';
        document.getElementById('detalle-nombre').textContent = prod.nombre;
        
        if(prod.descuento && prod.descuento > 0) {
            document.getElementById('detalle-precio').innerHTML = `<span class="text-gray-400 line-through text-xl mr-2">$${prod.precioOriginal.toFixed(2)}</span><span class="text-brand-orange">$${prod.precio.toFixed(2)}</span>`;
        } else {
            document.getElementById('detalle-precio').innerHTML = `<span class="text-gray-800">$${prod.precio.toFixed(2)}</span>`;
        }
        
        document.getElementById('detalle-precio-bs').textContent = formatearMoneda(prod.precio, 'VES');
        document.getElementById('detalle-descripcion').textContent = prod.descripcion || 'Este producto no tiene una descripción detallada.';
        
        const badge = document.getElementById('detalle-stock-badge');
        if(prod.stock > 5) { badge.className = "text-sm font-medium text-green-500 bg-green-50 px-2 py-1 rounded-lg flex items-center gap-1 w-max"; badge.innerHTML = `<i class="ph-fill ph-check-circle"></i> En stock (${prod.stock})`; } 
        else { badge.className = "text-sm font-medium text-orange-500 bg-orange-50 px-2 py-1 rounded-lg flex items-center gap-1 w-max"; badge.innerHTML = `<i class="ph-fill ph-warning-circle"></i> ¡Últimas ${prod.stock} unidades!`; }

        inputQty.value = 1;
        const imgPrincipal = document.getElementById('detalle-img-principal'); const contMiniaturas = document.getElementById('detalle-miniaturas');
        imgPrincipal.src = ''; contMiniaturas.innerHTML = '';

        if(prod.imagenes && prod.imagenes.length > 0 && prod.imagenes[0].startsWith('http')) {
            imgPrincipal.src = prod.imagenes[0];
            if(prod.imagenes.length > 1) {
                let mHtml = '';
                prod.imagenes.forEach((url, index) => {
                    const borderClass = index === 0 ? 'border-brand-blue' : 'border-transparent';
                    mHtml += `<button onclick="cambiarImagenPrincipal(this, '${url}')" class="miniatura-btn flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${borderClass} transition-colors p-1 bg-white"><img src="${url}" class="w-full h-full object-contain"></button>`;
                });
                contMiniaturas.innerHTML = mHtml;
            }
        }
        
        if(window.cerrarPanelCarrito) window.cerrarPanelCarrito();
        modal.classList.remove('hidden');
    };

    window.cambiarImagenPrincipal = (btn, url) => {
        document.getElementById('detalle-img-principal').src = url;
        document.querySelectorAll('.miniatura-btn').forEach(b => { b.classList.remove('border-brand-blue'); b.classList.add('border-transparent'); });
        btn.classList.remove('border-transparent'); btn.classList.add('border-brand-blue');
    };
}

// ==========================================
// MÓDULO: CARRITO DE COMPRAS Y PROMOCIONES
// ==========================================

function cargarCarritoLocal() {
    const guardado = localStorage.getItem('ds_carrito');
    if(guardado) { try { carritoCompras = JSON.parse(guardado); } catch (e) { carritoCompras = []; } }
    renderizarCarrito();
}

function guardarCarritoLocal() {
    localStorage.setItem('ds_carrito', JSON.stringify(carritoCompras));
    localStorage.setItem('ds_carrito_time', Date.now().toString()); // NUEVO: Guardamos el reloj
    renderizarCarrito();
}

// NUEVO: Estrategia de Carrito Abandonado
function verificarCarritoAbandonado() {
    const guardado = localStorage.getItem('ds_carrito');
    const tiempoStr = localStorage.getItem('ds_carrito_time');
    
    if (guardado && tiempoStr) {
        try {
            const items = JSON.parse(guardado);
            if (items.length > 0) {
                const tiempoAnterior = parseInt(tiempoStr);
                const ahora = Date.now();
                const diferenciaHoras = (ahora - tiempoAnterior) / (1000 * 60 * 60);
                
                // Si ha pasado más de 30 minutos (0.5 horas) y menos de 72 horas (3 días)
                if (diferenciaHoras >= 0.5 && diferenciaHoras <= 72) {
                    mostrarToastCarritoAbandonado();
                }
            }
        } catch (e) { console.error("Error al leer carrito para abandono"); }
    }
}

function mostrarToastCarritoAbandonado() {
    const toast = document.getElementById('toast-carrito-abandonado');
    if(!toast) return;
    
    // Mostramos el mensaje 3 segundos después de que el usuario entra a la web
    setTimeout(() => {
        toast.classList.remove('hidden');
        setTimeout(() => {
            toast.classList.remove('translate-y-full', 'opacity-0');
        }, 50);
    }, 3000);

    const btnCerrar = document.getElementById('btn-cerrar-toast-carrito');
    const btnRecuperar = document.getElementById('btn-recuperar-carrito');

    const ocultarToast = () => {
        toast.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => toast.classList.add('hidden'), 500);
        // Reseteamos el reloj para no volver a molestarlo hoy
        localStorage.setItem('ds_carrito_time', Date.now().toString());
    };

    if(btnCerrar) btnCerrar.onclick = ocultarToast;
    if(btnRecuperar) btnRecuperar.onclick = () => {
        ocultarToast();
        document.getElementById('cart-sidebar').classList.remove('translate-x-full');
        document.getElementById('cart-overlay').classList.remove('hidden');
    };
}

window.agregarPromoAlCarrito = (idProductoOriginal, precioPromo) => {
    const productoBase = window.productosPublicos.find(p => p.id === idProductoOriginal);
    if(!productoBase) return;

    const idPromoUnico = productoBase.id + '_promo';
    const itemExistente = carritoCompras.find(item => item.id === idPromoUnico);
    
    if (itemExistente) {
        alert("Ya agregaste esta oferta a tu carrito."); return;
    }
    
    carritoCompras.push({
        id: idPromoUnico, 
        productoOriginalId: productoBase.id, 
        nombre: `🌟 Promoción: ${productoBase.nombre}`,
        precio: precioPromo,
        imagen: productoBase.imagenes.length > 0 ? productoBase.imagenes[0] : 'https://via.placeholder.com/150',
        stockMaximo: productoBase.stock, 
        cantidad: 1 
    });

    guardarCarritoLocal();
};

window.agregarAlCarritoGlobal = (idProducto, cantidadAgregada) => {
    const productoBase = window.productosPublicos.find(p => p.id === idProducto);
    if(!productoBase) return;

    const itemExistente = carritoCompras.find(item => item.id === idProducto);
    if (itemExistente) {
        if(itemExistente.cantidad + cantidadAgregada > productoBase.stock) { alert(`No puedes añadir más. Solo tenemos ${productoBase.stock} unidades.`); return; }
        itemExistente.cantidad += cantidadAgregada;
    } else {
        if(cantidadAgregada > productoBase.stock) { alert(`Stock insuficiente. Solo quedan ${productoBase.stock} unidades.`); return; }
        carritoCompras.push({
            id: productoBase.id, 
            productoOriginalId: productoBase.id,
            nombre: productoBase.nombre, precio: productoBase.precio,
            imagen: productoBase.imagenes.length > 0 ? productoBase.imagenes[0] : 'https://via.placeholder.com/150',
            stockMaximo: productoBase.stock, cantidad: cantidadAgregada
        });
    }
    guardarCarritoLocal();
    
    const sidebarCart = document.getElementById('cart-sidebar');
    const overlayCart = document.getElementById('cart-overlay');
    if(sidebarCart.classList.contains('translate-x-full')) {
        sidebarCart.classList.remove('translate-x-full');
        overlayCart.classList.remove('hidden');
    }
};

window.modificarCantidadCarrito = (idProducto, delta) => {
    const item = carritoCompras.find(i => i.id === idProducto);
    if(!item) return;

    if(idProducto.includes('_promo') && delta > 0) {
        alert("Las ofertas promocionales están limitadas a 1 unidad por compra."); return;
    }

    const nuevaCantidad = item.cantidad + delta;
    if(nuevaCantidad <= 0) { eliminarDelCarrito(idProducto); return; }
    if(nuevaCantidad > item.stockMaximo) { alert("Haz alcanzado el límite de stock para este producto."); return; }
    item.cantidad = nuevaCantidad; guardarCarritoLocal();
};

window.eliminarDelCarrito = (idProducto) => {
    carritoCompras = carritoCompras.filter(item => item.id !== idProducto);
    guardarCarritoLocal();
};

function renderizarCarrito() {
    const contenedor = document.getElementById('cart-items-container');
    const badge = document.getElementById('cart-count');
    const txtTotal = document.getElementById('cart-total');
    const txtTotalBs = document.getElementById('cart-total-bs'); 
    const btnPago = document.getElementById('btn-procesar-pago');

    let totalItems = 0; subtotalGlobal = 0; 

    if (carritoCompras.length === 0) {
        contenedor.innerHTML = `<div class="text-center text-gray-400 mt-10"><i class="ph-duotone ph-shopping-bag text-6xl mb-3 text-gray-300"></i><p>Tu carrito está vacío</p><button id="btn-seguir-vacio" class="mt-4 text-brand-blue font-bold hover:underline">Ir a comprar</button></div>`;
        badge.textContent = '0'; badge.classList.add('hidden');
        txtTotal.textContent = '$0.00'; if(txtTotalBs) txtTotalBs.textContent = 'Bs. 0.00'; btnPago.disabled = true;
        setTimeout(() => {
            const btnSeguir = document.getElementById('btn-seguir-vacio');
            if(btnSeguir) btnSeguir.addEventListener('click', () => { document.getElementById('cart-sidebar').classList.add('translate-x-full'); document.getElementById('cart-overlay').classList.add('hidden'); });
        }, 100);
        return;
    }

    let htmlTemporal = '';
    
    carritoCompras.forEach(item => {
        totalItems += item.cantidad; subtotalGlobal += (item.precio * item.cantidad);
        
        const estiloOferta = item.id.includes('_promo') ? 'border-brand-blue border-dashed bg-blue-50/50 border-2' : 'border-gray-100 bg-white border';
        const idReal = item.productoOriginalId || item.id; 
        
        htmlTemporal += `
        <div class="flex items-center gap-4 ${estiloOferta} p-3 rounded-xl shadow-sm relative">
            <img src="${item.imagen}" class="w-20 h-20 object-cover rounded-lg bg-gray-50 cursor-pointer hover:opacity-80 transition-opacity" onclick="abrirModalDetalle('${idReal}')" title="Ver detalles">
            <div class="flex-1">
                <h4 class="font-bold text-gray-800 text-sm line-clamp-2 leading-tight mb-1 cursor-pointer hover:text-brand-orange transition-colors" onclick="abrirModalDetalle('${idReal}')">${item.nombre}</h4>
                <p class="text-gray-800 font-bold">$${item.precio.toFixed(2)}</p>
                <div class="flex items-center gap-3 mt-2">
                    <div class="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <button onclick="modificarCantidadCarrito('${item.id}', -1)" class="px-2 py-1 text-gray-500 hover:text-brand-blue transition-colors"><i class="ph ph-minus"></i></button>
                        <span class="px-2 text-sm font-bold text-gray-800">${item.cantidad}</span>
                        <button onclick="modificarCantidadCarrito('${item.id}', 1)" class="px-2 py-1 text-gray-500 hover:text-brand-blue transition-colors"><i class="ph ph-plus"></i></button>
                    </div>
                </div>
            </div>
            <button onclick="eliminarDelCarrito('${item.id}')" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors p-1 bg-white rounded-full"><i class="ph-fill ph-trash text-lg"></i></button>
        </div>`;
    });

    let promoMostrada = false;
    promocionesPublicas.forEach(promo => {
        if (promoMostrada) return; 

        const prodOferta = window.productosPublicos.find(p => p.id === promo.productoOfertaId);
        if (!prodOferta) return;

        const idPromoUnico = prodOferta.id + '_promo';
        const yaEnCarrito = carritoCompras.find(item => item.id === idPromoUnico);

        if (!yaEnCarrito) {
            let itemsQueCumplen = 0;
            carritoCompras.forEach(item => {
                const prodBase = window.productosPublicos.find(p => p.id === (item.productoOriginalId || item.id));
                if (prodBase && (promo.categoriaCondicion === '' || prodBase.categoria === promo.categoriaCondicion)) {
                    itemsQueCumplen += item.cantidad;
                }
            });

            if (itemsQueCumplen >= promo.cantidadCondicion) {
                promoMostrada = true;
                const precioConDescuento = prodOferta.precio * (1 - (promo.porcentajeDescuento / 100));

                htmlTemporal += `
                    <div class="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-4 relative mb-2 shadow-sm">
                        <div class="flex items-start gap-2 mb-2">
                            <i class="ph-fill ph-check-circle text-green-500 text-lg mt-0.5"></i>
                            <div>
                                <p class="text-sm font-bold text-gray-800">¡Excelente! Tu compra califica para esta promoción.</p>
                                <p class="text-xs text-gray-500">${promo.nombre}</p>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-100 mt-3">
                            <img src="${prodOferta.imagenes[0]}" class="w-16 h-16 object-cover rounded-md border border-gray-100 cursor-pointer hover:opacity-80 transition-opacity" onclick="abrirModalDetalle('${prodOferta.id}')" title="Ver detalles">
                            <div class="flex-1">
                                <h4 class="font-bold text-gray-800 text-sm leading-tight line-clamp-2 cursor-pointer hover:text-brand-orange transition-colors" onclick="abrirModalDetalle('${prodOferta.id}')">${prodOferta.nombre}</h4>
                                <div class="flex items-baseline gap-2 mt-1">
                                    <span class="text-xs text-gray-400 line-through">$${prodOferta.precioOriginal ? prodOferta.precioOriginal.toFixed(2) : prodOferta.precio.toFixed(2)}</span>
                                    <span class="text-lg font-black text-brand-blue">$${precioConDescuento.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                        <button onclick="agregarPromoAlCarrito('${prodOferta.id}', ${precioConDescuento})" class="w-full mt-3 bg-gray-800 text-white font-bold text-sm py-2.5 rounded-lg hover:bg-gray-700 transition-colors shadow-sm flex justify-center items-center gap-2">
                            <i class="ph-bold ph-plus-circle"></i> Aprovechar Promoción
                        </button>
                    </div>
                `;
            }
        }
    });

    contenedor.innerHTML = htmlTemporal;

    badge.textContent = totalItems; badge.classList.remove('hidden');
    txtTotal.textContent = `$${subtotalGlobal.toFixed(2)}`;
    if(txtTotalBs) txtTotalBs.textContent = formatearMoneda(subtotalGlobal, 'VES');
    btnPago.disabled = false;
}

// ==========================================
// MÓDULO: CHECKOUT Y REDIRECCIÓN WA
// ==========================================

function setupCheckout() {
    const btnProcesar = document.getElementById('btn-procesar-pago');
    const modalCheckout = document.getElementById('modal-checkout');
    const btnCerrarCheckout = document.getElementById('btn-cerrar-checkout');
    const btnCancelarCheckout = document.getElementById('btn-cancelar-checkout');
    
    const selectMetodo = document.getElementById('checkout-metodo');
    const divInstrucciones = document.getElementById('div-instrucciones-pago');
    const divReferencia = document.getElementById('div-referencia');
    const inputReferencia = document.getElementById('checkout-referencia');
    const divComprobante = document.getElementById('div-comprobante');
    const inputComprobante = document.getElementById('checkout-comprobante');
    const textoComprobante = document.getElementById('texto-comprobante');
    
    const btnConfirmar = document.getElementById('btn-confirmar-pedido');
    const formCheckout = document.getElementById('form-checkout');

    if(btnProcesar) {
        btnProcesar.addEventListener('click', () => {
            if(!currentUser) {
                if(window.cerrarPanelCarrito) window.cerrarPanelCarrito();
                alert("🔒 Para continuar con el pago necesitamos que inicies sesión o registres tu cuenta. ¡Es rápido y muy fácil!");
                document.getElementById('login-mensaje-checkout').classList.remove('hidden');
                document.getElementById('modal-login').classList.remove('hidden');
                return;
            }
            if(window.cerrarPanelCarrito) window.cerrarPanelCarrito();
            
            selectMetodo.innerHTML = '<option value="">Selecciona cómo vas a pagar...</option>';
            metodosPagoPublicos.forEach(m => { selectMetodo.innerHTML += `<option value="${m.id}">${m.nombre}</option>`; });
            
            divInstrucciones.classList.add('hidden'); divReferencia.classList.add('hidden'); divComprobante.classList.add('hidden');
            
            document.getElementById('checkout-total').textContent = `$${subtotalGlobal.toFixed(2)}`;
            document.getElementById('checkout-total-bs').textContent = formatearMoneda(subtotalGlobal, 'VES');

            if(currentUserData && currentUserData.address) {
                document.getElementById('checkout-direccion').value = currentUserData.address;
            } else {
                document.getElementById('checkout-direccion').value = '';
            }
            
            modalCheckout.classList.remove('hidden');
        });
    }

    if(selectMetodo) {
        selectMetodo.addEventListener('change', (e) => {
            const metodoId = e.target.value;
            const metodo = metodosPagoPublicos.find(m => m.id === metodoId);
            
            divInstrucciones.classList.add('hidden'); divReferencia.classList.add('hidden'); divComprobante.classList.add('hidden');
            inputReferencia.required = false;

            if(!metodo) {
                document.getElementById('checkout-total').textContent = `$${subtotalGlobal.toFixed(2)}`;
                document.getElementById('checkout-total-bs').textContent = formatearMoneda(subtotalGlobal, 'VES');
                return;
            }

            let totalCalculado = subtotalGlobal;
            let badgeDescuento = '';
            if (metodo.descuento > 0) {
                totalCalculado = subtotalGlobal * (1 - (metodo.descuento / 100));
                badgeDescuento = ` <span class="text-sm bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold ml-2">-${metodo.descuento}% off</span>`;
            }

            document.getElementById('checkout-total').innerHTML = `$${totalCalculado.toFixed(2)} ${badgeDescuento}`;
            
            if (metodo.moneda === 'VES') document.getElementById('checkout-total-bs').textContent = formatearMoneda(totalCalculado, 'VES');
            else if (metodo.moneda === 'COP') document.getElementById('checkout-total-bs').textContent = formatearMoneda(totalCalculado, 'COP');
            else document.getElementById('checkout-total-bs').textContent = 'Pago en USD.';

            divInstrucciones.classList.remove('hidden');
            divInstrucciones.innerHTML = `<strong>Paso 1: Realiza el pago a estos datos:</strong><br>${metodo.instrucciones}`;

            if (metodo.requisitos === 'ambos') { divReferencia.classList.remove('hidden'); divComprobante.classList.remove('hidden'); inputReferencia.required = true; } 
            else if (metodo.requisitos === 'referencia') { divReferencia.classList.remove('hidden'); inputReferencia.required = true; }
        });
    }

    if (inputComprobante) {
        inputComprobante.addEventListener('change', async (event) => {
            const file = event.target.files[0]; if (!file) return;
            textoComprobante.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Subiendo...'; btnConfirmar.disabled = true; 
            try {
                const formData = new FormData(); formData.append('image', file);
                const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
                const data = await response.json();
                if (data.success) { urlComprobantePago = data.data.url; textoComprobante.innerHTML = '<i class="ph-fill ph-check-circle text-green-500"></i> Capture Cargado'; }
                else throw new Error("Error ImgBB");
            } catch (error) { textoComprobante.innerHTML = '<i class="ph-fill ph-warning-circle text-red-500"></i> Error (Img pesada)'; inputComprobante.value = ''; } 
            finally { btnConfirmar.disabled = false; }
        });
    }

    const cerrarCheckout = () => {
        modalCheckout.classList.add('hidden'); formCheckout.reset(); divInstrucciones.classList.add('hidden'); divReferencia.classList.add('hidden'); divComprobante.classList.add('hidden');
        inputReferencia.required = false; urlComprobantePago = ''; textoComprobante.innerHTML = 'Subir Capture';
    };
    if(btnCerrarCheckout) btnCerrarCheckout.addEventListener('click', cerrarCheckout);
    if(btnCancelarCheckout) btnCancelarCheckout.addEventListener('click', cerrarCheckout);

    if(btnConfirmar) {
        btnConfirmar.addEventListener('click', async () => {
            if(!formCheckout.checkValidity()) { formCheckout.reportValidity(); return; }

            const direccion = document.getElementById('checkout-direccion').value.trim();
            const metodoId = selectMetodo.value;
            const referencia = inputReferencia.value.trim();
            const metodoConfig = metodosPagoPublicos.find(m => m.id === metodoId);

            if (!metodoConfig) return alert("Selecciona un método de pago válido.");
            if (metodoConfig.requisitos === 'ambos' && urlComprobantePago === '') return alert("Debes subir la foto (capture) del pago.");

            const originalText = btnConfirmar.innerHTML;
            btnConfirmar.disabled = true; btnConfirmar.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Asegurando Inventario...';

            let totalFinalUSD = subtotalGlobal;
            if(metodoConfig.descuento > 0) totalFinalUSD = subtotalGlobal * (1 - (metodoConfig.descuento / 100));

            const orderData = {
                clienteId: currentUser.uid,
                clienteNombre: currentUserData ? currentUserData.name : 'Cliente',
                clienteEmail: currentUser.email,
                direccion: direccion,
                metodoPago: metodoConfig.nombre, 
                referencia: referencia || 'N/A',
                comprobanteUrl: urlComprobantePago, 
                productos: carritoCompras, 
                totalUSD: totalFinalUSD,
                monedaSecundaria: metodoConfig.moneda,
                totalSecundario: metodoConfig.moneda === 'VES' ? parseFloat((totalFinalUSD * configuracionTienda.tasaBcv).toFixed(2)) : (metodoConfig.moneda === 'COP' ? parseFloat((totalFinalUSD * configuracionTienda.tasaCop).toFixed(2)) : 0),
                estado: 'Pendiente',
                fecha: new Date().toISOString()
            };

            let nuevaOrderRefID = '';

            try {
                await runTransaction(db, async (transaction) => {
                    let productosActualizar = [];

                    for (const item of carritoCompras) {
                        const idRealBaseDB = item.productoOriginalId || item.id;
                        const prodRef = doc(db, "products", idRealBaseDB);
                        const prodSnap = await transaction.get(prodRef);

                        if (!prodSnap.exists()) {
                            throw new Error(`El producto "${item.nombre}" ya no está en la tienda.`);
                        }
                        
                        const stockActual = prodSnap.data().stock;
                        if (stockActual < item.cantidad) {
                            throw new Error(`¡Uy! Alguien más acaba de llevarse el último "${item.nombre}". Solo quedan ${stockActual} unidades.`);
                        }

                        productosActualizar.push({
                            ref: prodRef,
                            nuevoStock: stockActual - item.cantidad
                        });
                    }

                    for (const prod of productosActualizar) {
                        transaction.update(prod.ref, { stock: prod.nuevoStock });
                    }

                    const newOrderRef = doc(collection(db, "orders")); 
                    transaction.set(newOrderRef, orderData);
                    nuevaOrderRefID = newOrderRef.id; 
                });

                let mensajeWa = `¡Hola Detalles y Sorpresas! Acabo de registrar mi pedido en la web.\n\n`;
                mensajeWa += `*Orden:* #${nuevaOrderRefID.slice(-6).toUpperCase()}\n`;
                mensajeWa += `*Nombre:* ${orderData.clienteNombre}\n`;
                mensajeWa += `*Correo:* ${orderData.clienteEmail}\n`;
                mensajeWa += `*Total a pagar:* $${orderData.totalUSD.toFixed(2)} (${orderData.metodoPago})\n`;
                
                if (orderData.monedaSecundaria === 'VES' || orderData.monedaSecundaria === 'COP') {
                     const monedaSimbolo = orderData.monedaSecundaria === 'VES' ? 'Bs.' : '$ COP';
                     mensajeWa += `*Equivalente:* ${monedaSimbolo} ${orderData.totalSecundario.toFixed(2)}\n`;
                }
                
                if (orderData.referencia !== 'N/A') {
                     mensajeWa += `*Referencia:* ${orderData.referencia}\n`;
                }
                if (orderData.comprobanteUrl) {
                     mensajeWa += `*Comprobante adjunto en el sistema.*\n`;
                }
                
                mensajeWa += `\n*Dirección:* ${orderData.direccion}\n\nQuedo atento al envío. ¡Gracias!`;

                const encodedMensaje = encodeURIComponent(mensajeWa);
                const numeroWa = configuracionTienda.whatsapp ? configuracionTienda.whatsapp.replace(/\D/g,'') : '';

                carritoCompras = []; guardarCarritoLocal(); urlComprobantePago = '';
                
                if (numeroWa) {
                    alert("¡Gracias por tu compra! Tu pedido ha sido registrado con éxito. Presiona 'Aceptar' para ir a WhatsApp y confirmar tu envío.");
                    window.location.href = `https://wa.me/${numeroWa}?text=${encodedMensaje}`;
                } else {
                    alert("¡Gracias por tu compra! Tu pedido ha sido registrado con éxito.");
                    cerrarCheckout(); window.location.reload(); 
                }

            } catch (error) {
                console.error("Transacción abortada:", error); 
                alert(error.message || "Ocurrió un error al procesar tu pedido. Por favor revisa tu carrito.");
                btnConfirmar.disabled = false; btnConfirmar.innerHTML = originalText;
            }
        });
    }
}
