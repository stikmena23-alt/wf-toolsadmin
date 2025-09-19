/************* CONFIG *************/
const SUPABASE_URL = 'https://htkwcjhcuqyepclpmpsv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0a3djamhjdXF5ZXBjbHBtcHN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5MTk4MTgsImV4cCI6MjA3MzQ5NTgxOH0.dBeJjYm12YW27LqIxon5ifPR1ygfFXAHVg8ZuCZCEf8';
const ADMIN_EMAIL = 'stikmena6@gmail.com';
const FUNCTIONS_BASE = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');

// ✅ Ruta del LOGO (PNG) para el UI
const LOGO_URL = './WF TOOLS.png';

const ENDPOINTS = {
  list: 'admin-list',
  update: 'admin-update',
  recovery: 'admin-recovery',
  setPassword: 'admin-setpassword',
};

/************* STATE *************/
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let page = 1; const perPage = 10; let currentRows = []; let currentEdit = null;

const qs = sel => document.querySelector(sel);
const $rows = qs('#rows'), $cards = qs('#cards'), $empty = qs('#empty'), $skeleton = qs('#skeleton');
const loginView = qs('#loginView'), adminView = qs('#adminView'), loginError = qs('#loginError');
const btnLogin = qs('#btnLogin'), btnLoginText = btnLogin.querySelector('.btn-text'), btnLoginSpinner = btnLogin.querySelector('.btn-spinner');
const emailInput = qs('#email');
const passwordInput = qs('#password');
const rememberCheck = qs('#rememberUser');
const togglePasswordBtn = qs('#togglePassword');
const togglePasswordText = togglePasswordBtn?.querySelector('.toggle-text');
const togglePasswordIcon = togglePasswordBtn?.querySelector('.icon');
const $overlay = qs('#overlay');
const $creditSummary = qs('#creditSummary');
const sessionOverlay = qs('#sessionOverlay');
const sessionMessage = sessionOverlay?.querySelector('.session-message');
const numberFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const averageFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const REMEMBER_KEY = 'wf-toolsadmin:remembered-email';

// Inyectar logo en login y header
qs('#loginLogo').src = LOGO_URL;
qs('#headerLogo').src = LOGO_URL;

function rememberEmail(value){
  try {
    const trimmed = (value || '').trim();
    if(rememberCheck?.checked && trimmed){
      localStorage.setItem(REMEMBER_KEY, trimmed);
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }
  } catch(err){
    console.warn('No se pudo recordar el correo', err);
  }
}

function loadRememberedEmail(){
  if(!emailInput || !rememberCheck) return;
  try {
    const stored = localStorage.getItem(REMEMBER_KEY);
    if(stored){
      emailInput.value = stored;
      rememberCheck.checked = true;
    }
  } catch(err){
    console.warn('No se pudo cargar el correo recordado', err);
  }
}

/************* UI HELPERS *************/
function show(v){
  if(!v) return;
  if(v.classList && v.classList.contains('view')){
    const desired = v.dataset.display || 'block';
    v.style.display = desired;
    requestAnimationFrame(()=> v.classList.add('active'));
  } else {
    v.style.display='block';
  }
}
function hide(v){
  if(!v) return;
  if(v.classList && v.classList.contains('view')){
    v.classList.remove('active');
    setTimeout(()=>{ v.style.display='none'; }, 220);
  } else {
    v.style.display='none';
  }
}
function overlay(on){ $overlay.classList.toggle('show', !!on); }
function sessionLoading(on, text='Gestionando sesión…'){
  if(!sessionOverlay) return;
  if(on){
    if(sessionMessage) sessionMessage.textContent = text;
    sessionOverlay.style.display='flex';
    requestAnimationFrame(()=> sessionOverlay.classList.add('show'));
  } else {
    sessionOverlay.classList.remove('show');
    setTimeout(()=>{
      sessionOverlay.style.display='none';
      if(sessionMessage) sessionMessage.textContent='';
    }, 220);
  }
}
function toast(msg, type='ok'){
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, { position:'fixed', bottom:'18px', right:'18px', padding:'10px 14px', border:'1px solid var(--border)', borderRadius:'12px', boxShadow:'var(--shadow)', zIndex:60 });
  const colors = { ok:['#0c1912','#a7f3d0'], warn:['#1a150a','#fde68a'], err:['#1a0e0e','#fecaca'] };
  const [bg, fg] = colors[type] || colors.ok; el.style.background = bg; el.style.color = fg; document.body.append(el); setTimeout(()=>el.remove(), 2800);
}

