/**
 * Detalles y Sorpresas STORE - Archivo Principal JS (Tienda Pública, Auth, Carrito y Checkout)
 */

import { auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut } from './firebase-config.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const IMGBB_API_KEY = '6b8e2fe1e92a74135200cbf5317aa9bf';

let currentUser = null;
let currentUserData = null; 
window.productosPublicos = []; 
let carritoCompras = []; 
let subtotalGlobal = 0; 

// NUEVO: Variables para configuración de la tienda y comprobante de pago
let configuracionTienda = { tasaBcv: 1, pagoMovil: '', transferencia: '', zelle: '', binance: '' };
let urlComprobantePago = ''; 

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    setupMobileMenu();
    setupLoginModal();
    monitorAuthState();
    
    // 1. Cargar la configuración de la tienda PRIMERO (para tener la Tasa BCV lista)
    await cargarConfiguracionPublica();

    // 2. Cargar el resto de la tienda
    cargarCategoriasPublicas();
    cargarProductosPublicos();
    
    cargarCarritoLocal();
    setupModalDetalle();
    setupCheckout(); 
}

// ==========================================
// MÓDULO: CONFIGURACIÓN PÚBLICA (TASA Y BANCOS)
// ==========================================

async function cargarConfiguracionPublica() {
    try {
        const docSnap = await getDoc(doc(db, "config", "store_settings"));
        if (docSnap.exists()) {
            // Guardamos en memoria la tasa y los datos bancarios
            const data = docSnap.data();
            configuracionTienda = {
                tasaBcv: parseFloat(data.tasaBcv) || 1,
                pagoMovil: data.pagoMovil || 'Datos de Pago Móvil no disponibles.',
                transferencia: data.transferencia || 'Datos de Transferencia no disponibles.',
                zelle: data.zelle || 'Datos de Zelle no disponibles.',
                binance: data.binance || 'Datos de Binance no disponibles.'
            };
        }
    } catch (error) {
        console.error("Error al cargar configuración:", error);
    }
}

// Función auxiliar para formatear montos en Bs.
function formatearBs(montoUSD) {
    const montoBs = montoUSD * configuracionTienda.tasaBcv;
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(montoBs);
}

// ==========================================
// MÓDULO: MENÚ Y AUTENTICACIÓN
// ==========================================

function setupMobileMenu() {
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if(btn && menu) btn.addEventListener('click', () => menu.classList.toggle('hidden'));
}

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
            
            const userDoc = await getDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", user.uid));
            if(userDoc.exists()) currentUserData = userDoc.data();
        } else {
            currentUserData = null;
            if (btnLoginIcon) {
                btnLoginIcon.classList.remove('text-brand-orange', 'ph-fill');
                btnLoginIcon.classList.add('ph');
            }
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
    let isLoginMode = true;

    const abrirModal = async () => {
        if(currentUser) {
            const conf = confirm("Ya tienes una sesión iniciada. ¿Deseas cerrar sesión?");
            if(conf) { await signOut(auth); window.location.reload(); } 
            else { if(currentUserData && currentUserData.role === 'admin') window.location.href = 'admin.html'; }
            return;
        }
        document.getElementById('login-mensaje-checkout').classList.add('hidden'); 
        modal.classList.remove('hidden');
    };

    if(btnAbrir) btnAbrir.addEventListener('click', abrirModal);
    if(btnAbrirMovil) btnAbrirMovil.addEventListener('click', abrirModal);
    
    if(btnCerrar) {
        btnCerrar.addEventListener('click', () => {
            modal.classList.add('hidden'); form.reset();
            document.getElementById('login-error').classList.add('hidden');
            document.getElementById('login-success').classList.add('hidden');
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

            document.getElementById('login-error').classList.add('hidden');
            document.getElementById('login-success').classList.add('hidden');
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
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Procesando...';

            try {
                if (isLoginMode) {
                    await signInWithEmailAndPassword(auth, email, password);
                    loginSuccess.textContent = '¡Bienvenido de nuevo!'; loginSuccess.classList.remove('hidden');
                    setTimeout(async () => {
                        const userDoc = await getDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", auth.currentUser.uid));
                        if(userDoc.exists() && userDoc.data().role === 'admin') window.location.href = 'admin.html';
                        else { modal.classList.add('hidden'); window.location.reload(); }
                    }, 1000);
                } else {
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                    await setDoc(doc(db, "artifacts/detalles-y-sorpresas-store/public/data/users", userCredential.user.uid), {
                        name: name, email: email, phone: phone || '', role: 'client', createdAt: new Date().toISOString()
                    });
                    loginSuccess.textContent = '¡Cuenta creada con éxito!'; loginSuccess.classList.remove('hidden');
                    setTimeout(() => { modal.classList.add('hidden'); window.location.reload(); }, 1500);
                }
            } catch (error) {
                loginError.classList.remove('hidden'); loginError.textContent = 'Ocurrió un error. Verifica tus datos.';
            } finally {
                btnSubmit.disabled = false; btnSubmit.innerHTML = originalText;
            }
        });
    }
}

