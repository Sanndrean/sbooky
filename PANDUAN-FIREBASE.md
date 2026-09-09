# Sbooky — lanjut dari Firestore yang sudah kamu buat

Proyek kamu: **sbooky-1**. Konfigurasi Web sudah terisi di `config.js`.
Kamu sudah membuat proyek, aplikasi Web, mengaktifkan Email/Password, dan membuat Firestore. Tidak perlu mengulang langkah-langkah tersebut.

**Versi terbaru ini memakai Firebase Spark:** login, profil/NIS, likes, admin, stok dan peminjaman fisik menggunakan Authentication + Firestore langsung, dalam kuota gratis Firebase. Tidak perlu terminal, Node.js, private key, Cloud Functions, atau Storage untuk fitur-fitur tersebut.

**Storage boleh dilewati.** Firebase meminta Blaze untuk upload PDF/foto. Donasi digital di versi Spark menampilkan penjelasan bahwa upload belum aktif; aplikasi tidak mengaku mengunggah/menyimpan berkas. Untuk mengaktifkannya nanti, ada PANDUAN-BLAZE-OPSIONAL.md yang terpisah.

Cara termudah membaca panduan: buka **SETUP-FIREBASE.html** dari folder hasil ekstrak. Ada tombol **Salin Rules** di sana.

## 1. Pasang Rules yang BENAR

1. Ekstrak ZIP terbaru ke folder baru. Jangan memakai Rules dari ZIP versi sebelumnya.
2. Di VS Code buka file **FIRESTORE-RULES.txt** yang sejajar dengan `index.html`.
3. Klik isi file → **Ctrl+A → Ctrl+C**. Salin SELURUH isinya, dari `rules_version` sampai kurung tutup terakhir.
4. Di Firebase Console, pilih proyek **sbooky-1**.
5. Klik **Firestore Database → Rules**.
6. Klik area kode Rules → **Ctrl+A → Ctrl+V**, sehingga semua aturan lama diganti dengan isi file tadi.
7. Klik **Publish / Publikasikan**. Tunggu sampai berhasil dan tidak ada pesan error merah.

Bisa juga klik tombol **Salin Rules** pada SETUP-FIREBASE.html lalu langsung tempel di Console. Isi yang disalin sama persis dengan `FIRESTORE-RULES.txt`.

Jangan menambahkan Rules baru di bawah aturan lama. Jangan mengubahnya menjadi `allow read, write: if true`. Aturan paket ini sudah memeriksa identitas, stok dan batas 10 pinjaman di Firebase.

## 2. Buat akun login admin di Authentication

1. Firebase Console → **Authentication → Users**.
2. Klik **Add user / Tambah pengguna**.
3. Isi email dan password sesuai tabel berikut, lalu simpan.
4. Ulangi sampai kelima akun dibuat.

| Nama untuk login di Sbooky | Email yang dimasukkan di Firebase | Password awal |
|---|---|---|
| SAdmin | sadmin@admins.sbooky.invalid | ongko123 |
| OAdmin | oadmin@admins.sbooky.invalid | ongko123 |
| JAdmin | jadmin@admins.sbooky.invalid | ongko123 |
| GAdmin | gadmin@admins.sbooky.invalid | ongko123 |
| AdminU | adminu@admins.sbooky.invalid | ongko123 |

Alamat di atas adalah identitas internal login, bukan kotak email. Tidak perlu membuat Gmail baru. Password diisi di Authentication, bukan di dokumen Firestore.

Jika email sudah ada di daftar Users, gunakan akun/UID yang sudah ada; jangan membuat duplikat. Password yang berlaku adalah password saat akun tersebut dibuat.

## 3. Berikan hak admin memakai UID

Akun pada langkah 2 belum otomatis punya izin admin. Kamu perlu memberi akses melalui Firestore Console.

Lakukan untuk **SAdmin** dulu:

1. Di **Authentication → Users**, cari `sadmin@admins.sbooky.invalid`.
2. Salin **User UID / UID** akun itu. UID berupa deretan huruf/angka yang dibuat Firebase; bukan email dan bukan tulisan SAdmin.
3. Buka **Firestore Database → Data**.
4. Klik **Start collection / Mulai koleksi**.
5. Isi **Collection ID** dengan **adminAccess**. Huruf A pada Access harus besar. Klik **Next**.
6. Pada **Document ID**, tempel UID SAdmin yang tadi kamu salin.
7. Tambahkan satu field persis seperti tabel ini:

