/* Konfigurasi Web Firebase dari pemilik proyek sbooky-1.
   Backend, Authentication, Firestore dan Storage tetap perlu diaktifkan/dipasang.
   Panduan: PANDUAN-FIREBASE.md. Jangan masukkan private key di file ini. */
window.SBOOKY_CONFIG = {
  "mode": "firebase",
  "backend": "spark", // Auth + Firestore; tidak perlu Storage/Cloud Functions.
  "firebase": {
    "apiKey": "AIzaSyCl4RKFiS0UxRjYA-NZJID2y2l-asb2SCo",
    "authDomain": "sbooky-1.firebaseapp.com",
    "projectId": "sbooky-1",
    "storageBucket": "sbooky-1.firebasestorage.app",
    "messagingSenderId": "446735650508",
    "appId": "1:446735650508:web:fa0e6ca5195ef91b22fc69"
  },
  "functionsRegion": "asia-southeast2",
  "useEmulators": false
};
