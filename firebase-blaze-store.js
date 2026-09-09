(function (root) {
  "use strict";
  root.createBlazeStore = async function (config, onChange, onError) {
    const C = root.SbookyCore;
    C.assert(["apiKey", "authDomain", "projectId", "storageBucket", "appId"].every(key => config.firebase[key]),
      "Konfigurasi Firebase belum lengkap. Ikuti PANDUAN-FIREBASE.md.");
    C.assert(location.protocol !== "file:", "Mode Firebase perlu Live Server. Klik kanan index.html → Open with Live Server.");
    C.assert(root.SbookyFirebase, "Berkas firebase-sdk.js belum termuat. Upload semua file dari folder Sbooky ke GitHub, lalu muat ulang halaman.");
    const { appSDK, A, F, S, CF } = root.SbookyFirebase;
    const app = (appSDK.getApps().length ? appSDK.getApp() : appSDK.initializeApp(config.firebase)), auth = A.getAuth(app), db = F.getFirestore(app);
    const storage = S.getStorage(app), functions = CF.getFunctions(app, config.functionsRegion);
    if (config.useEmulators) {
      C.assert(["localhost", "127.0.0.1"].includes(location.hostname), "Emulator hanya boleh dipakai di localhost.");
      A.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      F.connectFirestoreEmulator(db, "127.0.0.1", 8080);
      S.connectStorageEmulator(storage, "127.0.0.1", 9199);
      CF.connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    }
    await A.setPersistence(auth, A.browserSessionPersistence);
    let state = { user: null, books: [], loans: [], users: [], donations: [], loading: true };
    let privateStops = [], authGeneration = 0;
    const emit = () => onChange({ ...state });
    const rows = snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const call = async (name, data) => (await CF.httpsCallable(functions, name)(data)).data;
    const error = err => { state.loading = false; emit(); onError(err); };
    F.onSnapshot(F.query(F.collection(db, "books"), F.where("published", "==", true)), snapshot => {
      state.books = rows(snapshot); state.loading = false; emit();
    }, error);
    A.onAuthStateChanged(auth, async firebaseUser => {
      const generation = ++authGeneration;
      privateStops.forEach(stop => stop()); privateStops = [];
      state = { ...state, user: null, loans: [], users: [], donations: [] }; emit();
      if (!firebaseUser) return;
      try {
        const token = await firebaseUser.getIdTokenResult();
        if (generation !== authGeneration) return;
        const isAdmin = token.claims.admin === true && C.ADMIN_NAMES.includes(token.claims.adminName) &&
          firebaseUser.uid === "admin-" + token.claims.adminName.toLowerCase();
        const uid = firebaseUser.uid;
        privateStops.push(F.onSnapshot(F.doc(db, "users", uid), snapshot => {
          if (generation !== authGeneration) return;
          state.user = snapshot.exists() ? { ...snapshot.data(), uid, isAdmin } :
            { uid, name: "Lengkapi profil", nis: firebaseUser.email?.split("@")[0] || "", role: "incomplete", isAdmin: false, likes: [], activeCount: 0 };
          emit();
        }, error));
        const watch = (key, query) => privateStops.push(F.onSnapshot(query, snapshot => {
          if (generation !== authGeneration) return;
          state[key] = rows(snapshot); emit();
        }, error));
        watch("loans", F.query(F.collection(db, "loans"), F.where(isAdmin ? "status" : "uid", "==", isAdmin ? "active" : uid)));
        watch("donations", isAdmin ? F.collection(db, "donations") : F.query(F.collection(db, "donations"), F.where("uid", "==", uid)));
        if (isAdmin) watch("users", F.collection(db, "users"));
      } catch (err) { if (generation === authGeneration) error(err); }
    }, error);
    return {
      mode: "firebase",
      async login({ identity, password, role }) {
        const credentials = await A.signInWithEmailAndPassword(auth, C.email(identity, role), password);
        const token = await credentials.user.getIdTokenResult(true);
        if (role === "admin" && !(token.claims.admin === true && C.adminName(identity) === token.claims.adminName &&
          credentials.user.uid === "admin-" + token.claims.adminName.toLowerCase())) {
          await A.signOut(auth); throw new Error("Akun ini tidak memiliki akses admin.");
        }
      },
      async register({ nis, name, password }) {
        const value = C.nis(nis);
        C.assert(password.length >= 6, "Kata sandi minimal 6 karakter.");
        await A.createUserWithEmailAndPassword(auth, C.email(value, "student"), password);
        // Profil yang belum selesai tetap bisa dilanjutkan tanpa membuat akun ulang.
        await call("completeProfile", { nis: value, name });
      },
      completeProfile: data => call("completeProfile", data),
      logout: () => A.signOut(auth),
      borrow: (bookId, requestId) => call("borrowBook", { bookId, requestId }),
      returnLoan: loanId => call("returnBook", { loanId }),
      saveBook: data => call("saveBook", data),
      like: (bookId, liked) => call("setLike", { bookId, liked }),
      async donate(data, files, onProgress) {
        const donation = await call("beginDonation", { ...data, files: files.map(file => ({ name: file.name, size: file.size, type: file.type })) });
        C.assert(donation.status === "uploading", "Donasi ini sudah terkirim. Tutup formulir untuk membuat donasi baru.");
        C.assert(donation.files.length === files.length && donation.files.every((item, i) => item.size === files[i].size && item.name === files[i].name && item.type === files[i].type),
          "Berkas berubah. Tutup lalu buka formulir donasi untuk memulai unggahan baru.");
        const total = files.reduce((sum, file) => sum + file.size, 0); let completed = 0;
        for (let i = 0; i < files.length; i++) {
          const fileRef = S.ref(storage, donation.files[i].path);
          let exists = false;
          try { await S.getMetadata(fileRef); exists = true; }
          catch (err) { if (err.code !== "storage/object-not-found") throw err; }
          if (!exists) await new Promise((resolve, reject) => {
            const upload = S.uploadBytesResumable(fileRef, files[i], { contentType: files[i].type });
            upload.on("state_changed", snap => onProgress(Math.round((completed + snap.bytesTransferred) / total * 100)), reject, resolve);
          });
          completed += files[i].size; onProgress(Math.round(completed / total * 100));
        }
        return call("finishDonation", { id: donation.id });
      },
      finishDonation: id => call("finishDonation", { id }),
      reviewDonation: data => call("reviewDonation", data),
      readFile: file => S.getBlob(S.ref(storage, file.path), C.MAX_FILE_BYTES),
      async changePassword(password) { C.assert(password.length >= 6, "Kata sandi minimal 6 karakter."); await A.updatePassword(auth.currentUser, password); }
    };
  };
})(window);
