// Firebase (modular) via CDN imports (no bundler required)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics, isSupported as analyticsSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  collection,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

/**
 * Конфиг проекта Firebase.
 *
 * Переопределяется без правки кода — достаточно объявить window.TWISTX_FIREBASE
 * ДО подключения main.js (например, отдельным <script> перед ним):
 *
 *   <script>window.TWISTX_FIREBASE = { apiKey: "…", authDomain: "…", projectId: "…",
 *     storageBucket: "…", messagingSenderId: "…", appId: "…" };</script>
 *
 * Значения ниже — рабочий проект, унаследованный от предыдущей итерации сайта.
 * Если кабинет, скины и регистрация должны писаться в ваш собственный проект,
 * подставьте свои ключи (консоль Firebase → Project settings → Your apps).
 */
const DEFAULT_CONFIG = {
  apiKey: "AIzaSyCkYBnmE6fv__osymaDhPHVUjdg60e_aos",
  authDomain: "mypetrock-2b073.firebaseapp.com",
  projectId: "mypetrock-2b073",
  storageBucket: "mypetrock-2b073.firebasestorage.app",
  messagingSenderId: "229284276416",
  appId: "1:229284276416:web:13148d0ace35ce5afba525",
  measurementId: "G-NXYFFVH6LG",
};

const overrides = (typeof window !== "undefined" && window.TWISTX_FIREBASE) || {};
const firebaseConfig = Object.assign({}, DEFAULT_CONFIG, overrides);

/** true, только если Firebase реально инициализирован и готов к работе. */
export let fbReady = false;
/** Текст причины, если Firebase недоступен (показывается в интерфейсе). */
export let fbInitError = null;

export let fbApp = null;
export let fbAuth = null;
export let fbDb = null;
export let fbStorage = null;

try {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Не заполнены apiKey и projectId");
  }

  fbApp = initializeApp(firebaseConfig);
  fbAuth = getAuth(fbApp);
  fbDb = getFirestore(fbApp);
  fbStorage = getStorage(fbApp);
  fbReady = true;

  // Analytics необязательна и поддерживается не во всех окружениях.
  analyticsSupported()
    .then((ok) => {
      if (ok) getAnalytics(fbApp);
    })
    .catch(() => {});
} catch (error) {
  fbInitError = error && error.message ? error.message : "Firebase недоступен";
  // Кабинет и скины без Firebase не работают, но сам сайт должен остаться живым.
  console.warn("[TwistX] Firebase не инициализирован:", fbInitError);
}

export const fb = {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  // firestore
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  query,
  collection,
  orderBy,
  limit,
  getDocs,
  // storage
  ref,
  uploadBytes,
  getDownloadURL,
};
