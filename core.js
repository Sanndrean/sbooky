(function (root) {
  "use strict";
  const ADMIN_NAMES = ["SAdmin", "OAdmin", "JAdmin", "GAdmin", "AdminU"];
  const CATEGORIES = ["Novel", "Komik", "Buku Paket", "Fantasi", "Romance", "Sains", "Misteri", "Budaya", "Lainnya"];
  const MAX_LOANS = 10;
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  function assert(value, message) { if (!value) throw new Error(message); }
  function nis(value) {
    const clean = String(value || "").trim();
    assert(/^\d{4,20}$/.test(clean), "NIS harus berisi 4–20 angka.");
    return clean;
  }
  function available(book) { return Math.max(0, Number(book.stock || 0) - Number(book.borrowed || 0)); }
  function adminName(value) { return ADMIN_NAMES.find(name => name.toLowerCase() === String(value).trim().toLowerCase()); }
  function email(value, role) {
    if (role === "admin") { const name = adminName(value); assert(name, "Nama admin tidak terdaftar."); return name.toLowerCase() + "@admins.sbooky.invalid"; }
    return nis(value) + "@students.sbooky.invalid";
  }
  function bookFields(data) {
    const clean = {};
    for (const [key, max] of [["title", 180], ["author", 120], ["description", 2000]]) {
      clean[key] = String(data[key] || "").trim();
      assert(clean[key].length <= max && (key === "description" || clean[key].length > 0), "Judul/penulis wajib diisi dan tidak boleh terlalu panjang.");
    }
    assert(CATEGORIES.includes(data.category), "Pilih kategori yang tersedia.");
    clean.category = data.category;
    clean.imageName = String(data.imageName || "").trim();
    assert(!clean.imageName || /^[a-zA-Z0-9_-]{1,80}(\.(jpg|jpeg|png|webp))?$/i.test(clean.imageName), "Nama gambar: file1, file2, atau nama.jpg (tanpa folder).");
    return clean;
  }
  function validateFiles(files) {
    assert(files.length >= 1 && files.length <= 40, "Unggah 1 PDF atau 1–40 foto halaman.");
    assert(files.every(file => TYPES.includes(file.type) && Number.isSafeInteger(file.size) && file.size > 0), "Gunakan PDF, JPG, PNG, atau WEBP yang tidak kosong.");
    assert(!files.some(file => file.type === "application/pdf") || files.length === 1, "Pilih satu PDF, atau kumpulan foto halaman.");
    assert(files.reduce((sum, file) => sum + file.size, 0) <= MAX_FILE_BYTES, "Total berkas maksimal 25 MB.");
  }
  function uuid() { return crypto.randomUUID(); }
  const api = { ADMIN_NAMES, CATEGORIES, MAX_LOANS, MAX_FILE_BYTES, TYPES, assert, nis, available, adminName, email, bookFields, validateFiles, uuid };
  if (typeof module !== "undefined") module.exports = api;
  else root.SbookyCore = api;
})(typeof window === "undefined" ? globalThis : window);