// ==========================================
// MÓDULO: TIENDA PÚBLICA (CATÁLOGO Y FILTROS)
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
                <a href="#destacados" onclick="filtrarPorCategoria('${cat.nombre}')" class="category-card block p-6 bg-white rounded-3xl transition-all duration-300 border border-gray-100 hover:border-brand-blue flex flex-col items-center justify-center">
                    <i class="${cat.icono} text-5xl mb-3 text-brand-blue"></i>
                    <h3 class="font-semibold text-gray-700">${cat.nombre}</h3>
                </a>
            `;
        });
    } catch (error) { console.error(error); }
}

async function cargarProductosPublicos() {
    const contenedor = document.getElementById('public-products');
    if (!contenedor) return;

    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        window.productosPublicos = []; 

        querySnapshot.forEach((docSnap) => {
            const prod = docSnap.data();
            prod.id = docSnap.id;
            prod.imagenes = prod.imagenes || (prod.imagen ? [prod.imagen] : []);
            prod.stock = prod.stock !== undefined ? prod.stock : 10;
            
            if(prod.stock > 0) window.productosPublicos.push(prod);
        });
        renderizarCatalogo(window.productosPublicos);
    } catch (error) { console.error(error); }
}

function renderizarCatalogo(productosAMostrar) {
    const contenedor = document.getElementById('public-products');
    contenedor.innerHTML = '';

    if (productosAMostrar.length === 0) {
        contenedor.innerHTML = `<div class="col-span-full py-12 flex flex-col items-center justify-center text-gray-400"><i class="ph-duotone ph-package text-6xl mb-4 text-gray-300"></i><p class="text-lg">No encontramos productos en esta categoría.</p><button onclick="limpiarFiltros()" class="mt-4 text-brand-blue font-bold hover:underline">Ver todo el catálogo</button></div>`;
        return;
    }

    productosAMostrar.forEach(prod => {
        const imgPortada = prod.imagenes.length > 0 ? prod.imagenes[0] : 'https://via.placeholder.com/300';
        let imgHTML = imgPortada.startsWith('http') ? `<img src="${imgPortada}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500">` : `<div class="w-full h-full flex items-center justify-center bg-gray-100 text-6xl text-gray-300"><i class="${imgPortada}"></i></div>`;

        contenedor.innerHTML += `
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group cursor-pointer flex flex-col" onclick="abrirModalDetalle('${prod.id}')">
                <div class="relative h-64 overflow-hidden bg-gray-50 flex items-center justify-center p-2">
                    ${imgHTML}
                    <div class="absolute inset-0 bg-black bg-opacity-20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span class="bg-white text-gray-800 font-bold py-2 px-4 rounded-full shadow-lg flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all"><i class="ph ph-eye text-xl"></i> Ver Detalle</span>
                    </div>
                </div>
                <div class="p-5 flex flex-col flex-grow">
                    <span class="text-xs font-bold text-brand-blue uppercase tracking-wider mb-1">${prod.categoria}</span>
                    <h3 class="text-lg font-semibold text-gray-800 mb-2 line-clamp-2">${prod.nombre}</h3>
                    <div class="mt-auto flex items-center justify-between">
                        <span class="text-2xl font-bold text-brand-pink">$${prod.precio.toFixed(2)}</span>
                        <button class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-brand-orange hover:text-white transition-colors" onclick="event.stopPropagation(); agregarAlCarritoGlobal('${prod.id}', 1);">
                            <i class="ph ph-shopping-cart text-xl font-bold"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
}

