/* Transaksi Firestore untuk versi Spark. Keamanan juga diperiksa oleh
   FIRESTORE-RULES.txt, bukan hanya tombol/validasi di browser. */
(function(root) {
  'use strict';
  function createActions(F, db, getUser, C) {
    const doc = (type, id) => F.doc(db, type, id);
    const needUser = () => { const u = getUser(); C.assert(u, 'Masuk dahulu.'); return u; };
    const month = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
    const metric = (data,key) => Math.max(0,Number(data?.[key]||0));
    const board = (uid,user,overrides={}) => ({uid,name:user.name,points:metric(user,'points'),totalBorrows:metric(user,'totalBorrows'),readingSeconds:metric(user,'readingSeconds'),updatedAt:Date.now(),...overrides});
    async function completeProfile({nis, name}) {
      const u = needUser(), value = C.nis(nis), clean = String(name || '').trim();
      C.assert(clean.length >= 2 && clean.length <= 100, 'Nama lengkap harus 2–100 karakter.');
      C.assert(u.email === C.email(value, 'student'), 'NIS tidak cocok dengan akun ini.');
      const userRef = doc('users',u.uid);
      await F.runTransaction(db, async tx => {
        const existing = await tx.get(userRef);
        if (existing.exists()) return;
        const profile={uid:u.uid,name:clean,nis:value,role:'student',activeLoans:{},activeCount:0,lastLoanId:'',likes:[],createdAt:Date.now(),points:0,totalBorrows:0,totalReturns:0,readingSeconds:0,lastSeenAt:0,lastDailyClaimAt:0,dailyStreak:0,missionMonth:month(),monthBorrows:0,monthReturns:0,monthLoginDays:0};
        tx.set(userRef,profile);tx.set(doc('leaderboard',u.uid),board(u.uid,profile));
      });
    }
    async function ensureAdminProfile(name) {
      const u=needUser(), userRef=doc('users',u.uid);
      await F.runTransaction(db,async tx=>{
        const snap=await tx.get(userRef);
        if(snap.exists()) return;
        tx.set(userRef,{uid:u.uid,name,adminName:name,nis:null,role:'admin',activeLoans:{},activeCount:0,lastLoanId:'',likes:[],createdAt:Date.now(),points:0,totalBorrows:0,totalReturns:0,readingSeconds:0,lastSeenAt:0,lastDailyClaimAt:0,dailyStreak:0,missionMonth:month(),monthBorrows:0,monthReturns:0,monthLoginDays:0});
      });
    }
    async function ensureLeaderboard() {
      const u=needUser(),ur=doc('users',u.uid),lr=doc('leaderboard',u.uid);
      await F.runTransaction(db,async tx=>{const [us,ls]=await Promise.all([tx.get(ur),tx.get(lr)]);if(!us.exists()||us.data().role!=='student'||ls.exists())return;tx.set(lr,board(u.uid,us.data()));});
    }
    async function borrow(bookId, requestId) {
      const u=needUser(), ur=doc('users',u.uid),br=doc('books',bookId),lr=doc('loans',requestId);
      return F.runTransaction(db,async tx=>{
        const [us,bs,ls]=await Promise.all([tx.get(ur),tx.get(br),tx.get(lr)]);
        if(ls.exists()){C.assert(ls.data().uid===u.uid&&ls.data().bookId===bookId,'Nomor transaksi tidak cocok.');return {id:requestId,...ls.data()};}
        C.assert(us.exists()&&us.data().role==='student','Lengkapi profil siswa sebelum meminjam.');
        C.assert(bs.exists()&&bs.data().type==='offline'&&bs.data().published,'Buku belum disimpan admin.');
        const user=us.data(),book=bs.data(),active=user.activeLoans||{},currentMonth=month(),sameMonth=user.missionMonth===currentMonth;
        C.assert(user.activeCount===Object.keys(active).length,'Data pinjaman perlu diperiksa admin.');
        C.assert(Object.keys(active).length<10,'Batas 10 buku tercapai. Kembalikan satu buku dahulu.');
        C.assert(!active[bookId],'Kamu masih meminjam judul ini.');
        C.assert(C.available(book)>0,'Stok buku habis.');
        const loan={uid:u.uid,nis:user.nis,name:user.name,bookId,title:book.title,author:book.author,status:'active',borrowedAt:Date.now(),returnedAt:null,returnedBy:null};
        tx.set(lr,loan);
        const nextPoints=metric(user,'points')+2,nextBorrows=metric(user,'totalBorrows')+1;
        tx.update(ur,{activeLoans:{...active,[bookId]:requestId},activeCount:user.activeCount+1,lastLoanId:requestId,points:nextPoints,totalBorrows:nextBorrows,missionMonth:currentMonth,monthBorrows:(sameMonth?metric(user,'monthBorrows'):0)+1,...(sameMonth?{}:{monthReturns:0,monthLoginDays:0})});
        tx.set(doc('leaderboard',u.uid),board(u.uid,user,{points:nextPoints,totalBorrows:nextBorrows}),{merge:true});
        tx.update(br,{borrowed:book.borrowed+1,lastLoanId:requestId,updatedAt:Date.now()});
        return {id:requestId,...loan};
      });
    }
    async function returnLoan(loanId) {
      const u=needUser(),lr=doc('loans',loanId);
      await F.runTransaction(db,async tx=>{
        const ls=await tx.get(lr);C.assert(ls.exists(),'Pinjaman tidak ditemukan.');
        const loan=ls.data();if(loan.status==='returned')return;
        const br=doc('books',loan.bookId),ur=doc('users',loan.uid);
        const [bs,us]=await Promise.all([tx.get(br),tx.get(ur)]);
        C.assert(bs.exists()&&us.exists(),'Data buku/siswa tidak lengkap.');
        const book=bs.data(),user=us.data(),active={...user.activeLoans};
        C.assert(active[loan.bookId]===loanId&&book.borrowed>0&&user.activeCount>0,'Data pinjaman tidak konsisten.');
        delete active[loan.bookId];
        const currentMonth=month(),sameMonth=user.missionMonth===currentMonth,nextPoints=metric(user,'points')+5;
        tx.update(lr,{status:'returned',returnedAt:Date.now(),returnedBy:u.uid,returnedByName:C.adminName(u.email?.split('@')[0])||'Admin'});
        tx.update(br,{borrowed:book.borrowed-1,lastLoanId:loanId,updatedAt:Date.now()});
        tx.update(ur,{activeLoans:active,activeCount:user.activeCount-1,lastLoanId:loanId,points:nextPoints,totalReturns:metric(user,'totalReturns')+1,missionMonth:currentMonth,monthReturns:(sameMonth?metric(user,'monthReturns'):0)+1,...(sameMonth?{}:{monthBorrows:0,monthLoginDays:0})});
        tx.set(doc('leaderboard',loan.uid),board(loan.uid,user,{points:nextPoints}),{merge:true});
      });
    }
    async function saveBook(data) {
      needUser();const fields=C.bookFields(data),br=doc('books',data.id);
      C.assert(Number.isInteger(data.stock)&&data.stock>=0&&data.stock<=100000,'Stok harus angka bulat 0–100.000.');
      await F.runTransaction(db,async tx=>{
        const old=await tx.get(br),book=old.exists()?old.data():null;
        C.assert(!book||book.type==='offline','Buku ini bukan buku fisik.');
        C.assert(data.stock>=(book?.borrowed||0),'Stok total tidak boleh kurang dari jumlah yang dipinjam.');
        tx.set(br,{...fields,type:'offline',stock:data.stock,borrowed:book?.borrowed||0,published:true,color:book?.color||'#25664b',updatedAt:Date.now(),lastLoanId:book?.lastLoanId||''});
      });
    }
    async function seedBooks(books) {
      needUser();let count=0;
      for(const b of books){
        const br=doc('books',b.id);
        await F.runTransaction(db,async tx=>{
          const old=await tx.get(br);if(old.exists())return;
          const {id,...book}=b;
          tx.set(br,{...book,stock:0,borrowed:0,lastLoanId:'',updatedAt:Date.now()});count++;
        });
      }
      return count;
    }
    async function like(bookId,liked) {
      const u=needUser();await F.updateDoc(doc('users',u.uid),{likes:liked?F.arrayUnion(bookId):F.arrayRemove(bookId)});
    }
    async function rateBook(bookId,score) {
      const u=needUser();C.assert(Number.isInteger(score)&&score>=1&&score<=5,'Pilih rating 1–5 bintang.');
      await F.setDoc(doc('ratings',`${u.uid}_${bookId}`),{uid:u.uid,bookId,score,updatedAt:Date.now()},{merge:true});
    }
    async function claimDaily() {
      const u=needUser(),ur=doc('users',u.uid),now=Date.now(),currentMonth=month();
      await F.runTransaction(db,async tx=>{const us=await tx.get(ur);C.assert(us.exists()&&us.data().role==='student','Hadiah harian khusus siswa.');const user=us.data(),last=metric(user,'lastDailyClaimAt');C.assert(!last||now-last>=20*60*60*1000,'Hadiah harian sudah diambil. Coba lagi besok.');const nextPoints=metric(user,'points')+10,sameMonth=user.missionMonth===currentMonth;tx.update(ur,{points:nextPoints,lastDailyClaimAt:now,dailyStreak:last&&now-last<48*60*60*1000?metric(user,'dailyStreak')+1:1,missionMonth:currentMonth,monthLoginDays:(sameMonth?metric(user,'monthLoginDays'):0)+1,...(sameMonth?{}:{monthBorrows:0,monthReturns:0})});tx.set(doc('leaderboard',u.uid),board(u.uid,user,{points:nextPoints}),{merge:true});});
    }
    async function addReadingTime(seconds) {
      const u=needUser();seconds=Math.round(seconds);C.assert(seconds>=1&&seconds<=120,'Durasi aktivitas tidak valid.');const ur=doc('users',u.uid),now=Date.now();
      await F.runTransaction(db,async tx=>{const us=await tx.get(ur);if(!us.exists()||us.data().role!=='student')return;const user=us.data(),readingSeconds=metric(user,'readingSeconds')+seconds;tx.update(ur,{readingSeconds,lastSeenAt:now});tx.set(doc('leaderboard',u.uid),board(u.uid,user,{readingSeconds}),{merge:true});});
    }
    async function adjustPoints(uid,amount,reason='') {
      needUser();C.assert(Number.isInteger(amount)&&amount!==0&&amount>=-1000&&amount<=1000,'Isi perubahan point antara -1000 sampai 1000.');const ur=doc('users',uid),now=Date.now();
      await F.runTransaction(db,async tx=>{const us=await tx.get(ur);C.assert(us.exists()&&us.data().role==='student','Siswa tidak ditemukan.');const user=us.data(),points=Math.max(0,metric(user,'points')+amount);tx.update(ur,{points,pointUpdatedAt:now,pointNote:String(reason||'').trim().slice(0,120)});tx.set(doc('leaderboard',uid),board(uid,user,{points}),{merge:true});});
    }
    return {completeProfile,ensureAdminProfile,ensureLeaderboard,borrow,returnLoan,saveBook,seedBooks,like,rateBook,claimDaily,addReadingTime,adjustPoints};
  }
  if(typeof module!=='undefined')module.exports=createActions;else root.createFirestoreActions=createActions;
})(typeof window==='undefined'?globalThis:window);
