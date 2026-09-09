(function(root){
  'use strict';
  root.createFirebaseStore=async function(config,onChange,onError){
    if(config.backend==='blaze')return root.createBlazeStore(config,onChange,onError);
    const C=root.SbookyCore;
    C.assert(['apiKey','authDomain','projectId','appId'].every(k=>config.firebase[k]),'Konfigurasi belum lengkap.');
    C.assert(location.protocol!=='file:','Klik kanan index.html → Open with Live Server.');
    C.assert(root.SbookyFirebase, "Berkas firebase-sdk.js belum termuat. Upload semua file dari folder Sbooky ke GitHub, lalu muat ulang halaman.");
    const { appSDK, A, F, S, CF } = root.SbookyFirebase;
    const app=(appSDK.getApps().length ? appSDK.getApp() : appSDK.initializeApp(config.firebase)),auth=A.getAuth(app),db=F.getFirestore(app);
    if(config.useEmulators){
      C.assert(['localhost','127.0.0.1'].includes(location.hostname),'Emulator hanya untuk localhost.');
      A.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});F.connectFirestoreEmulator(db,'127.0.0.1',8080);
    }
    await A.setPersistence(auth,A.browserSessionPersistence);
    let state={user:null,books:[],loans:[],users:[],donations:[],admins:[],ratings:[],leaderboard:[],loading:true},stops=[],generation=0;
    const emit=()=>onChange({...state});
    const rows=snap=>snap.docs.map(d=>({id:d.id,...d.data()}));
    const error=e=>{state.loading=false;emit();onError(e);};
    const actions=root.createFirestoreActions(F,db,()=>auth.currentUser,C);
    const mergeBooks=remote=>{
      const map=new Map(remote.map(b=>[b.id,{...b,seedOnly:false}]));
      for(const b of root.SBOOKY_BOOKS)if(!map.has(b.id))map.set(b.id,{...b,stock:0,borrowed:0,seedOnly:true});
      return [...map.values()];
    };
    state.books=mergeBooks([]); state.loading=false; emit();
    F.onSnapshot(F.query(F.collection(db,'books'),F.where('published','==',true)),snap=>{state.books=mergeBooks(rows(snap));state.loading=false;emit();},error);
    F.onSnapshot(F.collection(db,'ratings'),snap=>{state.ratings=rows(snap);emit();},error);
    F.onSnapshot(F.collection(db,'leaderboard'),snap=>{state.leaderboard=rows(snap);emit();},error);
    async function adminName(user){
      const snap=await F.getDoc(F.doc(db,'adminAccess',user.uid));
      const name=snap.exists()?snap.data().name:null;
      return C.ADMIN_NAMES.includes(name)&&user.email===C.email(name,'admin')?name:null;
    }
    A.onAuthStateChanged(auth,async user=>{
      const current=++generation;stops.forEach(fn=>fn());stops=[];
      state={...state,user:null,loans:[],users:[],donations:[],admins:[]};emit();if(!user)return;
      try{
        const name=await adminName(user);if(current!==generation)return;
        if(name)await actions.ensureAdminProfile(name);if(current!==generation)return;
        const isAdmin=!!name;
        if(!isAdmin)await actions.ensureLeaderboard();if(current!==generation)return;
        stops.push(F.onSnapshot(F.doc(db,'users',user.uid),snap=>{
          if(current!==generation)return;
          state.user=snap.exists()?{...snap.data(),uid:user.uid,isAdmin}: {uid:user.uid,name:'Lengkapi profil',nis:user.email?.split('@')[0]||'',role:'incomplete',isAdmin:false,likes:[],activeCount:0};emit();
        },error));
        const watch=(key,q)=>stops.push(F.onSnapshot(q,snap=>{if(current===generation){state[key]=rows(snap);emit();}},error));
        watch('loans',isAdmin?F.collection(db,'loans'):F.query(F.collection(db,'loans'),F.where('uid','==',user.uid)));
        watch('donations',isAdmin?F.collection(db,'donations'):F.query(F.collection(db,'donations'),F.where('uid','==',user.uid)));
        if(isAdmin){watch('users',F.collection(db,'users'));watch('admins',F.collection(db,'adminAccess'));}
      }catch(e){if(current===generation)error(e);}
    },error);
    const storageUnavailable=async()=>{throw new Error('Upload PDF/foto belum aktif. Firebase Storage memerlukan Blaze. Buku fisik dan data NIS tetap dapat digunakan tanpa upgrade.');};
    return {
      ...actions,mode:'firebase',supportsUploads:false,
      async login({identity,password,role}){
        const credential=await A.signInWithEmailAndPassword(auth,C.email(identity,role),password);
        if(role==='admin'){
          const name=await adminName(credential.user);
          if(name!==C.adminName(identity)){await A.signOut(auth);throw new Error('Hak admin belum dipasang. Di Firestore buat adminAccess / UID akun ini, lalu isi field name sesuai nama admin. Ikuti panduan langkah 3.');}
          await actions.ensureAdminProfile(name);
        }
      },
      async register({nis,name,password}){
        const value=C.nis(nis);C.assert(password.length>=6,'Kata sandi minimal 6 karakter.');
        await A.createUserWithEmailAndPassword(auth,C.email(value,'student'),password);
        await actions.completeProfile({nis:value,name});
      },
      logout:()=>A.signOut(auth),
      seedBooks:()=>actions.seedBooks(root.SBOOKY_BOOKS),
      donate:storageUnavailable,finishDonation:storageUnavailable,reviewDonation:storageUnavailable,readFile:storageUnavailable,
      async changePassword(password){C.assert(password.length>=6,'Kata sandi minimal 6 karakter.');await A.updatePassword(auth.currentUser,password);}
    };
  };
})(window);