window.filtrarPorCategoria = (categoriaNombre) => {
    const filtrados = window.productosPublicos.filter(p => p.categoria === categoriaNombre);
    const tituloSeccion = document.querySelector('#destacados h2');
    if (tituloSeccion) {
        tituloSeccion.innerHTML = `Categoría: <span class="text-brand-pink">${categoriaNombre}</span> <button onclick="limpiarFiltros()" class="ml-4 align-middle text-sm bg-gray-100 border border-gray-200 text-gray-600 px-4 py-1.5 rounded-full hover:bg-gray-200 transition-colors shadow-sm inline-flex items-center gap-1"><i class="ph ph-x"></i> Ver todo</button>`;
    }
    renderizarCatalogo(filtrados);
};

window.limpiarFiltros = () => {
    const tituloSeccion = document.querySelector('#destacados h2');
    if (tituloSeccion) tituloSeccion.innerHTML = `Lo Más <span class="text-brand-pink">Nuevo</span>`;
    renderizarCatalogo(window.productosPublicos);
};

// ==========================================
// LÓGICA DEL MODAL DE DETALLES DEL PRODUCTO
// ==========================================

function setupModalDetalle() {
    const modal = document.getElementById('modal-detalle-producto');
    const btnCerrar = document.getElementById('btn-cerrar-detalle');
    const btnRestar = document.getElementById('btn-restar-qty');
    const btnSumar = document.getElementById('btn-sumar-qty');
    const inputQty = document.getElementById('detalle-qty');
    const btnAgregar = document.getElementById('btn-agregar-carrito');
    let currentProductId = null; 

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
        const prod = window.productosPublicos.find(p => p.id === id);
        if(!prod) return;
        currentProductId = prod.id; 

        document.getElementById('detalle-categoria').textContent = prod.categoria;
        document.getElementById('detalle-subcategoria').textContent = prod.subcategoria || '';
        document.getElementById('detalle-nombre').textContent = prod.nombre;
        
        // ACTUALIZADO: Precios Duales (USD y BS)
        document.getElementById('detalle-precio').textContent = `$${prod.precio.toFixed(2)}`;
        document.getElementById('detalle-precio-bs').textContent = formatearBs(prod.precio);
        
        document.getElementById('detalle-descripcion').textContent = prod.descripcion || 'Este producto no tiene una descripción detallada.';
        
        const badge = document.getElementById('detalle-stock-badge');
        if(prod.stock > 5) {
            badge.className = "text-sm font-medium text-green-500 bg-green-50 px-2 py-1 rounded-lg flex items-center gap-1 w-max";
            badge.innerHTML = `<i class="ph-fill ph-check-circle"></i> En stock (${prod.stock})`;
        } else {
            badge.className = "text-sm font-medium text-orange-500 bg-orange-50 px-2 py-1 rounded-lg flex items-center gap-1 w-max";
            badge.innerHTML = `<i class="ph-fill ph-warning-circle"></i> ¡Últimas ${prod.stock} unidades!`;
        }

        inputQty.value = 1;
        const imgPrincipal = document.getElementById('detalle-img-principal');
        const contMiniaturas = document.getElementById('detalle-miniaturas');
        imgPrincipal.src = '';
        contMiniaturas.innerHTML = '';

        if(prod.imagenes && prod.imagenes.length > 0 && prod.imagenes[0].startsWith('http')) {
            imgPrincipal.src = prod.imagenes[0];
            if(prod.imagenes.length > 1) {
                prod.imagenes.forEach((url, index) => {
                    const borderClass = index === 0 ? 'border-brand-blue' : 'border-transparent';
                    contMiniaturas.innerHTML += `<button onclick="cambiarImagenPrincipal(this, '${url}')" class="miniatura-btn flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${borderClass} transition-colors p-1 bg-white"><img src="${url}" class="w-full h-full object-contain"></button>`;
                });
            }
        }
        modal.classList.remove('hidden');
    };

    window.cambiarImagenPrincipal = (btn, url) => {
        document.getElementById('detalle-img-principal').src = url;
        document.querySelectorAll('.miniatura-btn').forEach(b => { b.classList.remove('border-brand-blue'); b.classList.add('border-transparent'); });
        btn.classList.remove('border-transparent'); btn.classList.add('border-brand-blue');
    };
}

