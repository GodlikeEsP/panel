// ══════════════════════════════════════════════
//  MineVanta — Core Data Engine v3
// ══════════════════════════════════════════════

const KEYS = {
  users:         'mv_users',
  session:       'mv_session',
  tickets:       'mv_tickets',
  announcements: 'mv_announcements',
  servers:       'mv_servers',
};

function _get(key)      { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e) { return null; } }
function _set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function _id()          { return Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _now()         { return new Date().toISOString(); }
function _date()        { return new Date().toISOString().split('T')[0]; }

// ── Bootstrap ──────────────────────────────────
function initData() {
  let users = _get(KEYS.users) || [];

  // Always ensure master admin exists
  const masterExists = users.find(u => u.email === 'adminxypher@minevanta.com');
  if (!masterExists) {
    users.unshift({
      id:       'admin_root',
      username: 'adminxypher',
      email:    'adminxypher@minevanta.com',
      password: 'admin2026',
      role:     'admin',
      plan:     null,
      serverId: null,
      created:  _date()
    });
    _set(KEYS.users, users);
  }

  if (!_get(KEYS.tickets))       _set(KEYS.tickets, []);
  if (!_get(KEYS.announcements)) _set(KEYS.announcements, []);
  if (!_get(KEYS.servers))       _set(KEYS.servers, []);
}

// ══════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════
function getUsers()   { return _get(KEYS.users) || []; }
function saveUsers(u) { _set(KEYS.users, u); }
function getSession() { return _get(KEYS.session); }

function setSession(user) {
  // Always read role directly from the users store, not from a stale object
  const freshUsers = getUsers();
  const fresh = freshUsers.find(u => u.id === user.id) || user;
  _set(KEYS.session, {
    id:       fresh.id,
    username: fresh.username,
    email:    fresh.email,
    role:     fresh.role || 'user',   // ← always from fresh record
    plan:     fresh.plan || null,
    serverId: fresh.serverId || null
  });
}

function refreshSession() {
  const s = getSession();
  if (!s) return;
  const user = getUsers().find(u => u.id === s.id);
  if (user) setSession(user);
}

function isAdmin() {
  // Double-check: read role from users store, not just session
  const s = getSession();
  if (!s) return false;
  const user = getUsers().find(u => u.id === s.id);
  return !!(user && user.role === 'admin');
}

function requireAuth() {
  const s = getSession();
  if (!s) { window.location.replace('login.html'); return null; }
  return s;
}

function requireAdmin() {
  const s = getSession();
  if (!s) { window.location.replace('login.html'); return null; }
  const user = getUsers().find(u => u.id === s.id);
  if (!user || user.role !== 'admin') { window.location.replace('home.html'); return null; }
  return s;
}

function doLogout() {
  localStorage.removeItem(KEYS.session);
  window.location.replace('login.html');
}

function login(email, password) {
  initData();
  const users = getUsers();
  const user = users.find(u =>
    u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!user) return { success: false, message: 'Invalid email or password.' };
  setSession(user);  // setSession now reads fresh role from store
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
    id: _id(), username, email, password,
    role: 'user', plan: null, serverId: null, created: _date()
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
  const s = getSession();
  if (!s) return false;
  const user = getUsers().find(u => u.id === s.id);
  if (!user || user.role !== 'admin') return false;
  const list = getAnnouncements();
  list.unshift({ id: _id(), title, body, date: _now(), author: s.username });
  _set(KEYS.announcements, list);
  return true;
}

function deleteAnnouncement(id) {
  if (!isAdmin()) return false;
  _set(KEYS.announcements, getAnnouncements().filter(a => a.id !== id));
  return true;
}

// ══════════════════════════════════════════════
//  TICKETS — raw store, NO session filtering
// ══════════════════════════════════════════════

/** Always read raw from localStorage — never filtered by session */
function getAllTickets() {
  try { return JSON.parse(localStorage.getItem(KEYS.tickets) || '[]'); } catch(e) { return []; }
}
function saveAllTickets(tickets) {
  localStorage.setItem(KEYS.tickets, JSON.stringify(tickets));
}

// Aliases for compatibility
function getTickets()    { return getAllTickets(); }
function getMyTickets()  {
  const s = getSession();
  if (!s) return [];
  const user = getUsers().find(u => u.id === s.id);
  if (user && user.role === 'admin') return getAllTickets();
  return getAllTickets().filter(t => t.userId === s.id);
}

function createTicket(subject, message, type) {
  const s = getSession();
  if (!s) return null;
  const ticket = {
    id:       _id(),
    subject,
    type:     type || 'general',
    status:   'open',
    userId:   s.id,
    username: s.username,
    created:  _now(),
    messages: [
      { id: _id(), author: s.username, role: 'user', text: message, time: _now() }
    ]
  };
  const tickets = getAllTickets();
  tickets.unshift(ticket);
  saveAllTickets(tickets);
  return ticket;
}

function replyTicket(ticketId, text) {
  const s = getSession();
  if (!s) return false;
  const tickets = getAllTickets();
  const t = tickets.find(t => t.id === ticketId);
  if (!t) return false;
  const user = getUsers().find(u => u.id === s.id);
  const role = (user && user.role) || 'user';
  if (role !== 'admin' && t.userId !== s.id) return false;
  t.messages.push({ id: _id(), author: s.username, role, text, time: _now() });
  t.status = role === 'admin' ? 'answered' : 'open';
  saveAllTickets(tickets);
  return true;
}

function closeTicket(ticketId) {
  if (!isAdmin()) return false;
  const tickets = getAllTickets();
  const t = tickets.find(t => t.id === ticketId);
  if (t) { t.status = 'closed'; saveAllTickets(tickets); }
  return true;
}

// ══════════════════════════════════════════════
//  SERVERS
// ══════════════════════════════════════════════
function getServers() { return _get(KEYS.servers) || []; }

function getUserServers(userId) {
  return getServers().filter(s => s.userId === userId);
}

function assignServer(userId, serverData) {
  if (!isAdmin()) return false;
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return false;
  const server = {
    id:       _id(),
    userId,
    username: user.username,
    name:     serverData.name,
    type:     serverData.type   || 'VANILLA',
    region:   serverData.region || 'US-EAST',
    plan:     serverData.plan,
    ram:      serverData.ram    || '—',
    cpu:      serverData.cpu    || '—',
    disk:     serverData.disk   || '—',
    slots:    serverData.slots  || '—',
    status:   'online',
    created:  _now()
  };
  const servers = getServers();
  servers.push(server);
  _set(KEYS.servers, servers);
  user.plan = serverData.plan;
  user.serverId = server.id;
  saveUsers(users);
  const s = getSession();
  if (s && s.id === userId) setSession(user);
  return server;
}

function removeServer(serverId) {
  if (!isAdmin()) return false;
  _set(KEYS.servers, getServers().filter(s => s.id !== serverId));
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
    user.role = 'user';
    saveUsers(users);
  }
  return true;
}

function createAdminUser(username, email, password) {
  // Check caller is admin by reading from users store directly
  const s = getSession();
  if (!s) return { success: false, message: 'Not logged in.' };
  const callerInStore = getUsers().find(u => u.id === s.id);
  if (!callerInStore || callerInStore.role !== 'admin')
    return { success: false, message: 'Unauthorized.' };

  if (!username || !email || !password)
    return { success: false, message: 'All fields are required.' };
  if (password.length < 6)
    return { success: false, message: 'Password must be at least 6 characters.' };

  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return { success: false, message: 'Email already exists.' };
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
    return { success: false, message: 'Username already taken.' };

  const newAdmin = {
    id:       _id(),
    username, 'ownerneev'
    email,    'owner@minevanta.com
    password, 'minevantaowner'
    role:     'admin',   // ← explicitly set
    plan:     null,
    serverId: null,
    created:  _date()
  };
  users.push(newAdmin);
  saveUsers(users);

  // Verify it was saved correctly
  const saved = getUsers().find(u => u.email === email);
  if (!saved || saved.role !== 'admin')
    return { success: false, message: 'Save failed — please try again.' };

  return { success: true };
}

// ── Run on every page load ──
initData();