function avatarFor(){ return `<div class="avatar"><img src="${LOGO_URL}" alt="WF TOOLS" /></div>` }

function escapeHTML(str){
  if(str == null) return '';
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
  return String(str).replace(/[&<>"']/g, ch => map[ch] || ch);
}
function creditMeta(rawCredits){
  const value = Number(rawCredits ?? 0);
  if(!Number.isFinite(value) || value <= 0) return { value:0, level:'low', text:'Sin créditos', recommend:true };
  if(value < 20) return { value, level:'low', text:'Crédito bajo', recommend:true };
  if(value < 60) return { value, level:'medium', text:'Nivel medio', recommend:false };
  return { value, level:'high', text:'Nivel saludable', recommend:false };
}
function creditBadge(meta){
  return `<div class="credit-badge credit-${meta.level}"><span class="dot"></span><span>${numberFmt.format(meta.value)} créditos</span><span>· ${meta.text}</span></div>`;
}

/************* AUTH & API *************/
async function authHeaderAsync(){
  const { data } = await sb.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function api(path, { method='GET', headers={}, body=null, query=null } = {}){
  const url = new URL(`${FUNCTIONS_BASE}/${path}`);
  if(query) Object.entries(query).forEach(([k,v])=> v!=null && url.searchParams.set(k,String(v)));
  const auth = await authHeaderAsync();
  const res = await fetch(url, { method, headers:{ 'Content-Type':'application/json', ...auth, ...headers }, body: body? JSON.stringify(body): null });
  if(res.status===401){ toast('Sesión expirada o no autorizada', 'warn'); await sb.auth.signOut(); hide(adminView); show(loginView); sessionLoading(false); }
  return res;
}
async function guardAdmin(){
  const { data } = await sb.auth.getUser();
  const user = data?.user;
  if(!user){ hide(adminView); show(loginView); return false; }
  if(user.email !== ADMIN_EMAIL){ await sb.auth.signOut(); hide(adminView); show(loginView); loginError.style.display='block'; loginError.textContent='No eres administrador.'; return false; }
  return true;
}

/************* AUTH FLOW *************/
qs('#btnLogin').addEventListener('click', async()=>{
  loginError.style.display='none';
  const email = emailInput?.value.trim();
  const password = passwordInput?.value;
  if(!email || !password){ loginError.style.display='block'; loginError.textContent='Completa email y contraseña'; return; }
  sessionLoading(true, 'Iniciando sesión…');
  btnLogin.disabled=true; btnLoginText.style.display='none'; btnLoginSpinner.style.display='inline';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btnLogin.disabled=false; btnLoginText.style.display='inline'; btnLoginSpinner.style.display='none';
  if(error){ sessionLoading(false); loginError.style.display='block'; loginError.textContent = error.message; return; }
  rememberEmail(email);
  const ok = await guardAdmin();
  if(ok){
    hide(loginView);
    show(adminView);
    loadUsers();
    toast('Bienvenido, admin');
    setTimeout(()=>sessionLoading(false), 320);
  } else {
    sessionLoading(false);
  }
});

qs('#btnRecover').addEventListener('click', async()=>{
  const email = emailInput?.value.trim(); if(!email){ toast('Escribe tu email para enviar el link','warn'); return; }
  await api(ENDPOINTS.recovery, { method:'POST', body:{ email } });
  toast('Si el correo existe, se envió link de recuperación');
});

qs('#btnLogout').addEventListener('click', async()=>{
  sessionLoading(true, 'Cerrando sesión…');
  await sb.auth.signOut();
  hide(adminView);
  show(loginView);
  if(passwordInput) passwordInput.value='';
});
sb.auth.onAuthStateChange((_, s)=>{
  if(!s){
    hide(adminView);
    show(loginView);
    setTimeout(()=>sessionLoading(false), 250);
  }
});

togglePasswordBtn?.addEventListener('click', ()=>{
  if(!passwordInput) return;
  const show = passwordInput.type === 'password';
  passwordInput.type = show ? 'text' : 'password';
  togglePasswordBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
  if(togglePasswordText) togglePasswordText.textContent = show ? 'Ocultar' : 'Mostrar';
  if(togglePasswordIcon) togglePasswordIcon.textContent = show ? '🙈' : '👁️';
});

rememberCheck?.addEventListener('change', ()=>{
  if(!emailInput) return;
  if(rememberCheck.checked){
    rememberEmail(emailInput.value.trim());
  } else {
    rememberEmail('');
  }
});

emailInput?.addEventListener('input', ()=>{
  if(rememberCheck?.checked){
    rememberEmail(emailInput.value.trim());
  }
});

async function bootstrap(){
  loadRememberedEmail();
  sessionLoading(true, 'Verificando sesión…');
  try{
    const { data } = await sb.auth.getSession();
    if(data?.session){
      const ok = await guardAdmin();
      if(ok){
        hide(loginView);
        show(adminView);
        await loadUsers();
        return;
      }
    }
    hide(adminView);
    show(loginView);
  } catch(err){
    console.error('Error verificando sesión', err);
    hide(adminView);
    show(loginView);
  } finally {
    setTimeout(()=>sessionLoading(false), 220);
  }
}

bootstrap();

/************* LISTAR USUARIOS *************/
let searchTimer = null;
qs('#q').addEventListener('input', ()=>{
  clearTimeout(searchTimer);
  searchTimer = setTimeout(()=>{ page=1; loadUsers(); }, 350);
});
qs('#q').addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ page=1; loadUsers(); }});
qs('#btnSearch').addEventListener('click', ()=>{ page=1; loadUsers(); });
qs('#btnReload').addEventListener('click', ()=> loadUsers());
qs('#prev').addEventListener('click', ()=>{ if(page>1){ page--; loadUsers(); }});
qs('#next').addEventListener('click', ()=>{ page++; loadUsers(); });

