/* HANYA SIMULASI LOKAL. Mode Firebase sama sekali tidak memakai berkas ini
   untuk autentikasi atau izin admin. Data demo tidak otomatis pindah ke cloud. */
(function (root) {
  "use strict";
  root.createDemoStore = async function (onChange) {
    const C = root.SbookyCore, key = "sbooky-demo-v3", sessionKey = "sbooky-demo-session";
    const adminHash = "81c981c9f676936373a28420ba12b73a0408a68cc362f963a11b062a7e4dc6d5";
    C.assert(root.crypto?.subtle, "Browser ini belum mendukung penyimpanan akun. Coba Chrome/Edge dengan Live Server.");
    const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
      .map(byte => byte.toString(16).padStart(2, "0")).join("");
    const read = () => {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
      return { books: structuredClone(root.SBOOKY_BOOKS), loans: [], donations: [],
        users: C.ADMIN_NAMES.map(name => ({ uid: "admin-" + name.toLowerCase(), name, role: "admin", isAdmin: true,
          adminName: name, nis: null, activeCount: 0, likes: [], passwordHash: adminHash, createdAt: Date.now() })) };
    };
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(read()));
    const publicUser = user => { if (!user) return null; const { passwordHash, ...rest } = user; return rest; };
    let currentUid = sessionStorage.getItem(sessionKey);
    const emit = () => {
      const data = read(), user = data.users.find(u => u.uid === currentUid);
      onChange({ user: publicUser(user), books: data.books.filter(b => b.published), loading: false,
        loans: user ? data.loans.filter(l => user.isAdmin ? l.status === "active" : l.uid === user.uid) : [],
        users: user?.isAdmin ? data.users.map(publicUser) : [],
        donations: user ? data.donations.filter(d => user.isAdmin || d.uid === user.uid) : [] });
    };
    function session(data, admin = false) {
      const user = data.users.find(u => u.uid === currentUid);
      C.assert(user, "Silakan masuk terlebih dahulu.");
      C.assert(!admin || user.isAdmin, "Hanya admin yang dapat melakukan tindakan ini.");
      return user;
    }
    const mutate = async action => {
      const work = () => {
        const data = read(), result = action(data);
        localStorage.setItem(key, JSON.stringify(data)); emit(); return result;
      };
      return navigator.locks ? navigator.locks.request("sbooky-demo-write", work) : work();
    };
    let dbPromise;
    function filesDb() {
      if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("sbooky-demo-files", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("files");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error("Penyimpanan berkas tidak tersedia di browser ini."));
      });
      return dbPromise;
    }
    async function putFiles(files, paths) {
      const db = await filesDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("files", "readwrite");
        files.forEach((file, i) => tx.objectStore("files").put(file, paths[i]));
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () => reject(new Error("Penyimpanan penuh. Coba unggah berkas lebih kecil."));
      });
    }
    addEventListener("storage", event => { if (event.key === key) emit(); });
    queueMicrotask(emit);
    return {
      mode: "demo",
      async login({ identity, password, role }) {
        const data = read(), name = role === "admin" ? C.adminName(identity) : null;
        const user = data.users.find(u => role === "admin" ? u.adminName === name && name : u.nis === C.nis(identity));
        const digest = await hash(password);
        C.assert(user && user.passwordHash === digest && user.role === role, "NIS/nama admin atau kata sandi salah.");
        currentUid = user.uid; sessionStorage.setItem(sessionKey, currentUid); emit();
      },
      async register({ nis, name, password }) {
        const value = C.nis(nis), fullName = name.trim();
        C.assert(fullName.length >= 2 && fullName.length <= 100, "Isi nama lengkap (2–100 karakter).");
        C.assert(password.length >= 6, "Kata sandi minimal 6 karakter.");
        const passwordHash = await hash(password);
        const uid = "student-" + C.uuid();
        await mutate(data => {
          C.assert(!data.users.some(u => u.nis === value), "NIS sudah terdaftar. Silakan masuk.");
          data.users.push({ uid, nis: value, name: fullName, role: "student", isAdmin: false,
            passwordHash, likes: [], activeCount: 0, createdAt: Date.now() });
        });
        currentUid = uid; sessionStorage.setItem(sessionKey, uid); emit();
      },
      async logout() { currentUid = null; sessionStorage.removeItem(sessionKey); emit(); },
      async borrow(bookId, requestId) {
        return mutate(data => {
          const user = session(data);
          C.assert(user.role === "student", "Gunakan akun siswa untuk meminjam.");
          const prior = data.loans.find(l => l.id === requestId);
          if (prior) { C.assert(prior.uid === user.uid && prior.bookId === bookId, "ID transaksi telah digunakan."); return prior; }
          C.assert(user.activeCount < C.MAX_LOANS, "Batas 10 buku tercapai. Kembalikan salah satu buku terlebih dahulu.");
          C.assert(!data.loans.some(l => l.uid === user.uid && l.bookId === bookId && l.status === "active"), "Kamu masih meminjam judul ini.");
          const book = data.books.find(b => b.id === bookId && b.type === "offline");
          C.assert(book && C.available(book) > 0, "Stok buku habis. Silakan pilih buku lain.");
          const loan = { id: requestId, uid: user.uid, nis: user.nis, name: user.name, bookId, title: book.title,
            author: book.author, status: "active", borrowedAt: Date.now(), returnedAt: null, returnedBy: null };
          data.loans.push(loan); book.borrowed++; user.activeCount++; return loan;
        });
      },
      async returnLoan(loanId) {
        return mutate(data => {
          const admin = session(data, true), loan = data.loans.find(l => l.id === loanId);
          C.assert(loan, "Pinjaman tidak ditemukan.");
          if (loan.status === "returned") return;
          const book = data.books.find(b => b.id === loan.bookId), user = data.users.find(u => u.uid === loan.uid);
          C.assert(book && user && book.borrowed > 0 && user.activeCount > 0, "Data pinjaman tidak konsisten.");
          book.borrowed--; user.activeCount--;
          Object.assign(loan, { status: "returned", returnedAt: Date.now(), returnedBy: admin.uid });
        });
      },
      async saveBook(data) {
        const fields = C.bookFields(data);
        C.assert(Number.isInteger(data.stock) && data.stock >= 0 && data.stock <= 100000, "Stok harus bilangan bulat 0–100.000.");
        return mutate(db => {
          session(db, true);
          const book = db.books.find(b => b.id === data.id);
          C.assert(!book || book.type === "offline", "Buku online dikelola lewat donasi.");
          C.assert(data.stock >= (book?.borrowed || 0), "Stok total tidak boleh kurang dari jumlah buku yang dipinjam.");
          if (book) Object.assign(book, fields, { stock: data.stock });
          else db.books.push({ ...fields, id: data.id, type: "offline", stock: data.stock, borrowed: 0, color: "#25664b", published: true });
        });
      },
      async like(bookId, liked) {
        await mutate(data => {
          const user = session(data), likes = new Set(user.likes);
          liked ? likes.add(bookId) : likes.delete(bookId); user.likes = [...likes];
        });
      },
      async donate(data, files, onProgress) {
        C.validateFiles(files); C.assert(data.permission, "Konfirmasi izin membagikan buku.");
        const user = session(read()), fields = C.bookFields({ ...data, imageName: "" });
        const existing = read().donations.find(d => d.id === data.id);
        C.assert(!existing, "Donasi ini sudah terkirim.");
        const paths = files.map((_, i) => `donations/${user.uid}/${data.id}/${i}`);
        await putFiles(files, paths); onProgress(100);
        await mutate(db => {
          const active = session(db); C.assert(active.uid === user.uid, "Akun berubah. Silakan masuk ulang.");
          db.donations.push({ ...fields, id: data.id, uid: user.uid, nis: user.nis || "—", name: user.name,
            files: files.map((file, i) => ({ name: file.name, size: file.size, type: file.type, path: paths[i] })),
            status: "pending", permission: true, createdAt: Date.now(), note: "", reviewedAt: null, reviewedBy: null });
        });
      },
      async reviewDonation(data) {
        await mutate(db => {
          const admin = session(db, true), donation = db.donations.find(d => d.id === data.id);
          C.assert(donation?.status === "pending", "Donasi sudah ditinjau.");
          C.assert(["approved", "rejected"].includes(data.status), "Status tidak valid.");
          C.assert(data.status !== "rejected" || data.note?.trim(), "Isi alasan penolakan.");
          Object.assign(donation, { status: data.status, note: data.note || "", reviewedAt: Date.now(), reviewedBy: admin.uid });
          if (data.status === "approved") db.books.push({ id: "online_" + donation.id, title: donation.title, author: donation.author,
            description: donation.description, category: donation.category, type: "online", files: donation.files,
            imageName: "", donationId: donation.id, ownerUid: donation.uid, published: true, color: "#265844", stock: 0, borrowed: 0 });
        });
      },
      async readFile(file) {
        session(read()); const db = await filesDb();
        return new Promise((resolve, reject) => {
          const req = db.transaction("files").objectStore("files").get(file.path);
          req.onsuccess = () => req.result ? resolve(req.result) : reject(new Error("Berkas tidak ditemukan di browser ini."));
          req.onerror = () => reject(new Error("Berkas gagal dibuka."));
        });
      },
      async changePassword(password) {
        C.assert(password.length >= 6, "Kata sandi minimal 6 karakter."); const passwordHash = await hash(password);
        return mutate(data => { session(data).passwordHash = passwordHash; });
      }
    };
  };
})(window);
