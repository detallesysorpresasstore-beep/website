import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Tu configuración web de Firebase
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
const auth = getAuth(app);
const db = getFirestore(app);

// Exportamos los servicios para poder usarlos en el resto de la aplicación
export { auth, db, signInWithEmailAndPassword, onAuthStateChanged, signOut };
