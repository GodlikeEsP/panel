// ══════════════════════════════════════════════
//  MineVanta — Core Data Engine
//  All data stored in localStorage (JSON store)
// ══════════════════════════════════════════════

const KEYS = {
  users:         'mv_users',
  session:       'mv_session',
  tickets:       'mv_tickets',
  announcements: 'mv_announcements',
  servers:       'mv_servers',
};

// ── Helpers ──────────────────────────────────
function _get(key)       { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; } }
function _set(key, val)  { localStorage.setItem(key, JSON.stringify(val)); }
function _id()           { return Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _now()          { return new Date().toISOString(); }
function _date()         { return new Date().toISOString().split('T')[0]; }

// ── Bootstrap ────────────────────────────────
function initData() {
  // Seed admin account if users list doesn't exist
  if (!_get(KEYS.users)) {
    _set(KEYS.users, [
      {
        id: 'admin_1',
        username: 'adminxypher',
        email: 'adminxypher@minevanta.com',
        password: 'admin2026',
        role: 'admin',
        plan: null,
        serverId: null,
        created: _date()
      }
    ]);
  } else {
    // Make sure admin always exists even if storage was partial
    const users = _get(KEYS.users) || [];
    if (!users.find(u => u.email === 'adminxypher@minevanta.com')) {
      users.unshift({
        id: 'admin_1',
        username: 'adminxypher',
        email: 'adminxypher@minevanta.com',
        password: 'admin2026',
        role: 'admin',
        plan: null,
        serverId: null,
        created: _date()
      });
      _set(KEYS.users, users);
    }
  }
  if (!_get(KEYS.tickets))       _set(KEYS.tickets, []);
  if (!_get(KEYS.announcements)) _set(KEYS.announcements, []);
  if (!_get(KEYS.servers))       _set(KEYS.servers, []);
}

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════
function getUsers()       { return _get(KEYS.users) || []; }
function saveUsers(u)     { _set(KEYS.users, u); }
function getSession()     { return _get(KEYS.session); }

function setSession(user) {
  _set(KEYS.session, {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role || 'user',
    plan: user.plan || null,
    serverId: user.serverId || null
  });
}

function refreshSession() {
  const s = getSession();
  if (!s) return;
  const users = getUsers();
  const user = users.find(u => u.id === s.id);
  if (user) setSession(user);
}

function isAdmin() {
  const s = getSession();
  return s && s.role === 'admin';
}

function requireAuth() {
  const s = getSession();
  if (!s) { window.location.replace('login.html'); return null; }
  return s;
}

function requireAdmin() {
  const s = getSession();
  if (!s) { window.location.replace('login.html'); return null; }
  if (s.role !== 'admin') { window.location.replace('home.html'); return null; }
  return s;
}

function doLogout() {
  localStorage.removeItem(KEYS.session);
  window.location.replace('login.html');
}

function login(email, password) {
  initData();
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
  if (!user) return { success: false, message: 'Invalid email or password.' };
  setSession(user);
  return { success: true, role: user.role };
}

function signup(username, email, password) {
  initData();
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return { success: false, message: 'Email already registered.' };
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return { success: false, message: 'Username already taken.' };
  if (password.length < 6)
    return { success: false, message: 'Password must be at least 6 characters.' };
  const newUser = {
    id: _id(),
    username,
    email,
    password,
    role: 'user',   // default: no special role
    plan: null,     // default: no plan assigned
    serverId: null, // default: no server
    created: _date()
  };
  users.push(newUser);
  saveUsers(users);
  setSession(newUser);
  return { success: true };
}

// ══════════════════════════════════════════════
//  ANNOUNCEMENTS
// ══════════════════════════════════════════════
function getAnnouncements() { return _get(KEYS.announcements) || []; }

function addAnnouncement(title, body) {
  if (!isAdmin()) return false;
  const list = getAnnouncements();
  list.unshift({ id: _id(), title, body, date: _now(), author: getSession().username });
  _set(KEYS.announcements, list);
  return true;
}

function deleteAnnouncement(id) {
  if (!isAdmin()) return false;
  _set(KEYS.announcements, getAnnouncements().filter(a => a.id !== id));
  return true;
}

// ══════════════════════════════════════════════
//  TICKETS
// ══════════════════════════════════════════════
function getTickets() { return _get(KEYS.tickets) || []; }

function createTicket(subject, message, type) {
  const s = getSession();
  if (!s) return null;
  const ticket = {
    id: _id(),
    subject,
    type: type || 'general',
    status: 'open',
    userId: s.id,
    username: s.username,
    created: _now(),
    messages: [
      { id: _id(), author: s.username, role: 'user', text: message, time: _now() }
    ]
  };
  const tickets = getTickets();
  tickets.unshift(ticket);
  _set(KEYS.tickets, tickets);
  return ticket;
}

function replyTicket(ticketId, text) {
  const s = getSession();
  if (!s) return false;
  const tickets = getTickets();
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return false;
  // Users can only reply to their own; admins can reply to any
  if (s.role !== 'admin' && t.userId !== s.id) return false;
  t.messages.push({ id: _id(), author: s.username, role: s.role, text, time: _now() });
  t.status = s.role === 'admin' ? 'answered' : 'open';
  _set(KEYS.tickets, tickets);
  return true;
}

function closeTicket(ticketId) {
  if (!isAdmin()) return false;
  const tickets = getTickets();
  const t = tickets.find(t => t.id === ticketId);
  if (t) { t.status = 'closed'; _set(KEYS.tickets, tickets); }
  return true;
}

function getMyTickets() {
  const s = getSession();
  if (!s) return [];
  if (s.role === 'admin') return getTickets();
  return getTickets().filter(t => t.userId === s.id);
}

// ══════════════════════════════════════════════
//  SERVERS (admin assigns to users)
// ══════════════════════════════════════════════
function getServers() { return _get(KEYS.servers) || []; }

function assignServer(userId, serverData) {
  if (!isAdmin()) return false;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return false;

  const servers = getServers();
  const server = {
    id: _id(),
    userId,
    username: user.username,
    name: serverData.name,
    type: serverData.type || 'VANILLA',
    region: serverData.region || 'US-EAST',
    plan: serverData.plan,
    ram: serverData.ram,
    slots: serverData.slots,
    status: 'online',
    created: _now()
  };
  servers.push(server);
  _set(KEYS.servers, servers);

  // Update user's plan + serverId
  user.plan = serverData.plan;
  user.serverId = server.id;
  saveUsers(users);
  // Refresh session if it's the current user
  const s = getSession();
  if (s && s.id === userId) setSession(user);
  return server;
}

function getUserServers(userId) {
  return getServers().filter(s => s.userId === userId);
}

function removeServer(serverId) {
  if (!isAdmin()) return false;
  const servers = getServers().filter(s => s.id !== serverId);
  _set(KEYS.servers, servers);
  // clear from user
  const users = getUsers();
  users.forEach(u => { if (u.serverId === serverId) { u.serverId = null; u.plan = null; } });
  saveUsers(users);
  return true;
}

// ══════════════════════════════════════════════
//  ADMIN — USER MANAGEMENT
// ══════════════════════════════════════════════
function promoteToAdmin(userId) {
  if (!isAdmin()) return false;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (user) { user.role = 'admin'; saveUsers(users); }
  return true;
}

function demoteUser(userId) {
  if (!isAdmin()) return false;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (user && user.email !== 'adminxypher@minevanta.com') {
    user.role = 'user'; saveUsers(users);
  }
  return true;
}

function createAdminUser(username, email, password) {
  if (!isAdmin()) return { success: false, message: 'Unauthorized.' };
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return { success: false, message: 'Email already exists.' };
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return { success: false, message: 'Username already taken.' };
  const newAdmin = {
    id: _id(), username, email, password,
    role: 'admin', plan: null, serverId: null, created: _date()
  };
  users.push(newAdmin);
  saveUsers(users);
  return { success: true };
}

// ── Init on every page load ──
initData();
