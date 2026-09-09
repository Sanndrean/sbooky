/* DATA BUKU AWAL. Ubah title = judul, author = penulis, category = kategori.
   imageName: "file9" akan mencari file9.jpg/.png/.jpeg/.webp sejajar dengan index.html.
   Sesudah data dibuat di Firebase, edit lewat dashboard admin, bukan file ini.
   Stok pada mode demo hanya contoh. Inisialisasi Firebase memakai stok 0. */
(function (root) {
  const books = [
    { id: "1", title: "Perahu Kertas", author: "Dee Lestari", category: "Novel", imageName: "file1", color: "#315b78", stock: 5, description: "Novel tentang mimpi, persahabatan, dan perjalanan menemukan jalan hidup." },
    { id: "2", title: "Si Juki: Komik Strip", author: "Faza Meonk", category: "Komik", imageName: "file2", color: "#854d36", stock: 3, description: "Kumpulan cerita humor dan keseharian Si Juki dalam bentuk komik strip." },
    { id: "3", title: "Matematika", author: "Sovia Ningsy", category: "Buku Paket", imageName: "file3", color: "#66837c", stock: 12, description: "Buku pelajaran matematika dengan materi dan latihan untuk siswa." },
    { id: "4", title: "The New Girl's Secret", author: "Michelle Harrison", category: "Fantasi", imageName: "file4", color: "#126f62", stock: 4, description: "Cerita fantasi tentang seorang murid baru yang menyimpan sebuah rahasia." },
    { id: "5", title: "Romansa Romantika Masa SMA", author: "@waktusma", category: "Romance", imageName: "file5", color: "#8059a3", stock: 6, description: "Aku, Kamu, dan Kisah Kita—kumpulan kisah tentang masa putih abu-abu." },
    { id: "6", title: "Ensiklopedia Sains", author: "Kirsteen Rogers, dkk.", category: "Sains", imageName: "file6", color: "#32896b", stock: 4, description: "Bacaan sains dengan ilustrasi untuk memperluas pengetahuan." },
    { id: "7", title: "Misteri Buku L/G", author: "Josua Tarida Panjaitan", category: "Misteri", imageName: "file7", color: "#4d5962", stock: 2, description: "Petualangan memecahkan teka-teki dan rahasia yang tersimpan dalam sebuah buku." },
    { id: "8", title: "Kebudayaan di Nusantara", author: "Edi Sedyawati", category: "Budaya", imageName: "file8", color: "#ba6439", stock: 5, description: "Pembahasan kebudayaan Nusantara, dari keris dan Tor-tor sampai industri budaya." }
  ].map(book => ({ ...book, type: "offline", borrowed: 0, published: true }));
  if (typeof module !== "undefined") module.exports = books;
  else root.SBOOKY_BOOKS = books;
})(typeof window === "undefined" ? globalThis : window);