| Field | Type | Value |
|---|---|---|
| name | string | SAdmin |

8. Klik **Save**.

Lakukan lagi untuk OAdmin, JAdmin, GAdmin, dan AdminU. Koleksi `adminAccess` cukup dibuat SATU KALI. Untuk akun berikutnya buka koleksi tersebut → **Add document**, tempel UID akun yang sesuai, lalu tambah field `name` dengan nilainya.

| Document ID | Field | Type | Value |
|---|---|---|---|
| UID akun sadmin@admins.sbooky.invalid | name | string | SAdmin |
| UID akun oadmin@admins.sbooky.invalid | name | string | OAdmin |
| UID akun jadmin@admins.sbooky.invalid | name | string | JAdmin |
| UID akun gadmin@admins.sbooky.invalid | name | string | GAdmin |
| UID akun adminu@admins.sbooky.invalid | name | string | AdminU |

**Jangan mengetik tulisan “UID akun …” di Document ID.** Tempel UID asli dari Authentication. Nama field tetap `name`, sedangkan nilainya mengikuti nama admin. Jangan gunakan Auto-ID.

Website tidak dapat menulis/membuat `adminAccess`; hanya pengelola lewat Console. Dengan begitu siswa tidak bisa mengangkat dirinya menjadi admin.

## 4. Buka website dan masuk admin

1. Buka folder hasil ekstrak terbaru di VS Code.
2. Klik kanan **index.html → Open with Live Server**.
3. Klik **Masuk → Admin**.
4. Isi nama **SAdmin** dan password **ongko123** (sesuai akun yang dibuat).
5. Dashboard admin terbuka. Profil admin di `users` dibuat otomatis saat pertama login.

Jika sedang login sebagai siswa, klik tombol profil lalu **Keluar dari akun** dahulu. `admin.html` juga bisa dibuka lewat Live Server sebagai pintu masuk dashboard.

Saat Firebase sudah menyimpan sesi lama, lakukan logout dan login ulang setelah perubahan hak admin. Jika perlu tekan Ctrl+F5 untuk memuat JavaScript versi baru.

## 5. Hubungkan buku lama: Juki, Matematika, dan lainnya

Pada dashboard admin → tab **Buku & stok** → klik **Simpan 8 buku awal**.

Tombol ini menyimpan delapan buku lama ke koleksi `books` di Firestore. Buku yang sudah tersimpan tidak ditimpa. Tidak perlu mengisi delapan dokumen satu per satu.

| ID buku / Document ID | Nama buku | File sampul |
|---|---|---|
| 1 | Perahu Kertas | file1 |
| 2 | Si Juki: Komik Strip | file2 |
| 3 | Matematika | file3 |
| 4 | The New Girl's Secret | file4 |
| 5 | Romansa Romantika Masa SMA | file5 |
| 6 | Ensiklopedia Sains | file6 |
| 7 | Misteri Buku L/G | file7 |
| 8 | Kebudayaan di Nusantara | file8 |

Stok awal Firebase adalah **0**. Klik **Edit buku & stok**, isi jumlah buku sebenarnya, lalu simpan. Misalnya ada 4 Si Juki, isi stok total 4. Angka peminjam dan stok tersedia akan dihitung dari transaksi.

Sebelum disimpan, delapan buku tetap ditampilkan dengan label **Belum diaktifkan**, supaya katalog lama tidak hilang. Siswa baru bisa meminjam setelah admin menyimpan dan mengisi stoknya.

## 6. Salin sampul dan logo yang sudah ada di komputermu

Salin `file1` sampai `file8` dari folder lamamu langsung ke folder utama versi baru, sejajar dengan `index.html`. JPEG/JPG/PNG/WEBP didukung, termasuk ekstensi huruf besar.

Contoh: `file2.jpg` untuk Si Juki, `file3.png` untuk Matematika.

Salin juga `wihope` untuk logo sekolah. Logo Sbooky yang dibuat sebelumnya sudah disertakan sebagai `logo.png`.

Jangan mengganti file sampul dengan screenshot halaman web. Paket ini berisi hubungan nama file dan data buku, tetapi tidak memuat sampul asli yang masih ada di PC-mu. Jika gambar belum muncul, cek namanya dan tekan Ctrl+F5. Pastikan tidak ada ekstensi ganda seperti `file3.jpg.jpg`.