async function loadUsers(){
  try{
    overlay(true); $skeleton.style.display='block'; $rows.innerHTML=''; $cards.innerHTML=''; $empty.style.display='none';
    const q = qs('#q').value.trim() || undefined;
    const res = await api(ENDPOINTS.list, { query:{ page, perPage, q } });
    if(!res.ok){ const txt = await res.text(); console.error('list error:',txt); toast('Error cargando usuarios','err'); return; }
    const payload = await res.json(); currentRows = payload.users || [];
    renderRows(); qs('#pageInfo').textContent = `Página ${page}`;
  } finally {
    $skeleton.style.display='none'; overlay(false);
  }
}

function renderRows(){
  $rows.innerHTML=''; $cards.innerHTML='';
  $creditSummary.style.display='none';
  if(!currentRows.length){ $empty.style.display='block'; return; }
  $empty.style.display='none';

  let totalCredits = 0;
  let lowCount = 0;
  let inactiveCount = 0;

  for(const u of currentRows){
    const meta = creditMeta(u.credits);
    const creditBadgeHtml = creditBadge(meta);
    const displayName = (u.full_name && u.full_name.trim()) || u.email || 'Usuario';
    const safeDisplayName = escapeHTML(displayName);
    const creditWarningHtml = meta.recommend ? `<div class="credit-warning">Recargar créditos al usuario ${safeDisplayName}</div>` : '';
    const email = u.email || '';
    const fullName = u.full_name || '';
    const plan = u.plan || '—';
    const id = u.id || '';
    const safeEmail = escapeHTML(email);
    const safeFullName = fullName ? escapeHTML(fullName) : '—';
    const safePlan = escapeHTML(plan);
    const safeId = escapeHTML(id);

    totalCredits += meta.value;
    if(meta.recommend) lowCount++;
    if(meta.value <= 0) inactiveCount++;

    // tabla
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${avatarFor()}</td>
      <td>${safeEmail}</td>
      <td>${safeFullName}</td>
      <td><span class="tag">${safePlan}</span></td>
      <td>${creditBadgeHtml}${creditWarningHtml}</td>
      <td style="font-size:.8rem;color:var(--muted)">${safeId}</td>
      <td>
        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${safeId}">Editar</button>
          <button class="btn btn-ghost btn-sm" data-act="recovery" data-email="${safeEmail}">Link recuperación</button>
          <button class="btn btn-primary btn-sm" data-act="password" data-id="${safeId}">Cambiar contraseña</button>
        </div>
      </td>`;
    $rows.append(tr);

    // cards (móvil)
    const card = document.createElement('div');
    card.className='card-row';
    card.innerHTML = `
      <div class="row-top">
        <div style="display:flex; align-items:center; gap:10px">
          ${avatarFor()}
          <div>
            <div style="font-weight:700">${safeFullName}</div>
            <div class="muted" style="font-size:.85rem">${safeEmail}</div>
          </div>
        </div>
        <span class="tag">${safePlan}</span>
      </div>
      <div class="row-mid">
        <div><div class="label">Créditos</div><div>${creditBadgeHtml}</div></div>
        <div><div class="label">ID</div><div style="font-size:.8rem;color:var(--muted)">${safeId}</div></div>
      </div>
      ${creditWarningHtml}
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${safeId}">Editar</button>
        <button class="btn btn-ghost btn-sm" data-act="recovery" data-email="${safeEmail}">Recuperación</button>
        <button class="btn btn-primary btn-sm" data-act="password" data-id="${safeId}">Cambiar contraseña</button>
      </div>`;
    $cards.append(card);
  }

  const totalAccounts = currentRows.length;
  const activeCount = totalAccounts - inactiveCount;
  const avgCredits = activeCount ? totalCredits / activeCount : 0;
  const avgText = activeCount ? `Promedio ${averageFmt.format(avgCredits)} créditos` : 'Sin cuentas activas';
  $creditSummary.style.display='flex';
  $creditSummary.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">💠</div>
      <div class="stat-body">
        <span class="stat-title">Créditos activos</span>
        <span class="stat-value">${numberFmt.format(totalCredits)}</span>
        <span class="stat-sub">Suma de todas las cuentas listadas</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">👥</div>
      <div class="stat-body">
        <span class="stat-title">Cuentas activas</span>
        <span class="stat-value">${activeCount}</span>
        <span class="stat-sub">${avgText}</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🛑</div>
      <div class="stat-body">
        <span class="stat-title">Cuentas inactivas</span>
        <span class="stat-value">${inactiveCount}</span>
        <span class="stat-sub">Recarga las cuentas sin créditos</span>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">🚨</div>
      <div class="stat-body">
        <span class="stat-title">Alertas de crédito</span>
        <span class="stat-value">${lowCount}</span>
        <span class="stat-sub">${lowCount ? 'Atiende las cuentas marcadas en rojo' : 'Todo en orden'}</span>
      </div>
    </div>`;
}

// acciones delegadas
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const act = btn.dataset.act; if(!act) return;

  if(act==='recovery'){
    const email = btn.dataset.email; if(!email){ toast('Ese usuario no tiene email','warn'); return; }
    btn.disabled = true;
    await api(ENDPOINTS.recovery, { method:'POST', body:{ email } }).catch(()=>{});
    btn.disabled = false; toast('Link de recuperación enviado');
  }

  if(act==='password'){
    const id = btn.dataset.id; const pwd = prompt('Nueva contraseña (mín 12, segura):'); if(!pwd) return;
    if(pwd.length < 12){ toast('La contraseña debe tener al menos 12 caracteres','warn'); return; }
    btn.disabled = true;
    const res = await api(ENDPOINTS.setPassword, { method:'POST', body:{ userId:id, password:pwd } });
    btn.disabled = false;
    if(res.ok) toast('Contraseña actualizada'); else toast('No se pudo cambiar','err');
  }

  if(act==='edit'){
    const id = btn.dataset.id; currentEdit = currentRows.find(x=>x.id===id); openModal(currentEdit);
  }
});

