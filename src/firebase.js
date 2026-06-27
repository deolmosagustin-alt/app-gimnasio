import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Tu configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDSrc6PTYHEag4NKKJ_jwAOoUA0o2QTGS0",
  authDomain: "gymapp-1e2a1.firebaseapp.com",
  projectId: "gymapp-1e2a1",
  storageBucket: "gymapp-1e2a1.firebasestorage.app",
  messagingSenderId: "1027242959052",
  appId: "1:1027242959052:web:d4f1eb887e32a2d40a6269",
  measurementId: "G-SM0T7ZKXKC"
};

// Inicializamos Firebase
const app = initializeApp(firebaseConfig);

// Exportamos las herramientas para usarlas en App.jsx
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export { app };