import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { showSuccess, showError, showWarning, showInput } from "./popup-utils.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBLh8hwA1_asveSxisiZyRMbi-So7t1rE0",
  authDomain: "medical-triage-system-5685f.firebaseapp.com",
  projectId: "medical-triage-system-5685f",
  storageBucket: "medical-triage-system-5685f.firebasestorage.app",
  messagingSenderId: "1043408410847",
  appId: "1:1043408410847:web:9ebdf47a2d02af006bb16a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const emailEl = document.getElementById('email');
const passEl = document.getElementById('password');
const roleEl = document.getElementById('role');
const loginBtn = document.getElementById('loginBtn');
const forgotLink = document.getElementById('forgotLink');
const registerLink = document.getElementById('registerLink');

loginBtn.addEventListener('click', onLogin);
forgotLink.addEventListener('click', onForgot);
registerLink.addEventListener('click', () => window.location.href = 'staff-register.html');

async function onLogin(){
  const email = emailEl.value.trim();
  const password = passEl.value.trim();
  const role = roleEl.value;

  if(!email || !password){
    await showWarning('Missing Fields', 'Please enter both email and password.');
    return;
  }

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in...';

  try{
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const staffRef = doc(db, 'staff', cred.user.uid);
    const snap = await getDoc(staffRef);
    
    if(!snap.exists()){
      await showError('Unauthorized', 'No staff profile found. Ask admin to register you.');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
      return;
    }
    
    const data = snap.data();
    if(data.role !== role){
      await showError('Role mismatch', `You are registered as <b>${data.role}</b>. Choose correct role.`);
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
      return;
    }

    // Save session
    localStorage.setItem('staffUID', cred.user.uid);
    localStorage.setItem('staffRole', role);

    // Show success with autoClose
    await showSuccess('Welcome', 'Login successful. Redirecting...', {
      autoClose: true,
      timeout: 1000
    });

    // Redirect after delay
    setTimeout(() => {
      window.location.replace('index.html');
    }, 1000);

  } catch(err){
    await showError('Sign-in failed', err.message);
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
}

async function onForgot(){
  const emailVal = emailEl.value.trim();
  let emailToUse = emailVal;
  
  if(!emailToUse){
    // Ask via popup input
    const val = await showInput('Reset password', 'Enter your registered email', 'your-email@example.com');
    if(!val) return;
    emailToUse = val;
  }
  
  try{
    await sendPasswordResetEmail(auth, emailToUse);
    await showSuccess('Reset sent', 'Check your inbox for password reset email.', {
      autoClose: true,
      timeout: 2000
    });
  } catch(err){
    await showError('Reset failed', err.message);
  }
}