// ==========================================
// MÓDULO: CARRITO DE COMPRAS
// ==========================================

function cargarCarritoLocal() {
    const guardado = localStorage.getItem('ds_carrito');
    if(guardado) { try { carritoCompras = JSON.parse(guardado); } catch (e) { carritoCompras = []; } }
    renderizarCarrito();
}

function guardarCarritoLocal() {
    localStorage.setItem('ds_carrito', JSON.stringify(carritoCompras));
    renderizarCarrito();
}

window.agregarAlCarritoGlobal = (idProducto, cantidadAgregada) => {
    const productoBase = window.productosPublicos.find(p => p.id === idProducto);
    if(!productoBase) return;

    const itemExistente = carritoCompras.find(item => item.id === idProducto);
    if (itemExistente) {
        if(itemExistente.cantidad + cantidadAgregada > productoBase.stock) { alert(`No puedes añadir más. Solo tenemos ${productoBase.stock} unidades en stock.`); return; }
        itemExistente.cantidad += cantidadAgregada;
    } else {
        if(cantidadAgregada > productoBase.stock) { alert(`Stock insuficiente. Solo quedan ${productoBase.stock} unidades.`); return; }
        carritoCompras.push({
            id: productoBase.id, nombre: productoBase.nombre, precio: productoBase.precio,
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
    const txtTotalBs = document.getElementById('cart-total-bs'); // NUEVO
    const btnPago = document.getElementById('btn-procesar-pago');

    let totalItems = 0;
    subtotalGlobal = 0; 

    if (carritoCompras.length === 0) {
        contenedor.innerHTML = `<div class="text-center text-gray-400 mt-10"><i class="ph-duotone ph-shopping-bag text-6xl mb-3 text-gray-300"></i><p>Tu carrito está vacío</p><button id="btn-seguir-vacio" class="mt-4 text-brand-blue font-bold hover:underline">Ir a comprar</button></div>`;
        badge.textContent = '0'; badge.classList.add('hidden');
        txtTotal.textContent = '$0.00';
        if(txtTotalBs) txtTotalBs.textContent = 'Bs. 0.00';
        btnPago.disabled = true;
        setTimeout(() => {
            const btnSeguir = document.getElementById('btn-seguir-vacio');
            if(btnSeguir) btnSeguir.addEventListener('click', () => { document.getElementById('cart-sidebar').classList.add('translate-x-full'); document.getElementById('cart-overlay').classList.add('hidden'); });
        }, 100);
        return;
    }

    contenedor.innerHTML = '';
    carritoCompras.forEach(item => {
        totalItems += item.cantidad;
        subtotalGlobal += (item.precio * item.cantidad);
        
        contenedor.innerHTML += `<div class="flex items-center gap-4 bg-white border border-gray-100 p-3 rounded-xl shadow-sm relative"><img src="${item.imagen}" class="w-20 h-20 object-cover rounded-lg bg-gray-50"><div class="flex-1"><h4 class="font-bold text-gray-800 text-sm line-clamp-2 leading-tight mb-1">${item.nombre}</h4><p class="text-brand-pink font-bold">$${item.precio.toFixed(2)}</p><div class="flex items-center gap-3 mt-2"><div class="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50"><button onclick="modificarCantidadCarrito('${item.id}', -1)" class="px-2 py-1 text-gray-500 hover:text-brand-blue transition-colors"><i class="ph ph-minus"></i></button><span class="px-2 text-sm font-bold text-gray-800">${item.cantidad}</span><button onclick="modificarCantidadCarrito('${item.id}', 1)" class="px-2 py-1 text-gray-500 hover:text-brand-blue transition-colors"><i class="ph ph-plus"></i></button></div></div></div><button onclick="eliminarDelCarrito('${item.id}')" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 transition-colors p-1 bg-white rounded-full"><i class="ph-fill ph-trash text-lg"></i></button></div>`;
    });

    badge.textContent = totalItems;
    badge.classList.remove('hidden');
    txtTotal.textContent = `$${subtotalGlobal.toFixed(2)}`;
    if(txtTotalBs) txtTotalBs.textContent = formatearBs(subtotalGlobal); // NUEVO: Total Carrito BS
    btnPago.disabled = false;
}

// ==========================================
// MÓDULO: CHECKOUT Y PROCESAMIENTO DE PAGO
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

    // 1. Proceder al Pago
    if(btnProcesar) {
        btnProcesar.addEventListener('click', () => {
            if(!currentUser) {
                if(window.cerrarPanelCarrito) window.cerrarPanelCarrito();
                document.getElementById('login-mensaje-checkout').classList.remove('hidden');
                document.getElementById('modal-login').classList.remove('hidden');
                return;
            }
            if(window.cerrarPanelCarrito) window.cerrarPanelCarrito();
            
            // Llenar totales en el Checkout
            document.getElementById('checkout-total').textContent = `$${subtotalGlobal.toFixed(2)}`;
            document.getElementById('checkout-total-bs').textContent = formatearBs(subtotalGlobal);
            
            modalCheckout.classList.remove('hidden');
        });
    }

    // 2. Dinamismo del Método de Pago y las Instrucciones
    if(selectMetodo) {
        selectMetodo.addEventListener('change', (e) => {
            const metodo = e.target.value;
            
            // Ocultar por defecto
            divInstrucciones.classList.add('hidden');
            divReferencia.classList.add('hidden');
            divComprobante.classList.add('hidden');
            inputReferencia.required = false;

            if(metodo === 'Efectivo' || metodo === '') return;

            // Mostrar instrucciones según el banco
            divInstrucciones.classList.remove('hidden');
            if(metodo === 'Pago Móvil') divInstrucciones.innerHTML = `<strong>Datos de Pago Móvil:</strong><br>${configuracionTienda.pagoMovil}`;
            if(metodo === 'Transferencia Bancaria') divInstrucciones.innerHTML = `<strong>Datos de Transferencia:</strong><br>${configuracionTienda.transferencia}`;
            if(metodo === 'Zelle') divInstrucciones.innerHTML = `<strong>Datos de Zelle:</strong><br>${configuracionTienda.zelle}`;
            if(metodo === 'Binance') divInstrucciones.innerHTML = `<strong>Datos de Binance:</strong><br>${configuracionTienda.binance}`;

            // Mostrar campos obligatorios para pagos electrónicos
            divReferencia.classList.remove('hidden');
            divComprobante.classList.remove('hidden');
            inputReferencia.required = true;
        });
    }

    // 3. Subir el Comprobante (Capture) con ImgBB
    if (inputComprobante) {
        inputComprobante.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            textoComprobante.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Subiendo...';
            btnConfirmar.disabled = true; // Deshabilita el botón de pago mientras sube

            try {
                const formData = new FormData();
                formData.append('image', file);
                
                const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                    method: 'POST', body: formData
                });
                const data = await response.json();
                
                if (data.success) {
                    urlComprobantePago = data.data.url; // Guardamos la URL pública
                    textoComprobante.innerHTML = '<i class="ph-fill ph-check-circle text-green-500"></i> Comprobante Cargado';
                }
            } catch (error) {
                console.error("Error al subir comprobante:", error);
                textoComprobante.innerHTML = '<i class="ph-fill ph-warning-circle text-red-500"></i> Error. Intenta de nuevo';
                inputComprobante.value = '';
            } finally {
                btnConfirmar.disabled = false;
            }
        });
    }

    // Cerrar Checkout
    const cerrarCheckout = () => {
        modalCheckout.classList.add('hidden');
        formCheckout.reset();
        divInstrucciones.classList.add('hidden');
        divReferencia.classList.add('hidden');
        divComprobante.classList.add('hidden');
        inputReferencia.required = false;
        urlComprobantePago = '';
        textoComprobante.innerHTML = 'Subir Capture';
    };
    if(btnCerrarCheckout) btnCerrarCheckout.addEventListener('click', cerrarCheckout);
    if(btnCancelarCheckout) btnCancelarCheckout.addEventListener('click', cerrarCheckout);

    // 4. CONFIRMAR PEDIDO Y GUARDAR EN FIRESTORE
    if(btnConfirmar) {
        btnConfirmar.addEventListener('click', async () => {
            if(!formCheckout.checkValidity()) { formCheckout.reportValidity(); return; }

            const direccion = document.getElementById('checkout-direccion').value.trim();
            const metodo = selectMetodo.value;
            const referencia = inputReferencia.value.trim();

            // Validación vital: Si es electrónico, debe tener el capture
            if (metodo !== 'Efectivo' && urlComprobantePago === '') {
                alert("Debes subir la foto (capture) de tu comprobante de pago para continuar.");
                return;
            }

            const originalText = btnConfirmar.innerHTML;
            btnConfirmar.disabled = true;
            btnConfirmar.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Registrando Compra...';

            try {
                // Crear documento de la Orden
                const orderData = {
                    clienteId: currentUser.uid,
                    clienteNombre: currentUserData ? currentUserData.name : 'Cliente',
                    clienteEmail: currentUser.email,
                    direccion: direccion,
                    metodoPago: metodo,
                    referencia: metodo === 'Efectivo' ? 'N/A' : referencia,
                    comprobanteUrl: urlComprobantePago, // Se guarda la foto o queda vacía si es efectivo
                    productos: carritoCompras, 
                    totalUSD: subtotalGlobal,
                    totalVES: parseFloat((subtotalGlobal * configuracionTienda.tasaBcv).toFixed(2)),
                    estado: 'Pendiente',
                    fecha: new Date().toISOString()
                };

                await addDoc(collection(db, "orders"), orderData);

                // Restar Stock de los productos vendidos
                for (const item of carritoCompras) {
                    const prodRef = doc(db, "products", item.id);
                    await updateDoc(prodRef, { stock: increment(-item.cantidad) });
                }

                // Limpiar Carrito Local y variables
                carritoCompras = [];
                guardarCarritoLocal();
                urlComprobantePago = '';

                // Éxito
                alert("¡Gracias por tu compra! Tu pedido ha sido registrado con éxito. Te contactaremos pronto para el envío.");
                cerrarCheckout();
                window.location.reload(); 

            } catch (error) {
                console.error("Error al procesar el pedido:", error);
                alert("Ocurrió un error al procesar tu pedido. Por favor intenta nuevamente.");
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = originalText;
            }
        });
    }
}