/************* MODAL *************/
const modal = qs('#modal');
const m_email = qs('#m_email');
const m_email_err = qs('#m_email_err');
const m_name = qs('#m_name');
const m_plan = qs('#m_plan');
const m_credits = qs('#m_credits');
const m_password = qs('#m_password');
const m_pwd_err = qs('#m_pwd_err');

function openModal(u){
  if(!u) return;
  m_email.value = u.email || '';
  m_name.value = u.full_name || '';
  m_plan.value = u.plan || 'Básico';
  m_credits.value = u.credits ?? 0;
  m_password.value = '';
  m_email.setAttribute('data-current', u.email || '');
  m_email_err.style.display='none'; m_email.setAttribute('aria-invalid','false');
  m_pwd_err.style.display='none'; m_password.setAttribute('aria-invalid','false');

  document.body.style.overflow = 'hidden'; // bloquear scroll del fondo
  modal.style.display='flex';
}

qs('#closeModal').addEventListener('click', ()=>{
  modal.style.display='none';
  document.body.style.overflow = ''; // restaurar scroll del fondo
});

function validateModal(){
  const email = m_email.value.trim();
  const pwd = m_password.value.trim();
  let ok = true;

  if(!email){
    m_email_err.style.display='block';
    m_email.setAttribute('aria-invalid','true');
    ok = false;
  } else {
    m_email_err.style.display='none';
    m_email.setAttribute('aria-invalid','false');
  }

  if(pwd && pwd.length < 12){
    m_pwd_err.style.display='block';
    m_password.setAttribute('aria-invalid','true');
    ok = false;
  } else {
    m_pwd_err.style.display='none';
    m_password.setAttribute('aria-invalid','false');
  }

  return ok;
}

