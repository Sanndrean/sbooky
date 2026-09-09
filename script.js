(function () {
  "use strict";
  const C = window.SbookyCore, $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const date = value => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(value)) : "—";
  const number = value => new Intl.NumberFormat("id-ID").format(value || 0);
  const localBooks = () => window.SBOOKY_BOOKS.map(book => ({ ...book, stock: 0, borrowed: 0, seedOnly: true }));
  let connectionAttempt, connectionIssue = null;
  let store, data = { user: null, books: localBooks(), loans: [], users: [], donations: [], ratings: [], leaderboard: [], loading: false };
  const ui = { view: "home", collection: "offline", category: "Semua", search: "", sort: "default", limit: 24,
    adminTab: "inventory", borrowerBook: null, pendingView: null, pendingBook: null, history: [], lastUid: null,
    dialogType: "", dialogData: null, dialogVersion: 0, busy: false, donationFiles: [], donationId: null, readerPage: 0, readerFiles: [], urls: [] };
  let renderFrame = 0, toastTimer, searchTimer, dialogOpener;
  const isAdmin = () => !!data.user?.isAdmin;
  const signedIn = () => data.user && data.user.role !== "incomplete";
  const bookById = id => data.books.find(book => book.id === id);
  const userMetric = (user, key) => Math.max(0, Number(user?.[key] || 0));
  function ratingInfo(bookId) {
    const rows = data.ratings.filter(r => r.bookId === bookId), total = rows.reduce((sum, r) => sum + Number(r.score || 0), 0);
    const average = rows.length ? total / rows.length : 0;
    return { count: rows.length, average, percent: Math.round(average * 20), mine: rows.find(r => r.uid === data.user?.uid)?.score || 0 };
  }
  const statusLabel = { active: "Dipinjam", returned: "Dikembalikan", pending: "Menunggu admin", approved: "Disetujui", rejected: "Ditolak", uploading: "Belum terkirim" };
  const badge = status => `<span class="badge ${esc(status)}">${esc(statusLabel[status] || status)}</span>`;
  const noResults = text => `<div class="empty"><span aria-hidden="true">▤</span><h3>Belum ada data</h3><p>${esc(text)}</p></div>`;
  function message(error) {
    const code = error?.code || "";
    const known = { "auth/invalid-credential": "NIS/nama admin atau kata sandi salah.", "auth/invalid-login-credentials": "NIS/nama admin atau kata sandi salah.",
      "auth/email-already-in-use": "NIS sudah terdaftar. Gunakan menu Masuk siswa.", "auth/too-many-requests": "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
      "auth/weak-password": "Kata sandi minimal 6 karakter.", "auth/network-request-failed": "Firebase Authentication tidak dapat dijangkau. Internet bisa tetap normal; coba nonaktifkan pemblokir/VPN untuk localhost, lalu ulangi.",
      "auth/requires-recent-login": "Masuk ulang sebelum mengubah kata sandi.", "auth/operation-not-allowed": "Login belum diaktifkan. Admin perlu mengaktifkan Email/Password di Firebase.",
      "permission-denied": "Rules Firestore belum sesuai atau akses admin belum didaftarkan. Salin seluruh FIRESTORE-RULES.txt ke Firestore Rules, klik Publish, lalu periksa adminAccess.",
      "functions/unavailable": "Server belum tersedia. Periksa internet atau penyelesaian pengaturan Firebase.",
      "storage/unauthorized": "Akses berkas ditolak. Periksa login, status donasi, dan aturan Storage.",
      "storage/retry-limit-exceeded": "Unggahan terputus. Periksa internet lalu coba lagi." };
    return known[code] || error?.message || "Tindakan belum berhasil. Coba lagi.";
  }
  function toast(text, error = false) {
    $("toast").textContent = text; $("toast").classList.toggle("error", error); $("toast").classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), error ? 6500 : 4000);
  }
  function scheduleRender() { if (!renderFrame) renderFrame = requestAnimationFrame(() => { renderFrame = 0; render(); }); }
  function remember(bookId) {
    if (!data.user) return;
    ui.history = [bookId, ...ui.history.filter(id => id !== bookId)].slice(0, 100);
    sessionStorage.setItem("sbooky-reading-" + data.user.uid, JSON.stringify(ui.history)); scheduleRender();
  }
  function onData(next) {
    const nextUid = next.user?.uid || null;
    if (ui.lastUid !== nextUid) {
      // Riwayat membaca khusus sesi. Pinjaman resmi tidak dihapus oleh logout.
      if (ui.lastUid) sessionStorage.removeItem("sbooky-reading-" + ui.lastUid);
      ui.history = [];
      if (nextUid) { try { ui.history = JSON.parse(sessionStorage.getItem("sbooky-reading-" + nextUid) || "[]"); } catch { ui.history = []; } }
      ui.lastUid = nextUid;
      if (!nextUid && ui.dialogType === "reader") closeDialog();
    }
    data = { ratings: [], leaderboard: [], ...next, books: next.books?.length ? next.books : localBooks(), loading: false };
    if (signedIn() && ui.pendingView) { const view = ui.pendingView; ui.pendingView = null; navigate(view); }
    if (signedIn() && ui.pendingBook && !ui.busy) { const id = ui.pendingBook; ui.pendingBook = null; openBook(id); }
    scheduleRender();
  }
  function imageCandidates(name) {
    if (!name || !/^[a-zA-Z0-9_-]{1,80}(\.(jpg|jpeg|png|webp))?$/i.test(name)) return [];
    const hasExtension = /\.(jpg|jpeg|png|webp)$/i.test(name);
    const names = hasExtension ? [name] : ["png", "jpg", "jpeg", "webp", "PNG", "JPG", "JPEG", "WEBP"].map(ext => `${name}.${ext}`);
    return names;
  }
  function loadImage(img, name) {
    const choices = imageCandidates(name); let index = 0;
    const fallback = img.closest(".cover")?.querySelector(".cover-fallback") || (img.id === "schoolLogo" ? $("schoolLogoFallback") : null);
    img.hidden = true;
    img.onload = () => { img.hidden = false; if (fallback) fallback.hidden = true; };
    img.onerror = () => { index++; if (index < choices.length) img.src = choices[index]; else { img.hidden = true; if (fallback) fallback.hidden = false; } };
    if (choices.length) img.src = choices[0];
  }
  function hydrateImages(root = document) { root.querySelectorAll("img[data-image]").forEach(img => loadImage(img, img.dataset.image)); }
  function cover(book, detail = false) {
    const name = book.imageName || "";
    const fallback = `<div class="cover-fallback"><strong>${esc(book.title)}</strong><span>${esc(book.author)}</span></div>`;
    const image = name ? `<img data-image="${esc(name)}" alt="Sampul ${esc(book.title)}" loading="eager" decoding="async" hidden>` : "";
    return `<div class="cover ${detail ? "detail-cover" : ""}">${detail ? fallback + image : `<button class="cover-main" data-action="book" data-id="${esc(book.id)}" aria-label="Buka ${esc(book.title)}">${fallback}${image}</button>`}${!detail ? `<span class="category-label">${esc(book.category)}</span><button class="like ${data.user?.likes?.includes(book.id) ? "active" : ""}" data-action="like" data-id="${esc(book.id)}" aria-label="${data.user?.likes?.includes(book.id) ? "Hapus dari" : "Tambahkan ke"} buku disukai: ${esc(book.title)}" aria-pressed="${!!data.user?.likes?.includes(book.id)}">${data.user?.likes?.includes(book.id) ? "♥" : "♡"}</button>` : ""}</div>`;
  }
  function filteredBooks() {
    let books = data.books;
    if (ui.view === "liked") books = books.filter(b => data.user?.likes?.includes(b.id));
    else if (ui.view === "history") books = ui.history.map(bookById).filter(Boolean);
    else books = books.filter(b => b.type === ui.collection);
    books = books.filter(b => (ui.category === "Semua" || b.category === ui.category) &&
      `${b.title} ${b.author} ${b.category}`.toLocaleLowerCase("id").includes(ui.search.toLocaleLowerCase("id")));
    if (ui.view !== "history") books = [...books].sort((a, b) => ui.sort === "title" ? a.title.localeCompare(b.title, "id") :
      ui.sort === "popular" ? (b.borrowed || 0) - (a.borrowed || 0) : (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id, "id", { numeric: true }));
    return books;
  }
  function render() {
    const user = data.user;
    $("loginButton").hidden = !!user; $("loginButton").disabled = false;
    $("profileButton").hidden = !user;
    $("profileName").textContent = user?.name || ""; $("profileInitial").textContent = user?.name?.[0]?.toUpperCase() || "S";
    $("rewardActions").hidden = !user || isAdmin(); $("pointCount").textContent = number(userMetric(user, "points"));
    if (user && !isAdmin()) hydrateImages($("rewardActions"));
    $("adminNav").hidden = !isAdmin();
    $("likedCount").textContent = user?.likes?.length || 0; $("loanCount").textContent = user?.activeCount || 0;
    document.querySelectorAll(".nav[data-view]").forEach(button => { button.classList.toggle("active", button.dataset.view === ui.view); button.setAttribute("aria-current", button.dataset.view === ui.view ? "page" : "false"); });
    const catalog = ["home", "offline", "online", "liked", "history"].includes(ui.view);
    $("catalogPanel").hidden = !catalog; $("loansPanel").hidden = ui.view !== "loans";
    $("donationsPanel").hidden = ui.view !== "donations"; $("leaderboardPanel").hidden = ui.view !== "leaderboard"; $("adminPanel").hidden = ui.view !== "admin";
    $("searchInput").placeholder = ui.view === "admin" ? "Cari judul, nama, atau NIS…" : "Cari buku atau penulis…";
    if (catalog) renderCatalog();
    if (ui.view === "loans") renderLoans();
    if (ui.view === "donations") renderDonations();
    if (ui.view === "leaderboard") renderLeaderboard();
    if (ui.view === "admin") { renderAdmin(); hydrateImages($("adminPanel")); }
  }
  function renderCatalog() {
    $("hero").hidden = ui.view !== "home";
    $("collectionTabs").hidden = ["liked", "history"].includes(ui.view);
    document.querySelectorAll("[data-collection]").forEach(button => { button.classList.toggle("active", button.dataset.collection === ui.collection); button.setAttribute("aria-pressed", button.dataset.collection === ui.collection); });
    const categories = ["Semua", ...C.CATEGORIES];
    $("categories").innerHTML = categories.map(category => `<button class="${ui.category === category ? "active" : ""}" data-category="${esc(category)}" aria-pressed="${ui.category === category}">${esc(category)}</button>`).join("");
    const titles = { liked: "Buku yang kamu sukai", history: "Riwayat membaca" };
    $("pageTitle").textContent = titles[ui.view] || (ui.collection === "offline" ? "Koleksi buku offline" : "Koleksi buku online");
    const books = filteredBooks();
    $("bookTotal").textContent = data.loading ? "Memuat koleksi…" : `${number(books.length)} judul • ${ui.view === "history" ? "Riwayat dihapus saat logout" : ui.collection === "offline" && !titles[ui.view] ? "Maks. 10 buku aktif per siswa" : "Temukan bacaanmu"}`;
    $("bookGrid").innerHTML = data.loading ? Array(4).fill('<div class="skeleton" aria-hidden="true"></div>').join("") : books.slice(0, ui.limit).map(book => {
      const stock = C.available(book), online = book.type === "online";
      const rating = ratingInfo(book.id);
      return `<article class="book-card">${cover(book)}<button class="book-title" data-action="book" data-id="${esc(book.id)}" title="${esc(book.title)}">${esc(book.title)}</button><p class="book-author" title="${esc(book.author)}">${esc(book.author)}</p><div class="rating-summary"><span>★ ${rating.average ? rating.average.toFixed(1) : "0.0"}</span><span>${rating.percent}% · ${number(rating.count)} rating</span></div><div class="book-meta"><span>${online ? "▣ Online" : "▤ Offline"}</span><span class="${online || stock > 0 ? "stock-available" : "stock-empty"}">${book.seedOnly ? "Belum diaktifkan" : online ? "Siap dibaca" : stock > 0 ? `${number(stock)} tersedia` : "Stok habis"}</span></div></article>`;
    }).join("");
    hydrateImages($("bookGrid"));
    $("emptyState").hidden = data.loading || books.length > 0;
    $("emptyTitle").textContent = ui.view === "history" ? "Belum ada riwayat membaca" : ui.view === "liked" ? "Belum ada buku disukai" : "Belum ada buku";
    $("emptyText").textContent = ui.view === "history" ? "Buku yang kamu baca akan tampil di sini selama sesi masuk ini." :
      ui.view === "liked" ? "Tekan ikon hati pada sampul untuk menyimpan pilihanmu." : ui.collection === "online" && !ui.search && ui.category === "Semua" ? "Buku online berasal dari donasi PDF atau scan halaman yang telah disetujui admin." : "Coba kategori atau pencarian lain.";
    $("loadMore").hidden = books.length <= ui.limit;
  }
  function loanTable(loans, admin = false) {
    if (!loans.length) return noResults(admin ? "Belum ada peminjaman aktif yang sesuai." : "Pinjam buku fisik dari koleksi offline untuk mulai mengisi daftar ini.");
    return `<div class="table-wrap"><table><thead><tr><th>BUKU</th>${admin ? "<th>PEMINJAM / NIS</th>" : ""}<th>TANGGAL PINJAM</th><th>STATUS</th>${admin ? "<th>TINDAKAN</th>" : "<th>DIKEMBALIKAN</th>"}</tr></thead><tbody>${loans.map(loan => `<tr><td class="table-book"><strong>${esc(loan.title)}</strong><small>${esc(loan.author)}</small></td>${admin ? `<td><strong>${esc(loan.name)}</strong><small>NIS ${esc(loan.nis)}</small></td>` : ""}<td class="numeric">${date(loan.borrowedAt)}</td><td>${badge(loan.status)}</td><td>${admin ? `<button class="button small secondary" data-action="return" data-id="${esc(loan.id)}">Terima pengembalian</button>` : date(loan.returnedAt)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderLoans() {
    if (!signedIn()) { $("loansPanel").innerHTML = noResults("Masuk sebagai siswa untuk melihat pinjamanmu."); return; }
    const loans = data.loans.filter(l => l.uid === data.user.uid && `${l.title} ${l.author}`.toLowerCase().includes(ui.search.toLowerCase())).sort((a, b) => b.borrowedAt - a.borrowedAt);
    const count = data.user.activeCount || 0;
    $("loansPanel").innerHTML = `<div class="panel-top"><div><h1>Pinjaman saya</h1><p>Buku fisik yang tercatat atas NIS ${esc(data.user.nis || "—")}.</p></div><button class="button secondary" data-view="offline">Cari buku lain</button></div><div class="loan-meter"><strong>${number(count)} / 10</strong><div><b>Buku yang masih dipinjam</b><p>Satu eksemplar per judul. Bawa buku ke petugas untuk pengembalian.</p><div class="track"><span style="width:${Math.min(count * 10, 100)}%"></span></div></div></div>${loanTable(loans)}`;
  }
  function donationRows(donations, admin = false) {
    if (!donations.length) return noResults("Belum ada donasi yang sesuai. PDF dan scan yang terkirim akan muncul di sini.");
    return `<div class="card-list">${donations.map(donation => `<article class="donation-row"><div><h3>${esc(donation.title)}</h3><p>${esc(donation.author)} · ${esc(donation.category)} · ${donation.files.length} berkas</p><p>${admin ? `${esc(donation.name)} · NIS ${esc(donation.nis)} · ` : ""}${date(donation.createdAt)}</p>${donation.note ? `<p>Catatan admin: ${esc(donation.note)}</p>` : ""}</div><div class="row-actions">${badge(donation.status)}${donation.status !== "uploading" ? `<button class="button small secondary" data-action="preview-donation" data-id="${esc(donation.id)}">Lihat berkas</button>` : `<button class="button small secondary" data-action="finish-donation" data-id="${esc(donation.id)}">Periksa unggahan</button>`}${admin && donation.status === "pending" ? `<button class="button small primary" data-action="review" data-id="${esc(donation.id)}">Tinjau</button>` : ""}</div></article>`).join("")}</div>`;
  }
  function renderDonations() {
    const donations = data.donations.filter(d => d.uid === data.user?.uid && `${d.title} ${d.author}`.toLowerCase().includes(ui.search.toLowerCase())).sort((a, b) => b.createdAt - a.createdAt);
    $("donationsPanel").innerHTML = `<div class="panel-top"><div><h1>Donasi saya</h1><p>Setelah disetujui admin, bukumu hadir di koleksi online.</p></div><button class="button primary" data-action="donate">＋ Donasi buku</button></div>${donationRows(donations)}`;
  }
  function readingTime(seconds) {
    const minutes = Math.floor(Number(seconds || 0) / 60);
    if (minutes < 60) return `${minutes} menit`;
    return `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`;
  }
  function leaderboardList(title, iconName, rows, key, formatter = number) {
    const sorted = [...rows].sort((a, b) => userMetric(b, key) - userMetric(a, key) || a.name.localeCompare(b.name, "id"));
    return `<article class="leader-card"><div class="leader-title"><span class="asset-icon leader-icon"><img data-image="${esc(iconName)}" alt=""></span><div><h2>${title}</h2><p>${sorted.length ? "Peringkat siswa Sbooky" : "Belum ada akun siswa"}</p></div></div><ol>${sorted.length ? sorted.slice(0, 10).map((user, i) => `<li><b class="rank">${i + 1}</b><span class="leader-avatar">${esc(user.name?.[0]?.toUpperCase() || "S")}</span><div><strong>${esc(user.name)}</strong><small>${formatter(userMetric(user, key))}</small></div></li>`).join("") : `<li class="leader-empty">Belum ada data. Nilai 0 akan tetap ditampilkan setelah siswa terdaftar.</li>`}</ol></article>`;
  }
  function renderLeaderboard() {
    const rows = data.leaderboard || [];
    $("leaderboardPanel").innerHTML = `<section class="leader-hero"><small class="eyebrow">SBOOKY HALL OF READERS</small><h1>Leaderboard Siswa</h1><p>Terus membaca, kembalikan buku tepat waktu, dan kumpulkan Sbooky Point.</p><button class="button secondary" data-action="credits">Kredit pembuat</button></section><div class="leader-grid">${leaderboardList("Paling banyak meminjam", "sbleaderbook", rows, "totalBorrows", value => `${number(value)} buku`)}${leaderboardList("Waktu membaca terlama", "sbleadertime", rows, "readingSeconds", readingTime)}${leaderboardList("Point terbanyak", "sbleaderpoint", rows, "points", value => `${number(value)} point`)}</div>`;
    hydrateImages($("leaderboardPanel"));
  }
  function loanHistoryTable(loans) {
    if (!loans.length) return noResults("Belum ada riwayat peminjaman.");
    return `<div class="table-wrap"><table><thead><tr><th>BUKU</th><th>SISWA / NIS</th><th>DIPINJAM</th><th>DIKEMBALIKAN</th><th>DITERIMA OLEH</th><th>STATUS</th></tr></thead><tbody>${loans.map(loan => `<tr><td class="table-book"><strong>${esc(loan.title)}</strong><small>${esc(loan.author)}</small></td><td><strong>${esc(loan.name)}</strong><small>NIS ${esc(loan.nis)}</small></td><td class="numeric">${date(loan.borrowedAt)}</td><td class="numeric">${date(loan.returnedAt)}</td><td>${esc(loan.returnedByName || (loan.status === "returned" ? "Admin perpustakaan" : "—"))}</td><td>${badge(loan.status)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function renderAdmin() {
    if (!isAdmin()) { $("adminStats").innerHTML = ""; $("adminContent").innerHTML = noResults("Masuk menggunakan akun admin untuk mengelola perpustakaan."); $("adminTabs").hidden = true; return; }
    $("adminTabs").hidden = false;
    $("adminWelcome").textContent = `${data.user.name} · Kelola koleksi dan peminjaman perpustakaan.`;
    const physical = data.books.filter(b => b.type === "offline");
    const active = data.loans.filter(l => l.status === "active");
    const students = data.users.filter(u => u.role === "student");
    const stats = [["Siswa terdaftar", students.length, `${students.reduce((sum, u) => sum + userMetric(u, "points"), 0)} point beredar`], ["Buku dipinjam", active.length, `${new Set(active.map(l => l.uid)).size} siswa peminjam aktif`],
      ["Stok tersedia", physical.reduce((sum, b) => sum + C.available(b), 0), `${physical.length} judul buku fisik`], ["Total transaksi", data.loans.length, `${data.loans.filter(l => l.status === "returned").length} sudah kembali`]];
    $("adminStats").innerHTML = stats.map(([label, value, note], i) => `<div class="stat-card ${i === 1 ? "accent" : ""}"><span>${label}</span><strong>${number(value)}</strong><small>${note}</small></div>`).join("");
    document.querySelectorAll("[data-admin-tab]").forEach(button => button.classList.toggle("active", button.dataset.adminTab === ui.adminTab));
    const term = ui.search.toLowerCase();
    if (ui.adminTab === "inventory") {
      const books = physical.filter(b => `${b.title} ${b.author} ${b.category}`.toLowerCase().includes(term)).sort((a, b) => b.borrowed - a.borrowed || a.title.localeCompare(b.title));
      $("adminContent").innerHTML = `${store?.seedBooks ? `<div class="info-card"><h3>Delapan buku awal: file1–file8</h3><p>Perahu Kertas, Si Juki, Matematika dan koleksi lama tetap terhubung ke sampulnya. Simpan sekali ke Firestore, lalu isi stok nyata lewat Edit buku & stok.</p><button class="button primary" data-action="seed-books" ${ui.seeding ? "disabled" : ""} style="margin-top:12px">${ui.seeding ? "Menyimpan…" : "Simpan 8 buku awal"}</button></div>` : ""}<p class="subtle-note">Stok total = tersedia + sedang dipinjam. Jumlah peminjam adalah siswa berbeda yang masih meminjam judul tersebut.</p>${books.length ? `<div class="table-wrap"><table><thead><tr><th>BUKU / PENULIS</th><th>KATEGORI</th><th>STOK TOTAL</th><th>TERSEDIA</th><th>PEMINJAM AKTIF</th><th>KELOLA</th></tr></thead><tbody>${books.map(book => `<tr><td class="table-book"><strong>${esc(book.title)}</strong><small>${esc(book.author)}</small></td><td>${esc(book.category)}</td><td class="numeric">${number(book.stock)}</td><td class="numeric ${C.available(book) ? "stock-available" : "stock-empty"}">${number(C.available(book))}</td><td><button class="text-button borrow-count" data-action="borrowers" data-id="${esc(book.id)}">${number(book.borrowed)} siswa</button></td><td><button class="button small secondary" data-action="edit-book" data-id="${esc(book.id)}">Edit buku & stok</button></td></tr>`).join("")}</tbody></table></div>` : noResults("Tambahkan buku fisik dan isi stok sesuai jumlah buku di perpustakaan.")}`;
    } else if (ui.adminTab === "loans") {
      const loans = active.filter(l => (!ui.borrowerBook || l.bookId === ui.borrowerBook) && `${l.title} ${l.name} ${l.nis}`.toLowerCase().includes(term)).sort((a, b) => b.borrowedAt - a.borrowedAt);
      $("adminContent").innerHTML = `${ui.borrowerBook ? `<div class="filter-notice"><span>Peminjam: <b>${esc(bookById(ui.borrowerBook)?.title || "Buku")}</b></span><button class="text-button" data-action="clear-borrower-filter">Lihat semua</button></div>` : `<p class="subtle-note">Terima pengembalian setelah buku fisik diserahkan ke petugas. Stok dan kuota siswa akan dipulihkan.</p>`}${loanTable(loans, true)}`;
    } else if (ui.adminTab === "history") {
      const history = data.loans.filter(l => `${l.title} ${l.name} ${l.nis} ${l.returnedByName || ""}`.toLowerCase().includes(term)).sort((a, b) => b.borrowedAt - a.borrowedAt);
      $("adminContent").innerHTML = `<div class="history-banner"><span>◷</span><div><h3>Riwayat sirkulasi buku</h3><p>Semua peminjaman dan pengembalian tersimpan di sini, termasuk nama siswa, NIS, tanggal, dan admin penerima.</p></div></div>${loanHistoryTable(history)}`;
    } else if (ui.adminTab === "donations") {
      const donations = data.donations.filter(d => `${d.title} ${d.author} ${d.name} ${d.nis}`.toLowerCase().includes(term)).sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || b.createdAt - a.createdAt);
      $("adminContent").innerHTML = `<p class="subtle-note">Periksa berkas dan izin donasi. Hanya donasi yang disetujui yang muncul sebagai buku online.</p>${donationRows(donations, true)}`;
    } else if (ui.adminTab === "users") {
      const users = data.users.filter(u => u.role === "student" && `${u.name} ${u.nis}`.toLowerCase().includes(term)).sort((a, b) => userMetric(b, "points") - userMetric(a, "points") || a.name.localeCompare(b.name));
      $("adminContent").innerHTML = users.length ? `<p class="subtle-note">Admin dapat menambah atau mengurangi point. Isi jumlah positif untuk menambah, negatif untuk mengurangi.</p><div class="table-wrap"><table><thead><tr><th>NAMA SISWA</th><th>NIS</th><th>PINJAMAN</th><th>POINT</th><th>AKTIVITAS</th><th>ATUR POINT</th></tr></thead><tbody>${users.map(user => `<tr><td><strong>${esc(user.name)}</strong></td><td class="numeric">${esc(user.nis)}</td><td>${number(user.activeCount)} / 10 aktif<small>${number(userMetric(user, "totalBorrows"))} total pinjam</small></td><td><b class="point-value"><span class="asset-icon inline-icon"><img data-image="sbpoint" alt=""></span>${number(userMetric(user, "points"))}</b></td><td>${readingTime(userMetric(user, "readingSeconds"))}</td><td><button class="button small point-manage" data-action="manage-points" data-id="${esc(user.uid)}">＋ / − Point</button></td></tr>`).join("")}</tbody></table></div>` : noResults("Siswa yang mendaftarkan NIS akan muncul di sini.");
    } else {
      const admins = C.ADMIN_NAMES.filter(name => name.toLowerCase().includes(term));
      $("adminContent").innerHTML = `<p class="subtle-note">Lima akun pengelola perpustakaan. Akses admin ditetapkan lewat pengaturan akun, bukan pendaftaran siswa.</p><div class="admin-list">${admins.map(name => { const exists = data.users.some(u => u.adminName === name && u.role === "admin") || data.admins?.some(a => a.name === name); return `<article class="admin-account"><strong>${name}</strong><span>${exists ? "Akun admin terdaftar" : "Belum diinisialisasi di Firebase"}</span></article>`; }).join("")}</div>`;
    }
  }
  function menu(open) { $("sidebar").classList.toggle("open", open); $("menuOverlay").hidden = !open; $("menuButton").setAttribute("aria-expanded", String(open)); if (open) $("closeMenu").focus(); }
  function navigate(view) {
    if (!["home", "offline", "online", "liked", "loans", "history", "donations", "leaderboard", "admin"].includes(view)) view = "home";
    if (["liked", "loans", "history", "donations", "admin"].includes(view) && !signedIn()) { ui.pendingView = view; openAuth(view === "admin" ? "admin" : "login"); return; }
    if (view === "admin" && !isAdmin()) { toast("Halaman ini hanya untuk admin perpustakaan.", true); return; }
    ui.view = view; ui.category = "Semua"; ui.search = ""; ui.limit = 24;
    if (["online", "offline"].includes(view)) ui.collection = view;
    $("searchInput").value = "";
    history.replaceState(null, "", "#" + view); menu(false); scheduleRender();
  }
  function showDialog(html, type, detail, className = "") {
    if (ui.busy) return;
    ui.dialogVersion++; ui.urls.forEach(url => URL.revokeObjectURL(url)); ui.urls = [];
    if (!$("dialog").open) dialogOpener = document.activeElement;
    ui.dialogType = type; ui.dialogData = detail; $("dialog").className = className;
    $("dialogBody").innerHTML = html;
    if (!$("dialog").open) $("dialog").showModal();
    hydrateImages($("dialogBody"));
  }
  function closeDialog() {
    if (ui.busy) { toast("Tunggu proses selesai terlebih dahulu."); return; }
    ui.dialogVersion++; ui.urls.forEach(url => URL.revokeObjectURL(url)); ui.urls = [];
    ui.dialogType = ""; ui.dialogData = null; ui.readerFiles = []; ui.donationFiles = [];
    $("dialog").close(); $("dialogBody").innerHTML = ""; dialogOpener?.focus?.();
  }
  function requireLogin() { if (signedIn()) return true; if (data.user?.role === "incomplete") openCompleteProfile(); else openAuth("login"); return false; }
  function openAuth(mode = "login") {
    if (data.user?.role === "incomplete") return openCompleteProfile();
    const register = mode === "register", admin = mode === "admin";
    showDialog(`<img class="dialog-logo" src="logo.png" alt="Sbooky"><h2 id="dialogTitle">${register ? "Daftar sebagai siswa" : admin ? "Masuk admin" : "Masuk ke Sbooky"}</h2><p>${admin ? "Gunakan salah satu akun pengelola perpustakaan." : "Gunakan NIS untuk menyimpan akun dan pinjamanmu."}</p><div class="auth-tabs"><button data-auth="login" class="${mode === "login" ? "active" : ""}">Masuk siswa</button><button data-auth="register" class="${register ? "active" : ""}">Daftar siswa</button><button data-auth="admin" class="${admin ? "active" : ""}">Admin</button></div><form id="authForm" data-mode="${mode}">${register ? '<label class="field">Nama lengkap<input name="name" autocomplete="name" required minlength="2" maxlength="100"></label>' : ""}<label class="field">${admin ? "Nama admin" : "NIS"}<input name="identity" required autocomplete="username" ${admin ? 'placeholder="SAdmin" maxlength="30"' : 'inputmode="numeric" pattern="[0-9]{4,20}" minlength="4" maxlength="20" placeholder="Contoh: 00123456"'}></label><label class="field">Kata sandi<input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="6" maxlength="128"></label><p id="formError" class="form-error" role="alert">${esc(connectionIssue || "")}</p><button class="button primary full" type="submit">${register ? "Buat akun" : "Masuk"}</button></form><p class="form-hint">${store?.mode === "demo" ? "Mode demo: akun dan data hanya tersimpan di browser ini." : "Akun dan NIS tersimpan di Firebase perpustakaan."}</p>`, "auth");
  }
  function openCompleteProfile() {
    showDialog(`<h2 id="dialogTitle">Lengkapi profil siswa</h2><p>Akunmu sudah dibuat. Lengkapi nama untuk melanjutkan.</p><form id="completeProfileForm"><label class="field">NIS<input name="nis" value="${esc(data.user.nis)}" readonly></label><label class="field">Nama lengkap<input name="name" minlength="2" maxlength="100" required autocomplete="name"></label><p id="formError" class="form-error" role="alert"></p><button class="button primary">Simpan profil</button></form><button class="text-button" data-action="logout">Keluar</button>`, "profile-complete");
  }
  function openProfile() {
    if (!data.user) return openAuth();
    if (data.user.role === "incomplete") return openCompleteProfile();
    showDialog(`<small class="eyebrow">AKUN ${isAdmin() ? "ADMIN" : "SISWA"}</small><h2 id="dialogTitle">${esc(data.user.name)}</h2><div class="profile-summary"><strong>${isAdmin() ? esc(data.user.adminName) : "NIS " + esc(data.user.nis)}</strong><small>${isAdmin() ? "Pengelola perpustakaan" : `${data.user.activeCount} buku dipinjam · ${number(userMetric(data.user, "points"))} point`}</small></div><form id="passwordForm"><label class="field">Kata sandi baru<input type="password" name="password" minlength="6" maxlength="128" required autocomplete="new-password"></label><p id="formError" class="form-error" role="alert"></p><button class="button secondary">Ubah kata sandi</button></form><div class="logout-row"><button class="button danger" data-action="logout">Keluar dari akun</button>${isAdmin() ? '<button class="button primary" data-action="go-admin">Dashboard admin</button>' : ""}</div><p class="form-hint">Riwayat membaca dihapus saat keluar. Catatan pinjaman tetap tersimpan hingga buku dikembalikan.</p>`, "profile");
  }
  function openBook(id) {
    const book = bookById(id); if (!book) return;
    if (!signedIn()) { ui.pendingBook = id; return requireLogin(); }
    const online = book.type === "online", active = data.loans.some(l => l.uid === data.user.uid && l.bookId === id && l.status === "active"), rating = ratingInfo(id);
    const canBorrow = !isAdmin() && !active && C.available(book) > 0 && data.user.activeCount < C.MAX_LOANS;
    const reason = book.seedOnly ? "Menunggu admin mengaktifkan buku" : active ? "Sedang kamu pinjam" : C.available(book) === 0 ? "Stok habis" : data.user.activeCount >= C.MAX_LOANS ? "Kuota 10 buku tercapai" : "Pinjam 1 buku";
    const stars = [1,2,3,4,5].map(score => `<button class="star-button ${score <= rating.mine ? "active" : ""}" data-action="rate" data-id="${esc(id)}" data-score="${score}" aria-label="Beri ${score} bintang">★</button>`).join("");
    const action = online ? `<div class="digital-coming"><span>PDF DONASI</span><div class="coming-soon">Coming Soon</div><p>Pratinjau PDF akan hadir pada pembaruan berikutnya.</p></div>` : `${isAdmin() ? `<button class="button secondary" data-action="edit-book" data-id="${esc(id)}">Edit buku & stok</button>` : `<button class="button primary" data-action="borrow" data-id="${esc(id)}" ${canBorrow ? "" : "disabled"}>${reason}</button>`}<p class="point-hint">+2 point saat mulai meminjam · +5 point saat dikembalikan</p>`;
    showDialog(`<small class="eyebrow">${online ? "BUKU ONLINE" : "BUKU OFFLINE"} / ${esc(book.category)}</small><div class="detail-layout">${cover(book, true)}<div><h2 id="dialogTitle">${esc(book.title)}</h2><p class="detail-author">${esc(book.author)}</p><p class="detail-description">${esc(book.description || "")}</p>${online ? `<span class="badge approved">Dari donasi perpustakaan</span>` : `<div class="detail-stock"><span><strong>${number(C.available(book))}</strong>tersedia</span><span><strong>${number(book.borrowed)}</strong>peminjam aktif</span></div>`}</div></div><section class="rating-box"><div><b>Rating pembaca</b><p>★ ${rating.average ? rating.average.toFixed(1) : "0.0"} · ${rating.percent}% · ${number(rating.count)} penilaian</p></div>${!isAdmin() && !book.seedOnly ? `<div class="star-picker" aria-label="Beri rating">${stars}</div>` : book.seedOnly ? `<small>Aktifkan buku melalui admin untuk memberi rating.</small>` : ""}</section><div class="detail-footer">${action}<p id="formError" class="form-error" role="alert"></p></div>`, "book", { id, requestId: C.uuid() }, "dialog-wide");
  }
  function showCredits() {
    showDialog(`<div class="credit-card"><img src="logo.png" alt="Logo Sbooky"><small class="eyebrow">CREATED WITH CURIOSITY</small><h2 id="dialogTitle">Tim Pembuat Sbooky</h2><p>Proyek perpustakaan digital karya siswa XI RPL SMKS Wira Harapan, 2026.</p><div class="credit-names"><span>Shannon</span><span>Jason</span><span>Orchid</span><span>Gustin</span><span>Gusnanda</span></div><div class="credit-shine">Baca · Temukan · Tumbuh bersama</div></div>`, "credits", null, "dialog-wide");
  }
  function showComingSoon(title = "Sbooky Shop", iconName = "sbshop") {
    showDialog(`<div class="soon-card"><span class="asset-icon modal-icon"><img data-image="${esc(iconName)}" alt=""></span><small class="eyebrow">SEDANG DISIAPKAN</small><h2 id="dialogTitle">${esc(title)}</h2><div class="coming-soon">Coming Soon</div><p>Fitur ini akan hadir pada pembaruan Sbooky berikutnya.</p></div>`, "coming-soon");
  }
  function showGift() {
    if (!requireLogin() || isAdmin()) return;
    const now = new Date(), currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const u = data.user, sameMonth = u.missionMonth === currentMonth, missions = [
      ["Baca 10 buku bulan ini!", sameMonth ? userMetric(u,"monthBorrows") : 0, 10, "sbmissionbook"],
      ["Login selama 10 hari", sameMonth ? userMetric(u,"monthLoginDays") : 0, 10, "sbfire"],
      ["Kembalikan 5 buku", sameMonth ? userMetric(u,"monthReturns") : 0, 5, "sbmissionbook"]
    ];
    const available = !userMetric(u,"lastDailyClaimAt") || Date.now() - userMetric(u,"lastDailyClaimAt") >= 20*60*60*1000;
    showDialog(`<small class="eyebrow">SBOOKY REWARDS</small><h2 id="dialogTitle">Hadiah & misi bulanan</h2><section class="daily-card"><div><span class="asset-icon daily-icon"><img data-image="sbgift" alt="Logo hadiah harian"></span><div><b>Daily Reward</b><p>Streak ${number(userMetric(u,"dailyStreak"))} hari · hadiah 10 point.</p></div></div><button class="button primary" data-action="claim-daily" ${available ? "" : "disabled"}>${available ? "Klaim +10" : "Sudah diklaim"}</button></section><h3 class="mission-heading">Misi bulan ini</h3><div class="mission-list">${missions.map(([title,value,target,iconName]) => `<article><span class="asset-icon mission-icon"><img data-image="${esc(iconName)}" alt=""></span><div><b>${title}</b><p>${number(Math.min(value,target))} / ${target}</p><div class="mission-track"><i style="width:${Math.min(value/target*100,100)}%"></i></div></div></article>`).join("")}</div><p id="formError" class="form-error" role="alert"></p>`, "gift", null, "dialog-wide");
  }
  function showPoints() {
    if (!requireLogin() || isAdmin()) return;
    showDialog(`<div class="point-modal"><span class="asset-icon point-modal-icon"><img data-image="sbpoint" alt="Logo Sbooky Point"></span><small class="eyebrow">SALDO SBOOKY</small><h2 id="dialogTitle">${number(userMetric(data.user,"points"))} Point</h2><p>Dapatkan point dari meminjam buku, mengembalikan buku, dan hadiah login harian.</p><button class="button primary" data-action="gift">Lihat hadiah & misi</button></div>`, "points");
  }
  function pointForm(uid) {
    const user = data.users.find(u => u.uid === uid); if (!user || !isAdmin()) return;
    showDialog(`<small class="eyebrow">ATUR SBOOKY POINT</small><h2 id="dialogTitle">${esc(user.name)}</h2><p>NIS ${esc(user.nis)} · Saldo sekarang <b>${number(userMetric(user,"points"))} point</b></p><form id="pointForm" data-id="${esc(uid)}"><label class="field">Tambah / kurangi point<input name="amount" type="number" min="-1000" max="1000" step="1" placeholder="Contoh: 20 atau -10" required></label><label class="field">Catatan<textarea name="reason" maxlength="120" placeholder="Contoh: hadiah lomba membaca"></textarea></label><p id="formError" class="form-error" role="alert"></p><button class="button primary">Simpan perubahan point</button></form>`, "manage-points");
  }
  function bookForm(id) {
    if (!isAdmin()) return;
    const book = id ? bookById(id) : null;
    showDialog(`<small class="eyebrow">KOLEKSI FISIK</small><h2 id="dialogTitle">${book ? "Edit buku & stok" : "Tambah buku perpustakaan"}</h2><form id="bookForm" data-id="${esc(id || C.uuid())}"><label class="field">Judul buku<input name="title" value="${esc(book?.title || "")}" required maxlength="180"></label><label class="field">Penulis / author<input name="author" value="${esc(book?.author || "")}" required maxlength="120"></label><div class="grid-2"><label class="field">Kategori<select name="category">${C.CATEGORIES.map(c => `<option ${book?.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label><label class="field">Stok total<input name="stock" type="number" min="${book?.borrowed || 0}" max="100000" step="1" value="${book?.stock ?? 0}" required></label></div><p class="form-hint">Sedang dipinjam: ${book?.borrowed || 0}. Stok total tidak boleh lebih kecil dari jumlah ini.</p><label class="field">Nama file sampul<input name="imageName" value="${esc(book?.imageName || "")}" placeholder="file9" maxlength="80"><small>Contoh: file9 → file9.png atau .jpg, sejajar dengan index.html.</small></label><label class="field">Deskripsi<textarea name="description" maxlength="2000">${esc(book?.description || "")}</textarea></label><p id="formError" class="form-error" role="alert"></p><button class="button primary">Simpan buku</button></form>`, "edit-book", null, "dialog-wide");
  }
  function donateForm() {
    if (!requireLogin()) return;
    if (store.supportsUploads === false) {
      showDialog(`<small class="eyebrow">DONASI DIGITAL</small><h2 id="dialogTitle">Upload buku belum aktif</h2><p>Perpustakaan saat ini memakai Firebase gratis untuk akun/NIS, buku fisik dan peminjaman.</p><p>Upload PDF atau scan halaman melalui Firebase Storage memerlukan paket Blaze. Tidak perlu upgrade untuk menggunakan buku offline.</p><p>Tidak ada berkas yang diunggah dari halaman ini. Panduan aktivasi donasi tersedia di PANDUAN-BLAZE-OPSIONAL.md.</p>`, "donation-unavailable");
      return;
    }
    ui.donationFiles = []; ui.donationId = C.uuid();
    showDialog(`<small class="eyebrow">DONASI DIGITAL</small><h2 id="dialogTitle">Bagikan buku untuk dibaca</h2><p>Unggah satu PDF atau foto halaman berurutan. Admin akan memeriksa sebelum menerbitkannya.</p><form id="donationForm"><label class="field">Judul buku<input name="title" required maxlength="180"></label><div class="grid-2"><label class="field">Penulis / author<input name="author" required maxlength="120"></label><label class="field">Kategori<select name="category">${C.CATEGORIES.map(c => `<option>${c}</option>`).join("")}</select></label></div><label class="field">Deskripsi<textarea name="description" maxlength="2000" placeholder="Tentang buku ini…"></textarea></label><div class="upload-options"><label class="button secondary upload-button">↑ Pilih PDF / foto<input id="donationUpload" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple aria-label="Pilih PDF atau foto buku"></label><label class="button secondary upload-button">▣ Scan halaman<input id="cameraUpload" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Ambil foto halaman buku"></label></div><p class="form-hint">Total maksimal 25 MB. Satu PDF atau maksimal 40 foto. Scan memotret halaman; tidak mengubah foto menjadi teks.</p><div id="fileList" class="file-list"></div><label class="check-field"><input name="permission" type="checkbox" required><span>Saya memiliki izin membagikan versi digital buku ini atau buku ini adalah karya saya/domain publik.</span></label><progress id="uploadProgress" class="upload-progress" max="100" value="0" hidden></progress><p id="uploadStatus" class="form-hint" aria-live="polite"></p><p id="formError" class="form-error" role="alert"></p><button class="button primary">Kirim untuk ditinjau</button></form>`, "donate", null, "dialog-wide");
  }
  function updateFileList() {
    $("fileList").innerHTML = ui.donationFiles.map((file, i) => `<div class="file-row"><b>${i + 1}.</b><span title="${esc(file.name)}">${esc(file.name)} (${(file.size / 1024 / 1024).toFixed(1)} MB)</span><button type="button" data-action="file-up" data-id="${i}" aria-label="Pindah berkas ${i + 1} ke atas" ${i === 0 ? "disabled" : ""}>↑</button><button type="button" data-action="file-remove" data-id="${i}" aria-label="Hapus berkas ${i + 1}">×</button></div>`).join("");
  }
  function reviewForm(id) {
    if (!isAdmin()) return;
    const donation = data.donations.find(d => d.id === id); if (!donation) return;
    showDialog(`<small class="eyebrow">TINJAU DONASI</small><h2 id="dialogTitle">${esc(donation.title)}</h2><p>${esc(donation.author)} · ${esc(donation.name)} · NIS ${esc(donation.nis)}</p><button class="button secondary" data-action="preview-donation" data-id="${esc(id)}">Lihat ${donation.files.length} berkas</button><form id="reviewForm" data-id="${esc(id)}"><p class="form-hint">Pastikan isi dapat dibaca dan izin digitalisasi sesuai.</p><label class="field">Keputusan<select name="status"><option value="approved">Setujui dan terbitkan online</option><option value="rejected">Tolak donasi</option></select></label><label class="field">Catatan admin<textarea name="note" maxlength="500" placeholder="Wajib diisi jika donasi ditolak."></textarea></label><p id="formError" class="form-error" role="alert"></p><button class="button primary">Simpan keputusan</button></form>`, "review", null, "dialog-wide");
  }
  async function reader(title, author, files, bookId = null, donationId = null) {
    if (!requireLogin()) return;
    if (!files?.length) return toast("Berkas belum tersedia.", true);
    showDialog(`<div class="reader-toolbar"><div><small class="eyebrow">${bookId ? "BACA ONLINE" : "PRATINJAU DONASI"}</small><h2 id="dialogTitle">${esc(title)}</h2><p>${esc(author)}</p></div></div><div class="reader-body" id="readerBody"><p>Memuat berkas…<span class="loading-spinner"></span></p></div><div class="reader-toolbar"><span id="readerPageInfo"></span><div class="reader-actions"><button class="button small secondary" data-action="reader-prev" id="readerPrev">← Sebelumnya</button><button class="button small secondary" data-action="reader-next" id="readerNext">Berikutnya →</button></div></div><p id="readerError" class="form-error" role="alert"></p>${donationId && isAdmin() ? `<button class="text-button" data-action="review" data-id="${esc(donationId)}">Kembali ke peninjauan</button>` : ""}`, "reader", { bookId, donationId }, "dialog-reader");
    ui.readerFiles = files; ui.readerPage = 0; await renderReaderPage();
  }
  async function renderReaderPage() {
    const version = ++ui.dialogVersion, page = ui.readerPage, file = ui.readerFiles[page]; if (!file) return;
    ui.urls.forEach(url => URL.revokeObjectURL(url)); ui.urls = [];
    $("readerBody").innerHTML = '<p>Memuat berkas…<span class="loading-spinner"></span></p>';
    $("readerError").textContent = "";
    $("readerPageInfo").textContent = file.type === "application/pdf" ? "Dokumen PDF" : `Foto ${page + 1} dari ${ui.readerFiles.length}`;
    $("readerPrev").hidden = $("readerNext").hidden = ui.readerFiles.length === 1;
    $("readerPrev").disabled = page === 0; $("readerNext").disabled = page === ui.readerFiles.length - 1;
    try {
      const blob = await store.readFile(file);
      if (version !== ui.dialogVersion || !$("dialog").open || !signedIn()) return;
      const url = URL.createObjectURL(blob); ui.urls.push(url);
      $("readerBody").innerHTML = file.type === "application/pdf" ? `<object class="reader-frame" data="${url}" type="application/pdf"><p>Browser ini tidak mendukung tampilan PDF. <a href="${url}" download="buku.pdf">Unduh PDF untuk membaca</a>.</p></object><p class="form-hint"><a href="${url}" download="buku.pdf">Unduh PDF</a></p>` : `<img class="reader-image" src="${url}" alt="Halaman ${page + 1} dari buku">`;
      if (ui.dialogData.bookId) remember(ui.dialogData.bookId);
    } catch (error) {
      if (version !== ui.dialogVersion || !$("readerError")) return;
      $("readerBody").innerHTML = '<p>Berkas belum berhasil dibuka.</p><button class="button secondary" data-action="reader-retry">Coba lagi</button>';
      $("readerError").textContent = message(error);
    }
  }
  async function run(action, success, options = {}) {
    if (ui.busy) return;
    ui.busy = true;
    const fields = [...$("dialogBody").querySelectorAll("button,input,select,textarea")];
    const previous = fields.map(field => field.disabled);
    fields.forEach(field => field.disabled = true); $("dialogClose").disabled = true;
    if ($("formError")) $("formError").textContent = "";
    try { await ensureStore(); const result = await action(); ui.busy = false; if (options.close !== false) closeDialog(); if (success) toast(success); return result; }
    catch (error) { if ($("formError")) $("formError").textContent = message(error); else toast(message(error), true); }
    finally {
      ui.busy = false; $("dialogClose").disabled = false;
      fields.forEach((field, index) => { field.disabled = previous[index]; }); scheduleRender();
      if (signedIn() && ui.pendingBook && !$("dialog").open) { const id = ui.pendingBook; ui.pendingBook = null; openBook(id); }
    }
  }
  document.addEventListener("submit", event => {
    const form = event.target; if (!(form instanceof HTMLFormElement)) return; event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (form.id === "authForm") {
      const mode = form.dataset.mode;
      if (mode === "admin") ui.pendingView = "admin";
      run(() => mode === "register" ? store.register({ nis: values.identity, name: values.name, password: values.password }) : store.login({ identity: values.identity, password: values.password, role: mode === "admin" ? "admin" : "student" }), mode === "register" ? "Akun siswa berhasil dibuat." : "Berhasil masuk.");
    } else if (form.id === "completeProfileForm") run(() => store.completeProfile(values), "Profil tersimpan.");
    else if (form.id === "passwordForm") run(() => store.changePassword(values.password), "Kata sandi berhasil diubah.");
    else if (form.id === "bookForm") run(() => store.saveBook({ ...values, id: form.dataset.id, stock: Number(values.stock) }), "Buku dan stok berhasil disimpan.");
    else if (form.id === "pointForm") run(() => store.adjustPoints(form.dataset.id, Number(values.amount), values.reason), "Point siswa berhasil diperbarui.");
    else if (form.id === "donationForm") {
      try { C.validateFiles(ui.donationFiles); } catch (error) { $("formError").textContent = error.message; return; }
      $("uploadProgress").hidden = false; $("uploadStatus").textContent = "Menyiapkan unggahan…";
      run(() => store.donate({ ...values, id: ui.donationId, permission: values.permission === "on" }, ui.donationFiles, percent => {
        if ($("uploadProgress")) { $("uploadProgress").value = percent; $("uploadStatus").textContent = percent === 100 ? "Berkas terunggah. Memeriksa dan mengirim ke admin…" : `Mengunggah ${percent}%…`; }
      }), "Donasi terkirim dan menunggu pemeriksaan admin.");
    } else if (form.id === "reviewForm") run(() => store.reviewDonation({ ...values, id: form.dataset.id }), values.status === "approved" ? "Donasi disetujui. Buku kini tersedia online." : "Keputusan donasi tersimpan.");
  });
  document.addEventListener("click", async event => {
    const target = event.target.closest("button,[data-action]"); if (!target || target.disabled || ui.busy) return;
    if (target.dataset.view) return navigate(target.dataset.view);
    if (target.dataset.collection) { ui.collection = target.dataset.collection; return navigate(ui.collection); }
    if (target.dataset.category) { ui.category = target.dataset.category; ui.limit = 24; return scheduleRender(); }
    if (target.dataset.auth) return openAuth(target.dataset.auth);
    if (target.dataset.adminTab) { ui.adminTab = target.dataset.adminTab; ui.borrowerBook = null; return scheduleRender(); }
    const action = target.dataset.action, id = target.dataset.id;
    if (action === "login") openAuth();
    else if (action === "profile") openProfile();
    else if (action === "points") showPoints();
    else if (action === "gift") showGift();
    else if (action === "shop") showComingSoon("Sbooky Shop", "sbshop");
    else if (action === "credits") showCredits();
    else if (action === "go-admin") { closeDialog(); navigate("admin"); }
    else if (action === "logout") {
      const uid = data.user?.uid;
      await run(async () => { await store.logout(); if (uid) sessionStorage.removeItem("sbooky-reading-" + uid); ui.history = []; ui.pendingView = null; ui.pendingBook = null; navigate("home"); }, "Kamu sudah keluar. Riwayat membaca dihapus.");
    } else if (action === "book") openBook(id);
    else if (action === "like") {
      if (!requireLogin()) return;
      target.disabled = true;
      try { await store.like(id, !data.user.likes?.includes(id)); } catch (error) { toast(message(error), true); }
      finally { target.disabled = false; }
    } else if (action === "borrow") {
      const requestId = ui.dialogData.requestId;
      await run(() => store.borrow(id, requestId), "Peminjaman tercatat. Ambil buku melalui petugas perpustakaan.");
    } else if (action === "rate") {
      if (!requireLogin() || isAdmin()) return;
      const score = Number(target.dataset.score); target.disabled = true;
      try { await store.rateBook(id, score); toast(`Rating ${score} bintang tersimpan.`); closeDialog(); openBook(id); }
      catch (error) { toast(message(error), true); }
      finally { target.disabled = false; }
    } else if (action === "claim-daily") {
      await run(() => store.claimDaily(), "Daily reward berhasil: +10 Sbooky Point!");
    } else if (action === "seed-books") {
      if(ui.seeding)return; ui.seeding=true;
      target.disabled=true;
      try { await store.seedBooks(); toast("Delapan buku awal sudah tersedia di Firestore. Isi stok sesuai buku di perpustakaan."); }
      catch(error) { toast(message(error),true); }
      finally { ui.seeding=false; target.disabled=false; scheduleRender(); }
    }
    else if (action === "add-book") bookForm();
    else if (action === "edit-book") bookForm(id);
    else if (action === "manage-points") pointForm(id);
    else if (action === "borrowers") { ui.adminTab = "loans"; ui.borrowerBook = id; scheduleRender(); }
    else if (action === "clear-borrower-filter") { ui.borrowerBook = null; scheduleRender(); }
    else if (action === "return") {
      const loan = data.loans.find(l => l.id === id); if (!loan || !isAdmin()) return;
      showDialog(`<small class="eyebrow">PENGEMBALIAN BUKU</small><h2 id="dialogTitle">Buku sudah diterima?</h2><p><b>${esc(loan.title)}</b><br>${esc(loan.name)} · NIS ${esc(loan.nis)}</p><p>Konfirmasi setelah buku fisik diserahkan ke perpustakaan. Stok bertambah satu dan kuota siswa dipulihkan.</p><p id="formError" class="form-error" role="alert"></p><button class="button primary full" data-action="confirm-return" data-id="${esc(id)}">Ya, buku sudah diterima</button>`, "return");
    } else if (action === "confirm-return") run(() => store.returnLoan(id), "Pengembalian tercatat. Stok dan kuota siswa telah diperbarui.");
    else if (action === "donate") donateForm();
    else if (action === "file-remove") { ui.donationFiles.splice(Number(id), 1); updateFileList(); }
    else if (action === "file-up") { const i = Number(id); if (i > 0) [ui.donationFiles[i - 1], ui.donationFiles[i]] = [ui.donationFiles[i], ui.donationFiles[i - 1]]; updateFileList(); }
    else if (action === "finish-donation") run(() => store.finishDonation(id), "Unggahan lengkap dan telah dikirim ke admin.", { close: false });
    else if (action === "review") reviewForm(id);
    else if (action === "preview-donation") showComingSoon("Pratinjau PDF donasi", "sbmissionbook");
    else if (action === "read-book") showComingSoon("Baca PDF donasi", "sbmissionbook");
    else if (action === "reader-next" && ui.readerPage < ui.readerFiles.length - 1) { ui.readerPage++; renderReaderPage(); }
    else if (action === "reader-prev" && ui.readerPage > 0) { ui.readerPage--; renderReaderPage(); }
    else if (action === "reader-retry") renderReaderPage();
    else if (action === "more") { ui.limit += 24; scheduleRender(); }
  });
  document.addEventListener("change", event => {
    if (!["donationUpload", "cameraUpload"].includes(event.target.id)) return;
    const selected = [...ui.donationFiles, ...event.target.files];
    try { C.validateFiles(selected); ui.donationFiles = selected; $("formError").textContent = ""; updateFileList(); }
    catch (error) { $("formError").textContent = error.message; }
    event.target.value = "";
  });
  $("searchInput").addEventListener("input", event => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { ui.search = event.target.value.trim(); ui.limit = 24; scheduleRender(); }, 150); });
  $("sortInput").addEventListener("change", event => { ui.sort = event.target.value; scheduleRender(); });
  $("menuButton").onclick = () => menu(true); $("closeMenu").onclick = $("menuOverlay").onclick = () => menu(false);
  $("dialogClose").onclick = closeDialog;
  $("dialog").addEventListener("cancel", event => { event.preventDefault(); closeDialog(); });
  $("dialog").addEventListener("click", event => { if (event.target === $("dialog")) { const rect = $("dialog").getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  addEventListener("hashchange", () => navigate(location.hash.slice(1)));
  addEventListener("offline", () => { if (store?.mode === "firebase") { $("connectionLabel").textContent = "Koneksi terputus"; toast("Internet terputus. Peminjaman dan unggahan memerlukan koneksi.", true); } });
  addEventListener("online", () => { if (store?.mode === "firebase") $("connectionLabel").textContent = "Firebase · mencoba sinkronisasi"; });
  setInterval(() => {
    if (document.visibilityState === "visible" && signedIn() && !isAdmin() && store?.addReadingTime) store.addReadingTime(60).catch(() => {});
  }, 60000);
  function connectionError(error) {
    connectionIssue = message(error);
    $("connectionLabel").textContent = "Firebase belum siap";
    if (ui.dialogType === "auth" && $("formError")) $("formError").textContent = connectionIssue;
  }
  async function ensureStore() {
    if (store) return store;
    if (!connectionAttempt) {
      connectionAttempt = (async () => {
        C.assert(["demo", "firebase"].includes(window.SBOOKY_CONFIG?.mode), "Pilih mode demo atau firebase di config.js.");
        $("connectionLabel").textContent = "Menyiapkan Firebase…";
        const result = window.SBOOKY_CONFIG.mode === "firebase"
          ? await window.createFirebaseStore(window.SBOOKY_CONFIG, onData, connectionError)
          : await window.createDemoStore(onData);
        store = result;
        $("connectionLabel").textContent = result.mode === "demo" ? "Demo · perangkat ini" : "Firebase · katalog siap";
        connectionIssue = null;
        if (result.mode === "demo") {
          $("modeNotice").hidden = false;
          $("modeNotice").textContent = "MODE DEMO — akun dan stok contoh hanya tersimpan di browser ini.";
        }
        scheduleRender();
        return result;
      })();
      // Retain an unfinished attempt: retries never create duplicate listeners.
      connectionAttempt.catch(() => { connectionAttempt = null; });
    }
    let timer;
    try {
      return await Promise.race([connectionAttempt, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Firebase belum selesai disiapkan. Koleksi tetap bisa dilihat. Coba koneksi lagi atau buka ulang melalui Live Server.")), 12000);
      })]);
    } finally { clearTimeout(timer); }
  }
  function start() {
    loadImage($("schoolLogo"), "wihope");
    hydrateImages($("sidebar"));
    render();
    try { localStorage.removeItem("sbooky-user"); localStorage.removeItem("sbooky-history"); } catch { /* Private browser mode. */ }
    if (location.hash) navigate(location.hash.slice(1));
    ensureStore().catch(connectionError);
  }
  start();
})();