Penulis/judul/kategori bisa diubah dari **Admin → Buku & stok → Edit buku & stok**. Buku tambahan tetap bisa memakai `file9`, `file10` dan seterusnya; isi Nama file sampul sesuai file yang kamu salin.

## 7. Pastikan NIS benar-benar tersimpan

1. Logout admin.
2. Klik **Masuk → Daftar siswa**.
3. Isi nama lengkap, NIS, dan password. NIS terdiri dari 4–20 angka; nol di depan tetap disimpan.
4. Setelah berhasil, buka **Firebase Console → Firestore Database → Data**.
5. Koleksi **users** akan muncul. Buka dokumen siswa: harus ada field **nis**, **name**, dan **role: student**.

Di **Authentication → Users**, kamu juga akan melihat identitas seperti `001234@students.sbooky.invalid`. Email internal ini adalah akun login; dokumen `users` adalah profil/NIS. Jadi melihat akun di Authentication saja belum membuktikan profil di Firestore telah tersimpan.

Kalau sudah pernah mencoba daftar sebelumnya, pilih **Masuk siswa** menggunakan NIS dan password lama. Jika muncul **Lengkapi profil**, isi nama lalu simpan. Jangan mendaftarkan ulang NIS yang sudah ada.

## 8. Coba pinjam dan kembalikan buku

1. Pastikan admin telah mengisi stok salah satu buku lebih dari 0.
2. Masuk siswa → Buku Offline → pilih buku → **Pinjam 1 buku**.
3. Cek **Pinjaman Saya**. Stok tersedia berkurang satu.
4. Masuk admin → Buku & stok → klik angka **peminjam aktif** pada buku itu untuk melihat nama dan NIS siswa.
5. Setelah buku diserahkan kembali ke petugas, buka **Peminjaman → Terima pengembalian → Ya, buku sudah diterima**.
6. Stok tersedia bertambah satu dan kuota siswa dipulihkan.

Maksimal 10 pinjaman aktif per siswa, satu eksemplar per judul. Rules menolak pinjaman jika stok habis atau kuota penuh, termasuk jika seseorang mencoba melewati pemeriksaan tombol di browser. Logout menghapus riwayat membaca, tetapi tidak menghapus pinjaman resmi.

## 9. Yang belum aktif tanpa Storage

Donasi PDF/scan dan pembacaan berkas dari Firebase Storage belum aktif pada konfigurasi Spark ini. Tidak perlu upgrade untuk login, menyimpan NIS, melihat sampul lokal, mengelola admin/stok atau meminjam buku fisik. Buku fisik tanpa versi digital tetap menampilkan sampul dan **Coming Soon**.

Firebase Spark memiliki kuota penggunaan gratis, bukan kapasitas tak terbatas. Upload Storage memerlukan Blaze. Rujukan: https://firebase.google.com/docs/firestore/quotas dan https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024.

## Jika ada error

| Masalah | Periksa |
|---|---|
| Missing or insufficient permissions / Akses ditolak | Pastikan SELURUH FIRESTORE-RULES.txt versi terbaru sudah mengganti Rules lama dan klik Publish. |
| Login admin salah | Email di Authentication harus persis tabel. Gunakan password saat akun dibuat. Pilih tab Admin saat login Sbooky. |
| Hak admin belum dipasang | adminAccess / Document ID harus UID yang cocok dengan akun login; field name bertipe string dan bernilai SAdmin/OAdmin/dst. |
| NIS sudah terdaftar | Gunakan Masuk siswa, lalu Lengkapi profil bila diminta. |
| Buku ada tetapi belum bisa dipinjam | Admin klik Simpan 8 buku awal lalu isi stok nyata. |
| Sampul tidak ada | Salin gambar asli file1–file8 ke images dalam folder ZIP baru, cek ekstensi, Ctrl+F5. |
| Firebase meminta upgrade Storage | Lewati Storage. Versi gratis tidak memakai Storage untuk NIS dan buku fisik. |

## Catatan pengujian

`tests/spark.cjs` menguji alur Firestore langsung dan Security Rules dalam emulator. Untuk pengembang yang ingin menjalankan ulang (bukan langkah wajib pengguna):

```sh
npm install --prefix tests
npx --prefix tests firebase emulators:exec --project demo-sbooky-spark --only firestore "node --test tests/spark.cjs"
```

Gunakan Node.js 22 dan Java 21 untuk emulator terbaru. File tes versi Blaze terpisah dan tidak menjadi langkah pemasangan versi gratis ini.