qs('#btnSave').addEventListener('click', async()=>{
  if(!currentEdit) return;
  if(!validateModal()) return;

  const payload = {
    userId: currentEdit.id,
    email: m_email.value.trim(),
    full_name: (m_name.value.trim() || null),
    plan: m_plan.value,
    credits: Number(m_credits.value) || 0,
    newPassword: (m_password.value.trim() || null)
  };

  const btn = qs('#btnSave'); btn.disabled = true; btn.textContent = 'Guardando…';
  const res = await api(ENDPOINTS.update, { method:'POST', body: payload });
  const txt = await res.text();
  btn.disabled = false; btn.textContent = 'Guardar cambios';

  if(!res.ok){
    console.error('update error:', txt);
    toast(`Error al guardar: ${txt}`, 'err');
    return;
  }
  try { const data = JSON.parse(txt); console.log('Perfil guardado:', data.profile); } catch {}

  modal.style.display='none';
  document.body.style.overflow = ''; // restaurar scroll
  toast('Cambios guardados');
  loadUsers();
});

qs('#btnRecovery').addEventListener('click', async()=>{
  if(!currentEdit?.email) return;
  const btn = qs('#btnRecovery'); btn.disabled = true; btn.textContent = 'Enviando…';
  await api(ENDPOINTS.recovery, { method:'POST', body:{ email: currentEdit.email } }).catch(()=>{});
  btn.disabled = false; btn.textContent = 'Enviar link de recuperación';
  toast('Link de recuperación enviado');
});

// Cerrar modal con tecla Escape
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && modal.style.display === 'flex'){
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
});

/************* INIT *************/
(async()=>{
  const ok = await guardAdmin();
  if(ok){ hide(loginView); show(adminView); loadUsers(); }
})();

