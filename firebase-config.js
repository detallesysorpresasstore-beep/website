// firebase-config.js
// Configuración centralizada de Firebase para Detalles y Sorpresas STORE

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// TODO: Asegúrate de tener aquí tus credenciales reales
const firebaseConfig = {
  apiKey: "AIzaSyDs83zqJo_JkRgCrApVwMQR3MxjrtPYltI",
  authDomain: "detalles-y-sorpresas-store.firebaseapp.com",
  projectId: "detalles-y-sorpresas-store",
  storageBucket: "detalles-y-sorpresas-store.firebasestorage.app",
  messagingSenderId: "853458086140",
  appId: "1:853458086140:web:a7c422eef3b8de7ff84f79",
  measurementId: "G-M816B3BWMQ"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Exportamos todo lo que nuestra app necesita
export { auth, db, storage, signInWithEmailAndPassword, onAuthStateChanged, signOut };
