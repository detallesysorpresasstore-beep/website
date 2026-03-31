// firebase-config.js
// Configuración centralizada de Firebase para Detalles y Sorpresas STORE

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 1. IMPORTACIÓN NUEVA: Módulo para gestión de archivos (Imágenes)
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// TODO: Reemplaza estos datos con la configuración real de tu proyecto de Firebase
const firebaseConfig = {
    apiKey: "TU_API_KEY_AQUÍ",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.firebasestorage.app", // Asegúrate que termine en .firebasestorage.app
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios y exportarlos
export const auth = getAuth(app);
export const db = getFirestore(app);

// 2. INICIALIZACIÓN Y EXPORTACIÓN NUEVA: Servicio de Storage
export const storage = getStorage(app);

// Re-exportar funciones útiles de Auth para no tener que importarlas en cada archivo
export { onAuthStateChanged, signOut };
