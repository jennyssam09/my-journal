'use strict';

/* =====================================================================
   ☁ 구글 드라이브 동기화
   ---------------------------------------------------------------------
   - 로그인: 구글 GIS "토큰 방식". 액세스 토큰은 메모리에만 두고 어디에도 저장하지 않아요. (client secret·API 키·서버는 없어요)
   - 권한: drive.file 하나뿐이에요. 이 앱이 만든 파일만 볼 수 있어요.
   - Drive에 생기는 것 (내 드라이브 → "나의 기록장 (동기화)" 폴더)
       journal.json                        기록 글 전체 + 삭제 표시 + 동기화 정보 (이미지 데이터는 없어요)
       img-<기록id>-<칸>-<번호>-<해시>.jpg  그림·원본·워치 캡처 한 장에 파일 하나
       바이올린 녹음/<곡 이름>/<날짜> <곡 이름>.<확장자>   🎙 녹음 한 개에 파일 하나 (녹음 정보는 journal.json 의 audios · 삭제 표시는 atombs)
                                           예전 audio-<녹음id>.<확장자> 는 정리하기를 고르면 곡별 폴더로 옮겨요. 사이트는 늘 파일 id 로 찾아요.
   - 합치는 규칙: 두 기기의 시계를 견주지 않고, 각 기기가 "마지막 동기화 때의 나"(base)와만 비교해서 바뀌었는지 알아봐요.
   - 녹음: 파일을 먼저 올리고(큰 파일은 이어 올리기) 녹음 정보는 그 뒤에 journal.json 으로 올려요. 다른 기기에서는 정보만 먼저 받고,
     ▶ 재생·⬇ 파일로 저장을 누를 때 파일을 내려받아요.
   - file:// 로 열었거나 로그인하지 않았어도 기록·백업은 전부 그대로 써져요.
   ===================================================================== */
(() => {
  const CFG = { clientId: '', deployUrl: '', folderName: '나의 기록장 (동기화)', tombstoneDays: 60, staleDays: 60, ...(window.SYNC_CONFIG || {}) };
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const JOURNAL_NAME = 'journal.json';
  const DAY = 86400000;
  const T = { debounce: 5000, refocus: 60000, backoff: [5, 15, 60, 300, 900].map((s) => s * 1000), fast: false };
  const AUDIO_ONE_SHOT = 1024 * 1024;        // 1MB 이하 녹음은 한 번에 올려요 (그보다 크면 이어 올리기)
  const AUDIO_CHUNK = 2 * 1024 * 1024;       // 이어 올릴 때 한 번에 보내는 크기 (256KB 의 배수여야 해요)
  const SESSION_MAX_AGE = 6 * 86400000;      // 구글의 이어 올리기 주소는 약 1주일 유효해서, 그 전에 새로 시작해요

  let nowFn = () => Date.now();
  const now = () => nowFn();
  const q$ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  async function sha256(str) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))); }
  function b64ToBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function bytesToB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function stable(v) {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { if (v[k] !== undefined) o[k] = stable(v[k]); }); return o; }
    return v;
  }
  function limiter(n) {
    let active = 0; const queue = [];
    const next = () => {
      if (active >= n || !queue.length) return;
      active += 1;
      const { fn, res, rej } = queue.shift();
      fn().then(res, rej).finally(() => { active -= 1; next(); });
    };
    return (fn) => new Promise((res, rej) => { queue.push({ fn, res, rej }); next(); });
  }
  const imgLimit = limiter(3);

  /* ---------------------------------------------------------------------
     0. 환경과 상태
     --------------------------------------------------------------------- */
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const secure = location.protocol === 'https:' || isLocalHost;
  const envMode = () => (location.protocol === 'file:' ? 'file' : !CFG.clientId ? 'noconfig' : !secure ? 'insecure' : 'ok');

  // status: idle 정상 / syncing 동기화 중 / offline 인터넷 없음 / error 문제가 생김(다시 시도) / reconnect 다시 연결 필요
  //         stale 오랜만에 켬(확인 필요) / missing Drive 파일이 사라짐 / welcome 첫 로그인 진행 중
  const S = {
    meta: null, status: 'idle', lastError: '', token: null, tokenExp: 0, tokenP: null, needReconnect: false,
    running: false, dirty: false, force: null, staleOk: false, gisP: null, backoffIdx: 0, nextRetryAt: 0,
    debounceT: null, retryT: null, lastRunAt: 0, progress: null, remote: { version: '', journal: null }, shaCache: new Map(), conflictsSeen: 0,
    audioProg: {},          // 지금 올리는 녹음 id → { sent, total }
    audioDl: new Map(),     // 지금 받는 녹음 id → { pct, promise }
    audioIdx: null,         // 이번 동기화에서 본 Drive의 녹음 파일 목록 (audio id → 파일)
    aroot: null, sfold: new Map(), nameCache: new Map(), // 이번 동기화에서 알아낸 "바이올린 녹음" 폴더 · 곡 폴더 · 폴더 안의 파일 이름들
    legacy: null,           // 예전 audio-… 파일(동기화 폴더 바로 아래)을 본 결과 { ids: [녹음 id], n }
    organizeNow: false, legacyScan: false,
    audioErr: null,         // 이번 동기화에서 올리지 못한 녹음의 이유 (다른 기록의 동기화는 막지 않아요)
  };

  class SyncError extends Error {
    constructor(kind, msg, extra) { super(msg || kind); this.kind = kind; Object.assign(this, extra || {}); }
  }
  const FRIENDLY = {
    offline: '인터넷에 연결되면 자동으로 올릴게요.',
    auth: '다시 연결이 필요해요. 위쪽 ☁ 를 한 번 눌러 주세요.',
    rate: '구글이 잠깐 바쁘대요. 조금 뒤에 다시 해 볼게요.',
    server: '구글 서버가 잠깐 불안정해요. 조금 뒤에 다시 해 볼게요.',
    quota: 'Drive 저장 공간이 부족해요. Drive에서 공간을 비운 뒤 "지금 동기화"를 눌러 주세요.',
    notfound: 'Drive에서 파일을 찾지 못했어요.',
    missing: 'Drive에서 동기화 폴더나 파일이 사라졌어요.',
    gis: '구글 로그인 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.',
    denied: '로그인을 취소했거나 권한을 주지 않았어요.',
    popup: '로그인 창이 열리지 않았어요. 브라우저의 팝업 허용을 확인해 주세요.',
    origin: '이 주소가 구글 설정의 "승인된 JavaScript 원본"에 없을 수 있어요. README의 문제 해결을 확인해 주세요.',
    apidisabled: 'Google Drive API가 켜져 있지 않을 수 있어요. README의 문제 해결을 확인해 주세요.',
    forbidden: '구글이 요청을 허락하지 않았어요. 로그인한 계정과 권한(drive.file)을 확인해 주세요.',
    fatal: '동기화 중 문제가 생겼어요. 조금 뒤에 다시 해 볼게요.',
  };

  /* ---------------------------------------------------------------------
     1. 이 기기에만 두는 동기화 정보 (토큰은 저장하지 않아요)
     --------------------------------------------------------------------- */
  const emptyMeta = () => ({
    id: '__meta_sync', type: 'meta', deviceId: newId(), enabled: false, email: '', folderId: '', journalId: '', remoteVersion: '',
    firstDone: false, lastSyncAt: 0,
    base: {},       // 기록 id → { lu: 마지막으로 맞췄을 때 이 기기의 updatedAt, ld: 그때 지워진 상태였나, ru: Drive 쪽 updatedAt, rd }
    conflicts: {},  // 아직 풀지 못한 충돌 id → { kind, remote, k }  (k: 'aud' 이면 녹음)
    abase: {},      // 녹음용 base (기록의 base 와 같은 모양이에요)
    up: {},         // 이어 올리는 중인 녹음 id → { uri, size, offset, folderId, at } (끊겨도 다음에 이어서 올려요)
    audioAsked: false, audioHold: [], // 기존 녹음을 올릴지 물어봤나 / "나중에"로 미뤄 둔 녹음 id
    arootId: '',      // Drive의 "바이올린 녹음" 폴더 id
    aorgAsked: false, aorg: '', alegacy: 0, // 예전 audio-… 파일을 곡별 폴더로 정리할지 물어봤나 / 'yes' 정리하기 · 'later' 나중에 / 마지막으로 본 예전 파일 개수
    wifiOnly: false,  // 와이파이에서만 녹음 올리기 (이 기기만의 설정)
    last: null,     // 로그아웃할 때 남겨 두는 마지막 동기화 정보 (같은 계정으로 다시 로그인하면 이어서 써요. 비밀 값은 없어요)
  });
  function normMeta(m) {
    const out = m ? { ...emptyMeta(), ...m } : emptyMeta();
    out.base = out.base || {}; out.conflicts = out.conflicts || {}; out.abase = out.abase || {}; out.up = out.up || {};
    out.audioHold = Array.isArray(out.audioHold) ? out.audioHold : [];
    return out;
  }
  async function loadMeta() { S.meta = normMeta(await Store.get('__meta_sync')); }
  const saveMeta = () => Store.putMany([S.meta], { silent: true });

  /* ---------------------------------------------------------------------
     2. 로그인 (GIS 토큰 방식. 토큰은 메모리에만)
     --------------------------------------------------------------------- */
  const gisReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
  function loadGIS() {
    if (gisReady()) return Promise.resolve();
    if (S.gisP) return S.gisP;
    S.gisP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; // 구글 로그인 도구 (동기화를 쓸 때만 불러와요)
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { S.gisP = null; reject(new SyncError('gis')); };
      document.head.appendChild(s);
    });
    return S.gisP;
  }
  const tokenValid = () => !!S.token && now() < S.tokenExp;
  function authError(r) {
    const type = r && (r.type || r.error);
    if (type === 'popup_failed_to_open') return new SyncError('popup');
    if (type === 'popup_closed' || type === 'access_denied') return new SyncError('denied');
    if (['interaction_required', 'immediate_failed', 'login_required', 'consent_required', 'user_logged_out'].includes(type)) return new SyncError('auth', String(type));
    if (['invalid_request', 'redirect_uri_mismatch', 'origin_mismatch', 'idpiframe_initialization_failed'].includes(type)) return new SyncError('origin', String(type));
    return new SyncError('auth', String(type || (r && r.message) || 'auth'));
  }
  // prompt: '' 은 필요할 때만 창을 보여요 / 'none' 은 조용히 (창 없이) 새로 받기를 시도해요
  function requestToken({ prompt = '', hint = '' } = {}) {
    return new Promise((resolve, reject) => {
      try {
        const tc = google.accounts.oauth2.initTokenClient({
          client_id: CFG.clientId, scope: SCOPE, ...(hint ? { hint } : {}),
          callback: (resp) => {
            if (resp && resp.access_token) {
              S.token = resp.access_token; // 메모리에만! (localStorage·IndexedDB에 저장하지 않아요)
              S.tokenExp = now() + Math.max(60, (Number(resp.expires_in) || 3600) - 120) * 1000;
              resolve(resp.access_token);
            } else reject(authError(resp));
          },
          error_callback: (err) => reject(authError(err)),
        });
        tc.requestAccessToken({ prompt, ...(hint ? { hint } : {}) });
      } catch (e) { reject(authError(e)); }
    });
  }
  function ensureToken() {
    if (tokenValid()) return Promise.resolve(S.token);
    if (!S.meta || !S.meta.enabled || S.needReconnect) return Promise.reject(new SyncError('auth'));
    if (S.tokenP) return S.tokenP;
    S.tokenP = (async () => {
      try {
        if (!gisReady()) await loadGIS();
        return await requestToken({ prompt: 'none', hint: S.meta.email });
      } catch (e) {
        S.token = null;
        if (e.kind === 'gis') throw e;
        S.needReconnect = true; // 조용히 새로 받지 못했어요 → 칩을 한 번 누르면 바로 로그인 창이 떠요
        throw new SyncError('auth', 'silent-failed');
      } finally { S.tokenP = null; }
    })();
    return S.tokenP;
  }

  /* ---------------------------------------------------------------------
     3. Drive 호출 (fetch로 REST v3 직접. 실패하면 알아듣기 쉬운 오류로 바꿔요)
     --------------------------------------------------------------------- */
  async function drive(path, opt = {}) {
    const { method = 'GET', params, json, body, contentType, raw = false, upload = false, headers: extraHeaders } = opt;
    const url = new URL((upload ? UPLOAD : API) + path);
    if (params) Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, v); });
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = await ensureToken();
      const headers = { Authorization: `Bearer ${token}`, ...(extraHeaders || {}) };
      let b = body;
      if (json !== undefined) { headers['Content-Type'] = 'application/json'; b = JSON.stringify(json); } else if (contentType) headers['Content-Type'] = contentType;
      let res;
      try { res = await fetch(url, { method, headers, body: b }); } catch (e) { throw new SyncError('offline'); }
      if (res.ok) return raw ? res : (res.status === 204 ? null : res.json());
      const status = res.status;
      let reason = ''; let msg = '';
      try { const j = await res.clone().json(); reason = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status)) || ''; msg = (j.error && j.error.message) || ''; } catch (e) { /* 본문이 없어도 괜찮아요 */ }
      if (status === 401) { S.token = null; if (attempt === 0) continue; throw new SyncError('auth'); } // 한 번은 조용히 새로 받아 봐요
      if (status === 404) throw new SyncError('notfound', msg);
      if (status === 403 && /storageQuotaExceeded/i.test(reason)) throw new SyncError('quota');
      if (status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(reason + msg)) throw new SyncError('apidisabled', msg);
      if (status === 429 || status >= 500 || (status === 403 && /rate|limit/i.test(reason))) {
        lastErr = new SyncError(status >= 500 ? 'server' : 'rate', msg, { status });
        if (attempt < 2) { const ra = Number(res.headers.get('retry-after')); await sleep(T.fast ? 5 : (ra ? Math.min(ra * 1000, 10000) : 800 * 2 ** attempt)); continue; }
        throw lastErr;
      }
      if (status === 403) throw new SyncError('forbidden', msg);
      throw new SyncError('server', msg || `HTTP ${status}`, { status });
    }
    throw lastErr || new SyncError('server');
  }
  function multipart(meta, blob, mime) {
    const boundary = `mj${Math.random().toString(36).slice(2)}`;
    return {
      body: new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, blob, `\r\n--${boundary}--`]),
      contentType: `multipart/related; boundary=${boundary}`,
    };
  }
  const qEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  async function fetchEmail() {
    const r = await drive('/about', { params: { fields: 'user(emailAddress,displayName)' } });
    return (r && r.user && r.user.emailAddress) || '';
  }
  async function findFolder() {
    const r = await drive('/files', { params: { q: `name='${qEsc(CFG.folderName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id,name,createdTime)', orderBy: 'createdTime', pageSize: '10' } });
    return (r.files || [])[0] || null;
  }
  const createFolder = () => drive('/files', { method: 'POST', json: { name: CFG.folderName, mimeType: 'application/vnd.google-apps.folder' }, params: { fields: 'id,name' } });
  // 폴더 id를 확인해요. create=true 이면 없을 때 만들어요.
  async function ensureFolder(create) {
    if (S.meta.folderId) {
      try {
        const f = await drive(`/files/${S.meta.folderId}`, { params: { fields: 'id,trashed' } });
        if (f && !f.trashed) return f.id;
      } catch (e) { if (e.kind !== 'notfound') throw e; }
      S.meta.folderId = ''; S.meta.journalId = ''; S.meta.remoteVersion = ''; S.meta.arootId = ''; S.remote = { version: '', journal: null };
    }
    const found = await findFolder();
    if (found) { S.meta.folderId = found.id; return found.id; }
    if (!create) return null;
    const nf = await createFolder();
    S.meta.folderId = nf.id;
    return nf.id;
  }
  async function findJournal(folderId) {
    const r = await drive('/files', { params: { q: `name='${JOURNAL_NAME}' and '${qEsc(folderId)}' in parents and trashed=false`, fields: 'files(id,version,modifiedTime)', pageSize: '5' } });
    return (r.files || [])[0] || null;
  }
  async function journalMeta(id) {
    try {
      const m = await drive(`/files/${id}`, { params: { fields: 'id,version,modifiedTime,trashed' } });
      return m && !m.trashed ? m : null;
    } catch (e) { if (e.kind === 'notfound') return null; throw e; }
  }
  async function downloadJournal(id) { return (await drive(`/files/${id}`, { params: { alt: 'media' }, raw: true })).json(); }
  async function uploadJournal(existingId, folderId, obj) {
    const mp = multipart(existingId ? {} : { name: JOURNAL_NAME, parents: [folderId], mimeType: 'application/json' }, new Blob([JSON.stringify(obj)], { type: 'application/json' }), 'application/json');
    return drive(existingId ? `/files/${existingId}` : '/files', { method: existingId ? 'PATCH' : 'POST', upload: true, params: { uploadType: 'multipart', fields: 'id,version,modifiedTime' }, body: mp.body, contentType: mp.contentType });
  }
  const trashFile = (fid) => drive(`/files/${fid}`, { method: 'PATCH', json: { trashed: true }, params: { fields: 'id,parents' } }); // 휴지통으로 (30일 안에 되살릴 수 있어요). 어느 폴더에 있었는지도 돌려줘요

  /* ---------------------------------------------------------------------
     4. 기록 ↔ Drive 형태 바꾸기 (이미지는 파일로 따로)
     --------------------------------------------------------------------- */
  const syncable = (r) => isSyncedRecord(r);
  const isB64 = (v) => typeof v === 'string' && /^data:[\w.+\-/]+;base64,/.test(v);
  const isRef = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && !!v.$img && !!v.$img.f;
  const isTombLike = (r) => !!(r && r.deletedAt);
  const imageFields = (type) => ((SCHEMAS[type] && SCHEMAS[type].fields) || []).filter((f) => f.type === 'image' || f.type === 'images').map((f) => ({ key: f.key, multi: f.type === 'images' }));
  function imagesOf(rec) {
    const out = [];
    imageFields(rec.type).forEach((f) => {
      const v = rec[f.key];
      if (f.multi && Array.isArray(v)) v.forEach((x, i) => { if (isB64(x)) out.push({ key: f.key, idx: i, value: x }); });
      else if (!f.multi && isB64(v)) out.push({ key: f.key, idx: null, value: v });
    });
    return out;
  }
  async function imgSha(rec, im) {
    const k = `${rec.id}|${rec.updatedAt}|${im.key}|${im.idx}|${im.value.length}`;
    if (S.shaCache.has(k)) return S.shaCache.get(k);
    const h = await sha256(im.value);
    if (S.shaCache.size > 400) S.shaCache.clear();
    S.shaCache.set(k, h);
    return h;
  }
  // 내용이 같은지 비교하는 글자 (바꾼 시각은 빼고, 이미지는 해시로)
  async function sigLocal(rec) {
    const out = {};
    const fields = new Map(imageFields(rec.type).map((f) => [f.key, f]));
    for (const k of Object.keys(rec)) {
      if (k === 'updatedAt') continue;
      const v = rec[k]; const f = fields.get(k);
      if (f && f.multi && Array.isArray(v)) out[k] = await Promise.all(v.map(async (x, i) => (isB64(x) ? { $h: await imgSha(rec, { key: k, idx: i, value: x }) } : x)));
      else if (f && !f.multi && isB64(v)) out[k] = { $h: await imgSha(rec, { key: k, idx: null, value: v }) };
      else out[k] = v;
    }
    return JSON.stringify(stable(out));
  }
  function sigRemote(rec) {
    const conv = (v) => (isRef(v) ? { $h: v.$img.h } : Array.isArray(v) ? v.map(conv) : v);
    const out = {};
    Object.keys(rec).forEach((k) => { if (k !== 'updatedAt') out[k] = conv(rec[k]); });
    return JSON.stringify(stable(out));
  }
  const refsOfRecord = (rec) => {
    const out = [];
    const scan = (v) => { if (isRef(v)) out.push(v.$img); else if (Array.isArray(v)) v.forEach(scan); };
    imageFields(rec.type).forEach((f) => scan(rec[f.key]));
    if (rec.type === 'workout') scan(rec.shots); // 없어진 "워치 캡처" 칸: 그 사진 파일도 더는 쓰이지 않으면 휴지통으로 가도록 참조를 계속 읽어요
    return out;
  };
  const refFileIds = (journal) => {
    const s = new Set();
    (journal.records || []).forEach((r) => refsOfRecord(r).forEach((x) => s.add(x.f)));
    (journal.audios || []).forEach((a) => { if (a.file && a.file.f) s.add(a.file.f); }); // 🎙 녹음 파일
    return s;
  };

  async function uploadImage(rec, im, sha, folderId) {
    const mime = (im.value.match(/^data:([\w.+\-/]+);base64,/) || [])[1] || 'image/jpeg';
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] || 'img';
    const bytes = b64ToBytes(im.value.slice(im.value.indexOf(',') + 1));
    const name = `img-${rec.id}-${im.key}${im.idx == null ? '' : `-${im.idx}`}-${sha.slice(0, 8)}.${ext}`;
    const mp = multipart({ name, parents: [folderId], mimeType: mime, appProperties: { rid: rec.id, key: im.key, sha } }, new Blob([bytes], { type: mime }), mime);
    const r = await drive('/files', { method: 'POST', upload: true, params: { uploadType: 'multipart', fields: 'id' }, body: mp.body, contentType: mp.contentType });
    return { f: r.id, h: sha, m: mime };
  }
  async function downloadImage(ref) {
    const res = await drive(`/files/${ref.f}`, { params: { alt: 'media' }, raw: true });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const url = `data:${ref.m || 'image/jpeg'};base64,${bytesToB64(bytes)}`;
    if (ref.h && (await sha256(url)) !== ref.h) throw new SyncError('server', '이미지 내용이 달라요');
    return url;
  }
  // 이 기기의 기록 → Drive 기록 (이미지는 파일로 올리고 참조로 바꿔요. 같은 그림이 이미 올라가 있으면 다시 올리지 않아요)
  async function toRemoteRecord(rec, prevRemote, folderId) {
    const out = clone(rec);
    const reuse = new Map();
    if (prevRemote && !isTombLike(prevRemote)) refsOfRecord(prevRemote).forEach((x) => reuse.set(x.h, x));
    const ims = imagesOf(rec);
    for (let n = 0; n < ims.length; n += 1) {
      const im = ims[n];
      S.progress = { label: '이미지 올리는 중', i: (S.progress && S.progress.label === '이미지 올리는 중' ? S.progress.i : 0) + 1, n: (S.progress && S.progress.n) || ims.length };
      renderChip();
      const sha = await imgSha(rec, im);
      const ref = reuse.get(sha) || await imgLimit(() => uploadImage(rec, im, sha, folderId));
      if (im.idx == null) out[im.key] = { $img: ref }; else out[im.key][im.idx] = { $img: ref };
    }
    return out;
  }
  // Drive 기록 → 이 기기 기록 (참조를 이미지로 바꿔요)
  async function fromRemoteRecord(rrec) {
    const out = clone(rrec);
    const jobs = [];
    imageFields(rrec.type).forEach((f) => {
      const v = out[f.key];
      if (f.multi && Array.isArray(v)) v.forEach((x, i) => { if (isRef(x)) jobs.push(imgLimit(() => downloadImage(x.$img)).then((u) => { out[f.key][i] = u; })); });
      else if (isRef(v)) jobs.push(imgLimit(() => downloadImage(v.$img)).then((u) => { out[f.key] = u; }));
    });
    await Promise.all(jobs);
    // 아직 업데이트하지 않은 기기가 올린 기록의 없어진 칸(운동의 옛 칸, 빠른 기록의 "간단 기록" 표시, 예전 교재·곡 이름 모양)은 받을 때 정리해요 (바뀐 기록은 바꾼 시각이 새로워져서 정리된 모습이 Drive에도 올라가요)
    let clean = out;
    if (typeof workoutLiteCopy === 'function') clean = workoutLiteCopy(clean, true);
    if (typeof stripQuick === 'function') clean = stripQuick(clean, true);
    if (typeof violinCopy === 'function') clean = violinCopy(clean, true); // 예전 모양의 교재·곡 이름·교재 위치는 교재별 한 줄로, 기록 단위 템포는 첫 곡 줄로 옮겨요
    if (typeof weekLegacyCopy === 'function') clean = weekLegacyCopy(clean, true); // 🗓 예전 값(운동 종류 · 몸무게 · 예전 체크 해제 표시)은 정리에 동의한 뒤에만 받을 때 정리해요
    if (typeof simplifyCopy === 'function') clean = simplifyCopy(clean, true); // 클로드 요청 문구의 "할 일" 요청도 정리에 동의한 뒤에는 받아 올 때 같은 규칙이에요
    return clean;
  }

  /* ---------------------------------------------------------------------
     4-2. 🎙 녹음 (파일은 audio-<녹음id>.<확장자> 하나씩 · 정보는 journal.json 의 audios · 삭제 표시는 atombs)
          기록과 같은 규칙으로 합쳐요 (base 와 비교). 파일은 정보보다 먼저 올리고, 다른 기기에서는 정보만 먼저 받아요.
     --------------------------------------------------------------------- */
  const AUD_KEYS = ['piece', 'date', 'memo', 'createdAt', 'size', 'mime', 'name', 'recId']; // 내용이 같은지 볼 칸 (바꾼 시각·첫 녹음 표시·파일 id 는 빼요)
  const audSig = (x) => JSON.stringify(stable(Object.fromEntries(AUD_KEYS.map((k) => [k, x[k] === undefined ? null : x[k]]))));
  const localAudioMap = () => { const m = new Map(); audioTombs.forEach((t) => m.set(t.id, t)); audios.forEach((a) => m.set(a.id, a)); return m; };
  const remoteAudioMap = (j) => { const m = new Map(); (j.atombs || []).forEach((t) => m.set(t.id, t)); (j.audios || []).forEach((a) => m.set(a.id, a)); return m; };
  const audioEntry = (a) => ({ id: a.id, piece: a.piece, date: a.date, memo: a.memo || '', createdAt: a.createdAt, updatedAt: a.updatedAt, size: a.size, mime: a.mime, name: a.name || '', first: !!a.first, recId: a.recId || '', file: { f: a.rf, m: a.mime, s: a.size } });
  const audioTombEntry = (t) => ({ id: t.id, piece: t.piece || '', deletedAt: t.deletedAt, updatedAt: t.updatedAt });
  const audioRowFromEntry = (e) => ({ id: e.id, piece: e.piece, date: e.date, memo: e.memo || '', createdAt: e.createdAt, updatedAt: e.updatedAt, size: e.size, mime: e.mime, name: e.name || '', first: !!e.first, recId: e.recId || '', rf: (e.file && e.file.f) || '' });
  const audioFileCount = (j) => (j.audios || []).length;

  // 아직 올릴지 묻지 않았거나 "나중에"로 미뤄 둔 녹음은 올리지 않아요
  const audioHeld = (a) => !!S.meta && (!S.meta.audioAsked || S.meta.audioHold.includes(a.id));
  const audioPending = (a) => { const b = S.meta.abase[a.id]; return !b || b.lu !== a.updatedAt || b.ld; };
  const audioWaiting = (a) => (a.local || a.rf) && audioPending(a) && !(audioHeld(a) && !a.rf); // 올라가기를 기다리는 녹음 (미뤄 둔 것은 빼요)

  // 와이파이에서만 올리기: 연결 종류를 알 수 있는 브라우저(주로 안드로이드 크롬)에서 모바일 데이터(cellular)면 올리지 않고 기다려요
  function connInfo() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const t = c && typeof c.type === 'string' ? c.type : '';
    if (!t || t === 'unknown') return { known: false, cellular: false };
    return { known: true, cellular: t === 'cellular', type: t };
  }
  const wifiBlocked = () => !!(S.meta && S.meta.wifiOnly && connInfo().cellular);

  const AUDIO_PROG = '녹음 올리는 중';
  function audioProgress(a, sent, total) {
    S.audioProg[a.id] = { sent, total };
    if (S.progress && S.progress.label === AUDIO_PROG) S.progress.pct = total ? Math.floor((sent / total) * 100) : 0;
    renderChip();
  }
  const audioExt = (a) => extOf(a.name) || (typeof AUDIO_EXT_BY_MIME !== 'undefined' && AUDIO_EXT_BY_MIME[a.mime]) || 'm4a';
  /* 🎙 Drive 안의 위치: 동기화 폴더 / 바이올린 녹음 / <곡 이름> / <날짜> <곡 이름>.<확장자>  (같은 날 같은 곡이 여럿이면 " (2)", " (3)")
       곡 이름이 없으면 폴더 "곡 미정", 파일 "<날짜> 녹음". 파일 이름에 쓸 수 없는 문자(/ \ : 등)는 "-" 로 바꿔요.
       사이트는 파일 이름이 아니라 파일 id 로 찾아서, Drive에서 이름을 바꾸거나 폴더 안에서 옮겨도 깨지지 않아요. */
  const AUDIO_ROOT = '바이올린 녹음';
  const NO_PIECE_FOLDER = '곡 미정';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').trim().slice(0, 100).trim();
  const audioFolderName = (a) => safeName(pieceKey(a.piece)) || NO_PIECE_FOLDER;
  const audioBaseName = (a) => `${a.date || ''} ${safeName(pieceKey(a.piece)) || '녹음'}`.trim();
  const placeKey = (a) => `${a.date || ''}|${pieceKey(a.piece)}`; // 마지막으로 Drive에 맞춰 둔 곡·날짜 (a.pl). 곡이나 날짜가 바뀌면 달라져서 파일을 옮기고 이름을 바꿔요
  const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const audioLegacyName = (a) => `audio-${a.id}.${audioExt(a)}`; // 예전 이름 (시험·안내용)

  async function findChildFolder(parentId, name) {
    const r = await drive('/files', { params: { q: `name='${qEsc(name)}' and '${qEsc(parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`, fields: 'files(id,name,createdTime)', orderBy: 'createdTime', pageSize: '10' } });
    return (r.files || [])[0] || null;
  }
  const createChildFolder = (parentId, name) => drive('/files', { method: 'POST', json: { name, mimeType: FOLDER_MIME, parents: [parentId] }, params: { fields: 'id,name' } });
  // "바이올린 녹음" 폴더 (동기화 폴더 안). 없으면 만들어요
  async function ensureAudioRoot(folderId) {
    if (S.aroot) return S.aroot;
    if (S.meta.arootId) {
      try { const f = await drive(`/files/${S.meta.arootId}`, { params: { fields: 'id,trashed' } }); if (f && !f.trashed) { S.aroot = f.id; return f.id; } } catch (e) { if (e.kind !== 'notfound') throw e; }
      S.meta.arootId = '';
    }
    const found = await findChildFolder(folderId, AUDIO_ROOT) || await createChildFolder(folderId, AUDIO_ROOT);
    S.meta.arootId = found.id; S.aroot = found.id;
    return found.id;
  }
  // 곡 폴더 (이번 동기화 동안 기억해 둬요)
  async function ensureSongFolder(rootId, name) {
    if (S.sfold.has(name)) return S.sfold.get(name);
    const found = await findChildFolder(rootId, name) || await createChildFolder(rootId, name);
    S.sfold.set(name, found.id);
    return found.id;
  }
  // 폴더 안의 파일 이름들 (같은 이름이 있으면 " (2)" 를 붙이려고요)
  async function folderNames(folderId) {
    if (S.nameCache.has(folderId)) return S.nameCache.get(folderId);
    const names = new Map(); let pageToken;
    do {
      const r = await drive('/files', { params: { q: `'${qEsc(folderId)}' in parents and trashed=false`, fields: 'nextPageToken,files(id,name)', pageSize: '1000', pageToken } });
      (r.files || []).forEach((f) => names.set(String(f.name).toLowerCase(), f.id));
      pageToken = r.nextPageToken;
    } while (pageToken);
    S.nameCache.set(folderId, names);
    return names;
  }
  async function uniqueAudioName(folderId, base, ext, selfId) {
    const names = await folderNames(folderId);
    const free = (n) => { const id = names.get(n.toLowerCase()); return !id || id === selfId; };
    let name = `${base}.${ext}`;
    for (let n = 2; !free(name) && n < 500; n += 1) name = `${base} (${n}).${ext}`;
    return name;
  }
  const rememberName = (folderId, name, id) => { const m = S.nameCache.get(folderId); if (m) { for (const [k, v] of m) if (v === id) m.delete(k); m.set(String(name).toLowerCase(), id); } };
  // 새 녹음이 들어갈 곳: { parent: 곡 폴더, name }
  async function audioTarget(a, syncFolderId) {
    const root = await ensureAudioRoot(syncFolderId);
    const parent = await ensureSongFolder(root, audioFolderName(a));
    return { parent, name: await uniqueAudioName(parent, audioBaseName(a), audioExt(a), ''), root };
  }
  // 곡 폴더가 비었으면 지워요 (휴지통으로). "바이올린 녹음" 아래의 폴더만 건드려요
  async function cleanEmptySongFolder(parentId, syncFolderId) {
    if (!parentId || parentId === syncFolderId || parentId === S.meta.arootId) return;
    try {
      const f = await drive(`/files/${parentId}`, { params: { fields: 'id,name,mimeType,parents,trashed' } });
      if (!f || f.trashed || f.mimeType !== FOLDER_MIME || !S.meta.arootId || (f.parents || [])[0] !== S.meta.arootId) return;
      const r = await drive('/files', { params: { q: `'${qEsc(parentId)}' in parents and trashed=false`, fields: 'files(id)', pageSize: '1' } });
      if ((r.files || []).length) return;
      await trashFile(parentId);
      for (const [k, v] of [...S.sfold]) if (v === parentId) S.sfold.delete(k);
      S.nameCache.delete(parentId);
    } catch (e) { if (e.kind === 'auth' || e.kind === 'offline') throw e; /* 폴더 정리는 못 해도 괜찮아요 */ }
  }

  // Drive에 이미 올라가 있는 녹음 파일들 (같은 녹음을 두 번 올리지 않으려고 이번 동기화에서 한 번만 봐요).
  //   곡 폴더 안으로 옮겨져 있어도 찾을 수 있게 appProperties 로 찾고, 이 동기화 폴더의 것만 골라요 (예전 파일은 폴더 바로 아래, 새 파일은 sf 표시)
  async function listRemoteAudio(folderId) {
    if (S.audioIdx) return S.audioIdx;
    const idx = new Map(); let pageToken;
    do {
      const r = await drive('/files', { params: { q: `appProperties has { key='kind' and value='audio' } and trashed=false`, fields: 'nextPageToken,files(id,name,size,parents,appProperties)', pageSize: '1000', pageToken } });
      (r.files || []).forEach((f) => { const ap = f.appProperties || {}; if (ap.aid && ((f.parents || []).includes(folderId) || ap.sf === folderId)) idx.set(ap.aid, f); });
      pageToken = r.nextPageToken;
    } while (pageToken);
    S.audioIdx = idx;
    return idx;
  }

  const parseRange = (h) => { const m = /bytes=0-(\d+)/.exec(h || ''); return m ? Number(m[1]) + 1 : null; };
  // 이어 올리기 주소(세션)로 보내요. 결과: { done: 파일 } 끝남 · { offset } 서버가 받은 만큼 (null: 알 수 없어요) · { gone } 이 주소는 더 못 써요
  async function sessionPut(uri, contentRange, part) {
    let res;
    const headers = { 'Content-Range': contentRange };
    if (tokenValid()) headers.Authorization = `Bearer ${S.token}`;
    try { res = await fetch(uri, { method: 'PUT', headers, body: part }); } catch (e) { throw new SyncError('offline'); }
    if (res.status === 200 || res.status === 201) { try { return { done: await res.json() }; } catch (e) { throw new SyncError('server', '구글의 응답을 읽지 못했어요'); } }
    if (res.status === 308) return { offset: parseRange(res.headers.get('Range')) };
    if ([400, 404, 410, 416].includes(res.status)) return { gone: true };
    let reason = '';
    try { const j = await res.json(); reason = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status)) || ''; } catch (e) { /* 본문이 없어도 괜찮아요 */ }
    if (res.status === 401) throw new SyncError('auth');
    if (res.status === 403 && /storageQuotaExceeded/i.test(reason)) throw new SyncError('quota');
    if (res.status === 403) throw new SyncError('forbidden');
    if (res.status === 429) throw new SyncError('rate');
    throw new SyncError('server', `HTTP ${res.status}`);
  }
  async function verifyUploaded(f, total) { // 올라간 파일의 크기가 맞는지 확인해요
    if (f && f.id && Number(f.size) === total) return f;
    try { if (f && f.id) await trashFile(f.id); } catch (e) { /* 괜찮아요 */ }
    throw new SyncError('server', '올라간 녹음의 크기가 달라요');
  }
  async function uploadAudioOnce(meta, blob) {
    const mp = multipart(meta, blob, meta.mimeType);
    return drive('/files', { method: 'POST', upload: true, params: { uploadType: 'multipart', fields: 'id,size' }, body: mp.body, contentType: mp.contentType });
  }
  // 이어 올리기: 끊기면 어디까지 올라갔는지 이 기기(S.meta.up)와 구글에 남아 있어서, 다음에 거기서부터 이어서 올려요
  async function uploadAudioResumable(a, meta, blob) {
    const total = blob.size; const folder = meta.parents[0];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let up = S.meta.up[a.id];
      if (up && (up.size !== total || up.folderId !== folder || now() - up.at > SESSION_MAX_AGE)) { delete S.meta.up[a.id]; up = null; }
      let offset = 0;
      if (up) { // 끊겼던 올리기: 서버가 어디까지 받았는지 물어봐요
        const st = await sessionPut(up.uri, `bytes */${total}`);
        if (st.done) { delete S.meta.up[a.id]; await saveMeta(); return verifyUploaded(st.done, total); }
        if (st.gone || (st.offset == null && up.offset > 0)) { delete S.meta.up[a.id]; up = null; } // 이어 올릴 수 없으면 새로 시작해요
        else offset = st.offset || 0;
      }
      if (!up) {
        const res = await drive('/files', { method: 'POST', upload: true, params: { uploadType: 'resumable', fields: 'id,size' }, json: meta, headers: { 'X-Upload-Content-Type': a.mime, 'X-Upload-Content-Length': String(total) }, raw: true });
        const uri = res.headers.get('Location');
        if (!uri) return verifyUploaded(await uploadAudioOnce(meta, blob), total); // 이어 올리기 주소를 못 받으면 한 번에 올려요
        up = S.meta.up[a.id] = { uri, size: total, offset: 0, folderId: folder, at: now() };
        await saveMeta();
      }
      audioProgress(a, offset, total);
      let gone = false;
      while (offset < total) {
        const end = Math.min(offset + AUDIO_CHUNK, total);
        const r = await sessionPut(up.uri, `bytes ${offset}-${end - 1}/${total}`, blob.slice(offset, end));
        if (r.gone) { gone = true; break; }
        if (r.done) { delete S.meta.up[a.id]; await saveMeta(); return verifyUploaded(r.done, total); }
        offset = r.offset != null ? r.offset : end; // 서버가 알려 준 만큼 (알 수 없으면 보낸 만큼)
        up.offset = offset; await saveMeta();
        audioProgress(a, offset, total);
      }
      if (!gone) { // 끝까지 보냈는데 완료 응답이 없었으면 서버에 물어봐요
        const st = await sessionPut(up.uri, `bytes */${total}`);
        if (st.done) { delete S.meta.up[a.id]; await saveMeta(); return verifyUploaded(st.done, total); }
      }
      delete S.meta.up[a.id]; await saveMeta(); // 이 주소로는 안 돼요 → 새로 시작
    }
    throw new SyncError('server', '녹음을 올리지 못했어요');
  }
  // 녹음 파일 하나를 Drive의 곡 폴더에 올려요 (이미 올라가 있으면 다시 올리지 않아요). { id, placed } 를 돌려줘요. 이 기기에 파일이 없으면 id 는 ''
  //   placed: 곡 폴더 안에 있어요 (예전처럼 동기화 폴더 바로 아래의 audio-… 파일이면 false)
  async function ensureAudioUploaded(a, folderId) {
    const idx = await listRemoteAudio(folderId);
    const found = idx.get(a.id);
    if (found && Number(found.size) === a.size) return { id: found.id, placed: !(found.parents || []).includes(folderId) };
    const full = await AudioStore.get(a.id);
    if (!full || !full.blob) return { id: '', placed: false };
    const blob = full.blob;
    const loc = await audioTarget(a, folderId);
    const meta = { name: loc.name, parents: [loc.parent], mimeType: a.mime, appProperties: { kind: 'audio', aid: a.id, sf: folderId } };
    audioProgress(a, 0, blob.size);
    try {
      const f = blob.size <= AUDIO_ONE_SHOT ? await verifyUploaded(await uploadAudioOnce(meta, blob), blob.size) : await uploadAudioResumable(a, meta, blob);
      idx.set(a.id, { ...f, parents: [loc.parent], appProperties: meta.appProperties });
      rememberName(loc.parent, loc.name, f.id);
      return { id: f.id, placed: true };
    } finally { delete S.audioProg[a.id]; renderChip(); }
  }
  // 올릴 녹음 파일들을 먼저 올려요 (녹음 정보는 그 뒤에 journal.json 으로 올라가요). 미뤄 둔 것·와이파이를 기다리는 것은 이번에 올리지 않아요.
  async function uploadAudioFiles(apushes, folderId) {
    const todo = apushes.filter((it) => it.act === 'push' && !it.L.rf);
    let n = 0;
    for (const it of todo) {
      const a = it.L;
      if (audioHeld(a) || wifiBlocked() || !a.local) { it.act = 'skip'; it.deferred = true; continue; }
      n += 1;
      S.progress = { label: AUDIO_PROG, i: n, n: todo.filter((x) => !(audioHeld(x.L) || wifiBlocked() || !x.L.local)).length, pct: 0, audio: true };
      renderChip();
      try {
        const up = await ensureAudioUploaded(a, folderId);
        const rf = up.id;
        if (!rf) { it.act = 'skip'; it.deferred = true; continue; }
        const pl = up.placed ? placeKey(a) : '';
        await AudioStore.update(a.id, (row) => (row && !isAudioTomb(row) ? { ...row, rf, ...(pl ? { pl } : {}) } : undefined));
        a.rf = rf; if (pl) a.pl = pl;
      } catch (e) {
        if (!(e instanceof SyncError) || ['offline', 'auth', 'gis'].includes(e.kind)) throw e; // 인터넷·로그인 문제는 처음부터 다시
        it.act = 'skip'; it.failed = true; S.audioErr = S.audioErr || e; // 이 녹음만 못 올렸어요. 다른 기록의 동기화는 계속해요 (이 기기의 녹음은 그대로예요)
      }
    }
    S.progress = null;
  }

  // 녹음 파일 하나를 Drive 안에서 곡 폴더로 옮기고 이름을 "날짜 곡 이름"으로 바꿔요 (파일은 다시 올리지 않아요). 맞췄으면 true
  //   이미 같은 곡 폴더 안에 있고 이름이 "날짜 곡 이름" 모양이면 그대로 둬요 (사용자가 Drive에서 바꾼 이름·위치는 곡이나 날짜가 바뀔 때만 다시 맞춰요)
  async function placeAudio(a, fileId, syncFolderId) {
    let cur;
    try { cur = await drive(`/files/${fileId}`, { params: { fields: 'id,name,parents,trashed' } }); } catch (e) { if (e.kind === 'notfound') return false; throw e; }
    if (!cur || cur.trashed) return false;
    const root = await ensureAudioRoot(syncFolderId);
    const parent = await ensureSongFolder(root, audioFolderName(a));
    const ext = audioExt(a); const base = audioBaseName(a);
    const oldParents = cur.parents || [];
    const sameFolder = oldParents.length === 1 && oldParents[0] === parent;
    const nameOk = new RegExp(`^${escRe(base)}( \\(\\d+\\))?\\.${escRe(ext)}$`, 'i').test(cur.name || '');
    if (sameFolder && nameOk) return true;
    const name = await uniqueAudioName(parent, base, ext, fileId);
    const params = { fields: 'id,name,parents' };
    if (!sameFolder) { params.addParents = parent; if (oldParents.length) params.removeParents = oldParents.join(','); }
    await drive(`/files/${fileId}`, { method: 'PATCH', params, json: { name, appProperties: { kind: 'audio', aid: a.id, sf: syncFolderId } } });
    rememberName(parent, name, fileId);
    if (!sameFolder) for (const old of oldParents) await cleanEmptySongFolder(old, syncFolderId); // 비어 버린 곡 폴더는 지워요
    return true;
  }

  // 곡이나 날짜가 바뀐 녹음은 Drive 안에서 옮기고 이름을 바꿔요. 정리하기를 골랐다면 예전 audio-… 파일도 곡별 폴더로 옮겨요.
  //   (처음에는 예전 파일이 몇 개인지만 세어서 물어봐요. 인터넷·로그인 문제가 아닌 실패는 이 녹음만 건너뛰고 다음에 다시 해요)
  async function organizeAudio(folderId) {
    if (!AudioStore.ok()) return;
    const changed = audios.filter((a) => a.rf && a.pl && a.pl !== placeKey(a));
    const wantMove = S.meta.aorg === 'yes' && (S.organizeNow || S.legacyScan);
    const wantCount = !S.meta.aorgAsked;
    let legacy = [];
    if (changed.length || wantMove || wantCount) {
      try {
        if (wantMove || wantCount) {
          const idx = await listRemoteAudio(folderId);
          legacy = [...idx.entries()].filter(([aid, f]) => (f.parents || []).includes(folderId) && audios.some((x) => x.id === aid && x.rf === f.id)).map(([aid, f]) => ({ a: audios.find((x) => x.id === aid), f }));
          S.legacy = { ids: legacy.map((x) => x.a.id), n: legacy.length };
        }
        const todo = [...changed.map((a) => ({ a, f: { id: a.rf } })), ...(wantMove ? legacy : [])];
        let i = 0;
        for (const { a, f } of todo) {
          i += 1;
          S.progress = { label: '녹음 정리하는 중', i, n: todo.length };
          renderChip();
          try {
            if (await placeAudio(a, f.id, folderId)) {
              const pl = placeKey(a);
              await AudioStore.update(a.id, (row) => (row && !isAudioTomb(row) ? { ...row, pl } : undefined));
              a.pl = pl;
            }
          } catch (e) {
            if (!(e instanceof SyncError) || ['offline', 'auth', 'gis'].includes(e.kind)) throw e;
            S.audioErr = S.audioErr || e;
          }
        }
        if (wantMove) { S.meta.alegacy = 0; S.organizeNow = false; S.legacyScan = false; }
        else if (wantCount) S.meta.alegacy = S.legacy.n;
      } finally { S.progress = null; }
    }
  }

  // Drive에서 녹음 파일을 받아 Blob 으로 (진행은 onPct 로 알려요)
  async function downloadAudioBlob(a, onPct) {
    const res = await drive(`/files/${a.rf}`, { params: { alt: 'media' }, raw: true });
    const total = Number(res.headers.get('Content-Length')) || a.size || 0;
    let blob;
    try {
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader(); const parts = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value); got += value.length;
          if (total) onPct(Math.min(99, Math.floor((got / total) * 100)));
        }
        blob = new Blob(parts, { type: a.mime || 'audio/mpeg' });
      } else blob = new Blob([await res.arrayBuffer()], { type: a.mime || 'audio/mpeg' });
    } catch (e) { throw new SyncError('offline'); }
    if (a.size && blob.size !== a.size) throw new SyncError('server', '받은 녹음의 크기가 달라요');
    return blob;
  }
  // ▶ 재생·⬇ 파일로 저장을 눌렀을 때: 다른 기기에서 올린 녹음의 파일을 받아서 이 기기(my-journal-audio)에 보관해요. 이 기기에 파일이 생기면 true
  function fetchAudio(id) {
    const a = audios.find((x) => x.id === id);
    if (!a) return Promise.resolve(false);
    if (a.local) return Promise.resolve(true);
    if (S.audioDl.has(id)) return S.audioDl.get(id).promise;
    if (envMode() !== 'ok' || !S.meta || !S.meta.enabled) { toast('☁ 로그인하면 Drive에서 이 녹음을 받을 수 있어요.', 4000); return Promise.resolve(false); }
    if (!a.rf) { toast('Drive에서 이 녹음의 파일을 찾지 못했어요.', 4000); return Promise.resolve(false); }
    if (S.needReconnect && !tokenValid()) { reconnectNow(); toast('다시 연결한 뒤 이 녹음을 한 번 더 눌러 주세요.', 4500); return Promise.resolve(false); }
    const st = { pct: 0 };
    st.promise = (async () => {
      try {
        const blob = await downloadAudioBlob(a, (p) => { st.pct = p; renderAudioBadges(); });
        await AudioStore.update(id, (row) => (row && !isAudioTomb(row) ? { ...row, blob } : undefined)); // 그사이 지웠다면 저장하지 않아요
        const cur = audios.find((x) => x.id === id);
        if (cur) cur.local = true;
        return !!cur;
      } catch (e) {
        const kind = e instanceof SyncError ? e.kind : 'fatal';
        if (kind === 'auth') { S.needReconnect = true; setStatus('reconnect', FRIENDLY.auth); toast(FRIENDLY.auth, 4500); }
        else if (kind === 'offline') toast('인터넷에 연결되면 다시 눌러 주세요.', 4000);
        else if (kind === 'notfound') toast('Drive에서 이 녹음 파일을 찾지 못했어요. (Drive 폴더에서 지웠을 수 있어요)', 5000);
        else toast('녹음을 받지 못했어요. 잠시 뒤에 다시 눌러 주세요.', 4000);
        return false;
      } finally { S.audioDl.delete(id); renderAudioBadges(); }
    })();
    S.audioDl.set(id, st);
    renderAudioBadges();
    return st.promise;
  }

  // 녹음 줄에 보이는 작은 ☁ 표시 (이 기기에 파일이 있는 녹음)와 "눌러서 받기" 버튼의 글자
  function audioBadge(a) {
    if (!S.meta || !S.meta.enabled || envMode() !== 'ok' || !a.local) return '';
    const p = S.audioProg[a.id];
    if (p) return `☁ 올리는 중 ${Math.min(99, Math.floor((p.sent / (p.total || 1)) * 100))}%`;
    if (a.rf && !audioPending(a)) return '☁ 올라감';
    if (audioHeld(a) && !a.rf) return '☁ 올리기 전 (나중에)';
    if (!a.rf && wifiBlocked()) return '☁ 와이파이를 기다리는 중';
    return '☁ 대기';
  }
  function fetchLabel(a) {
    const d = S.audioDl.get(a.id);
    if (d) return `☁ 받는 중 ${d.pct}%`;
    if (!S.meta || !S.meta.enabled || envMode() !== 'ok') return '☁ 로그인하면 받을 수 있어요';
    return `☁ 눌러서 받기 · ${fmtMB(a.size || 0)}`;
  }
  function renderAudioBadges() {
    document.querySelectorAll('.rec-cloud[data-aid]').forEach((el) => { const a = audios.find((x) => x.id === el.dataset.aid); if (a) el.textContent = audioBadge(a); });
    document.querySelectorAll('.rec-fetch[data-aid]').forEach((el) => { const a = audios.find((x) => x.id === el.dataset.aid); if (a) el.textContent = fetchLabel(a); });
  }

  /* ---------------------------------------------------------------------
     5. 무엇을 할지 정하기 (이 기기 ↔ Drive, base 와 비교)
     --------------------------------------------------------------------- */
  function localMap() {
    const m = new Map();
    tombstones.forEach((t) => m.set(t.id, t));
    records.filter(syncable).forEach((r) => m.set(r.id, r));
    return m;
  }
  const remoteMap = (j) => { const m = new Map(); (j.tombs || []).forEach((t) => m.set(t.id, t)); (j.records || []).forEach((r) => m.set(r.id, r)); return m; };
  const tombOf = (t) => ({ id: t.id, type: t.type, date: t.date, deletedAt: t.deletedAt, updatedAt: t.updatedAt });

  // kind: 'rec' 기록 / 'aud' 녹음 (녹음은 같은 규칙에 내용 비교만 다르게 해요)
  async function decide(L, R, b, kind = 'rec') {
    const lt = isTombLike(L); const rt = isTombLike(R);
    if (!L && !R) return { act: 'skip' };
    if (L && !lt && !R) return { act: 'push' };
    if (!L && R && !rt) return { act: 'pull' };
    if (L && lt && !R) return { act: 'pushDel' };
    if (!L && R && rt) return { act: 'skip' };
    if (lt && rt) return { act: 'skip', both: true };
    const lchg = !b || L.updatedAt !== b.lu || lt !== !!b.ld;
    const rchg = !b || R.updatedAt !== b.ru || rt !== !!b.rd;
    if (!lt && !rt) { // 둘 다 살아 있음
      if (kind === 'rec' && L.type !== R.type) return { act: 'conflict', kind: 'edit' };
      if (b && !lchg && !rchg) return { act: 'skip' };
      if (b && lchg && !rchg) return { act: 'push' };
      if (b && !lchg && rchg) return R.updatedAt < b.ru ? { act: 'push' } : { act: 'pull' }; // Drive가 뒤로 돌아갔다면(다른 기기가 덮어씀) 내 것을 다시 올려요
      if (kind === 'aud' ? audSig(L) === audSig(R) : (await sigLocal(L)) === sigRemote(R)) return { act: 'converge' };
      if (kind === 'rec' && L.type === 'config') return L.updatedAt >= R.updatedAt ? { act: 'push' } : { act: 'pull' }; // 설정은 최신 것으로 자동
      return { act: 'conflict', kind: 'edit' };
    }
    if (!lt && rt) { // 나는 살아 있고 Drive에서는 지웠어요
      if (!b) return { act: 'conflict', kind: 'remoteDeleted' };
      if (!lchg) return { act: 'pullDel' };
      if (!rchg) return { act: 'push' };
      return { act: 'conflict', kind: 'remoteDeleted' };
    }
    // 나는 지웠고 Drive에는 살아 있어요
    if (!b) return { act: 'conflict', kind: 'localDeleted' };
    if (!rchg) return { act: 'pushDel' };
    if (!lchg) return { act: 'pull' };
    return { act: 'conflict', kind: 'localDeleted' };
  }

  async function makePlan(remote, remoteEff) {
    const L = localMap(); const R = remoteMap(remoteEff); const items = [];
    const ids = new Set([...L.keys(), ...R.keys()]);
    for (const id of ids) {
      const l = L.get(id); const r = R.get(id);
      const d = await decide(l, r, S.meta.base[id]);
      items.push({ id, L: l, R: r, ...d });
    }
    return items;
  }

  // 🎙 녹음도 같은 규칙으로 (녹음 정보만 견줘요. 파일은 올릴 때·받을 때만 다뤄요)
  async function makeAudioPlan(remoteEff) {
    if (!AudioStore.ok()) return [];
    const L = localAudioMap(); const R = remoteAudioMap(remoteEff); const items = [];
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(id); const r = R.get(id);
      if (l && !isTombLike(l) && !l.local && !l.rf && !r) continue; // 파일도 Drive 주소도 없는 빈 줄은 건너뛰어요
      items.push({ id, L: l, R: r, aud: true, ...(await decide(l, r, S.meta.abase[id], 'aud')) });
    }
    return items;
  }
  // "Drive 기준으로 새로 받기": 녹음은 이 기기에만 있는 것을 지우지 않아요. Drive에 있는 것을 받고, Drive에서 지운 것만 따라 지워요.
  function planReplaceLocalAudio(remote) {
    if (!AudioStore.ok()) return [];
    const R = remoteAudioMap(remote); const L = localAudioMap(); const items = [];
    R.forEach((r, id) => {
      const l = L.get(id);
      if (isTombLike(r)) { if (l && !isTombLike(l) && l.rf) items.push({ id, L: l, R: r, aud: true, act: 'dropLocal', force: true }); return; }
      if (l && !isTombLike(l) && audSig(l) === audSig(r) && l.rf === ((r.file && r.file.f) || '')) items.push({ id, L: l, R: r, aud: true, act: 'converge' });
      else items.push({ id, L: l, R: r, aud: true, act: 'pull', force: true });
    });
    L.forEach((l, id) => { if (!R.has(id) && !isTombLike(l)) items.push({ id, L: l, R: undefined, aud: true, act: 'push' }); });
    return items;
  }

  /* ---------------------------------------------------------------------
     6. 한 번의 동기화
     --------------------------------------------------------------------- */
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('my-journal-sync') : null;
  const tellOtherTabs = () => { try { if (bc) bc.postMessage('changed'); } catch (e) { /* 괜찮아요 */ } };

  function setStatus(st, err) { S.status = st; if (err !== undefined) S.lastError = err; renderChip(); refreshCard(); }

  const pendingCount = () => {
    if (!S.meta) return 0;
    let n = 0; const base = S.meta.base; const ab = S.meta.abase;
    records.filter(syncable).forEach((r) => { const b = base[r.id]; if (!b || b.lu !== r.updatedAt || b.ld) n += 1; });
    tombstones.forEach((t) => { const b = base[t.id]; if (!b || b.lu !== t.updatedAt || !b.ld) n += 1; });
    audios.forEach((a) => { if (audioWaiting(a)) n += 1; }); // 🎙 올라가기를 기다리는 녹음 ("나중에"로 미뤄 둔 것은 세지 않아요)
    audioTombs.forEach((t) => { const b = ab[t.id]; if (!b || b.lu !== t.updatedAt || !b.ld) n += 1; });
    return n;
  };
  const conflictCount = () => (S.meta ? Object.keys(S.meta.conflicts).length : 0);

  function runSync(reason) {
    if (!S.meta || !S.meta.enabled || envMode() !== 'ok') return Promise.resolve();
    if (S.running) { S.dirty = true; return Promise.resolve(); }
    const body = () => syncBody(reason);
    if (navigator.locks && navigator.locks.request) {
      return navigator.locks.request('my-journal-sync', { ifAvailable: true }, (lock) => (lock ? body() : undefined));
    }
    return body();
  }

  async function syncBody(reason) {
    S.running = true;
    S.lastRunAt = now();
    clearTimeout(S.retryT);
    try {
      if (navigator.onLine === false) throw new SyncError('offline');
      await loadMetaKeepMemory();
      if (S.needReconnect && !tokenValid()) { setStatus('reconnect'); return; }
      setStatus('syncing');
      if (!(await staleGate())) return;
      await ensureToken();
      await pass();
      S.backoffIdx = 0;
      S.meta.lastSyncAt = now();
      S.meta.firstDone = true;
      S.force = null; S.staleOk = false;
      await saveMeta();
      S.progress = null;
      setStatus('idle', '');
      const n = conflictCount();
      if (n && n !== S.conflictsSeen && typeof toast === 'function') toast(`☁ 충돌 ${n}개가 있어요. 위쪽 ☁ 를 눌러 확인해 주세요.`, 6000);
      S.conflictsSeen = n;
      setTimeout(maybeAskAudio, 50); // 이번 동기화가 끝난 뒤에
      setTimeout(maybeAskOrganize, 120);
    } catch (e) {
      S.progress = null;
      handleError(e);
    } finally {
      S.running = false;
      renderChip();
      if (S.dirty) { S.dirty = false; clearTimeout(S.debounceT); S.debounceT = setTimeout(() => { S.debounceT = null; runSync('again'); }, T.fast ? 20 : 2000); }
    }
  }

  // 다른 탭이 바꿨을 수 있으니, 동기화를 시작할 때 저장된 동기화 정보를 다시 읽어요 (토큰 등 메모리 상태는 그대로)
  async function loadMetaKeepMemory() {
    const m = await Store.get('__meta_sync');
    if (m) S.meta = normMeta(m);
  }

  function handleError(e) {
    if (!(e instanceof SyncError)) { e = new SyncError('fatal', e && e.message); console.error(e); }
    const msg = FRIENDLY[e.kind] || FRIENDLY.fatal;
    switch (e.kind) {
      case 'auth': S.needReconnect = true; setStatus('reconnect', msg); return;
      case 'missing': setStatus('missing', msg); return;
      case 'offline': case 'gis': setStatus('offline', msg); scheduleRetry(); return;
      case 'rate': case 'server': case 'fatal': setStatus('error', msg); scheduleRetry(); return;
      default: setStatus('error', msg); // 사용자가 손봐야 하는 문제(공간 부족·권한 등)는 자동으로 계속 시도하지 않아요
    }
  }
  function scheduleRetry() {
    clearTimeout(S.retryT);
    const base = T.backoff[Math.min(S.backoffIdx, T.backoff.length - 1)];
    S.backoffIdx += 1;
    const wait = T.fast ? 30 : Math.round(base * (0.85 + Math.random() * 0.3));
    S.nextRetryAt = now() + wait;
    S.retryT = setTimeout(() => runSync('retry'), wait);
    renderChip();
  }

  // 마지막 동기화가 오래됐으면(60일 넘게) 합치기 전에 먼저 물어봐요
  async function staleGate() {
    const m = S.meta;
    if (!m.firstDone || !m.lastSyncAt || S.staleOk || S.force) return true;
    if (now() - m.lastSyncAt <= CFG.staleDays * DAY) return true;
    setStatus('stale');
    if (!dlg.open && !dlg2.open && !S.staleShown) { S.staleShown = true; openStale(); } // 자동으로는 한 번만 띄워요 (그 뒤에는 칩을 누르면 열려요)
    return false;
  }

  async function pass() {
    const firstOrForce = !S.meta.firstDone || S.force === 'replaceRemote';
    let folderId = await ensureFolder(firstOrForce || S.createMissing);
    if (!folderId) throw new SyncError('missing');
    let jm = S.meta.journalId ? await journalMeta(S.meta.journalId) : null;
    if (!jm) {
      S.meta.journalId = '';
      const found = await findJournal(folderId);
      if (found) { jm = found; S.meta.journalId = found.id; }
    }
    if (!jm && S.meta.firstDone && !S.createMissing) throw new SyncError('missing');
    S.audioIdx = null; S.audioErr = null; S.aroot = null; S.sfold = new Map(); S.nameCache = new Map(); S.legacy = null;
    for (let round = 0; round < 3; round += 1) {
      const remote = jm ? await getRemote(jm) : emptyJournal();
      const remoteEff = S.force === 'replaceRemote' ? emptyJournal() : remote;
      const items = S.force === 'replaceLocal' ? planReplaceLocal(remote) : await makePlan(remote, remoteEff);
      const aitems = S.force === 'replaceLocal' ? planReplaceLocalAudio(remote) : await makeAudioPlan(remoteEff);
      await applyPulls(items);
      await applyAudioPulls(aitems);
      await organizeAudio(folderId); // 곡·날짜가 바뀐 녹음은 Drive 안에서 옮기고 이름을 바꿔요
      const res = await pushAll(items, aitems, remote, jm, folderId);
      if (res === 'retry') { jm = await journalMeta(S.meta.journalId); if (!jm) throw new SyncError('missing'); continue; }
      finishPass(items, aitems, remote);
      break;
    }
    S.createMissing = false;
  }
  const emptyJournal = () => ({ app: 'my-journal', kind: 'sync', syncVersion: 1, rev: 0, writtenAt: '', writer: '', records: [], tombs: [], audios: [], atombs: [] });
  async function getRemote(jm) {
    if (S.remote.journal && S.remote.version === jm.version) return S.remote.journal;
    const j = await downloadJournal(jm.id);
    if (!j || !Array.isArray(j.records)) throw new SyncError('server', 'journal.json 형식이 달라요');
    S.remote = { version: jm.version, journal: j };
    S.meta.remoteVersion = jm.version;
    return j;
  }

  // "Drive 기준으로 새로 받기": 이 기기의 동기화 대상 기록을 Drive 것으로 바꿔요
  function planReplaceLocal(remote) {
    const R = remoteMap(remote); const L = localMap(); const items = [];
    R.forEach((r, id) => { items.push({ id, L: L.get(id), R: r, act: isTombLike(r) ? 'dropLocal' : 'pull', force: true }); });
    L.forEach((l, id) => { if (!R.has(id)) items.push({ id, L: l, R: undefined, act: 'dropLocal', force: true }); });
    return items;
  }

  async function applyPulls(items) {
    const put = []; const tombs = []; const drop = []; let failed = 0;
    const pulls = items.filter((it) => it.act === 'pull');
    let done = 0;
    await Promise.all(pulls.map(async (it) => {
      try {
        const full = await fromRemoteRecord(it.R);
        const cur = localMap().get(it.id);
        // 가져오는 사이에 이 기기에서 또 고쳤다면 덮어쓰지 않아요 (다음 동기화에서 충돌로 알려 줘요)
        if (!it.force && cur && it.L && cur.updatedAt !== it.L.updatedAt) { it.act = 'skip'; it.skipped = true; return; }
        put.push(full); it.applied = true;
      } catch (e) {
        if (e.kind === 'auth') throw e;
        failed += 1; it.act = 'skip'; it.failed = true;
      }
      done += 1;
      S.progress = { label: '기록 받는 중', i: done, n: pulls.length };
      renderChip();
    }));
    items.forEach((it) => {
      if (it.act === 'pullDel' && it.L && !isTombLike(it.L)) { tombs.push(tombOf(it.R)); it.applied = true; }
      if (it.act === 'dropLocal') { drop.push(it.id); it.applied = true; }
    });
    if (put.length || tombs.length || drop.length) {
      await applySyncChanges({ put, tombs, drop });
      tellOtherTabs();
      renderSoon();
    }
    if (failed) { S.pullFailed = failed; }
  }

  // 🎙 Drive에서 온 녹음 정보를 이 기기에 반영해요. (파일은 받지 않아요. 목록에만 나타나고, 눌렀을 때 받아요)
  async function applyAudioPulls(aitems) {
    if (!AudioStore.ok()) return;
    const put = []; const tombs = []; const drop = [];
    aitems.forEach((it) => {
      if (it.act === 'pull') {
        const cur = localAudioMap().get(it.id);
        if (!it.force && cur && it.L && cur.updatedAt !== it.L.updatedAt) { it.act = 'skip'; it.skipped = true; return; } // 가져오는 사이에 이 기기에서 또 고쳤다면 덮어쓰지 않아요
        put.push(audioRowFromEntry(it.R)); it.applied = true;
      } else if (it.act === 'pullDel' && it.L && !isTombLike(it.L)) { tombs.push(audioTombEntry(it.R)); it.applied = true; }
      else if (it.act === 'dropLocal') { drop.push(it.id); it.applied = true; }
      else if (it.act === 'converge' && it.L && !isTombLike(it.L) && it.R && it.R.file && it.L.rf !== it.R.file.f) { put.push({ id: it.id, rf: it.R.file.f }); } // 같은 녹음이 이미 Drive에 있으면 그 파일을 쓰고 다시 올리지 않아요
    });
    if (S.meta.aorg === 'yes' && aitems.some((it) => it.act === 'pull')) S.legacyScan = true; // 업데이트하지 않은 기기가 예전 이름으로 올렸을 수도 있어서, 정리하기를 고른 뒤에는 새 녹음을 받을 때 한 번 살펴봐요
    if (put.length || tombs.length || drop.length) {
      await applyAudioChanges({ put, tombs, drop });
      tellOtherTabs();
      renderSoon();
      if (dlg.open && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#pieceAudio, #formAudioList'))) { const pb = dlg.querySelector('#pieceAudio, #formAudioList'); if (pb) refreshAudioUI(); }
    }
  }

  async function pushAll(items, aitems, remote, jm, folderId) {
    const pushes = items.filter((it) => it.act === 'push' || it.act === 'pushDel');
    const needCreate = !jm;
    if (!pushes.length && !aitems.some((it) => it.act === 'push' || it.act === 'pushDel') && !needCreate) return 'nothing';
    await uploadAudioFiles(aitems.filter((it) => it.act === 'push' || it.act === 'pushDel'), folderId); // 🎙 녹음 파일을 먼저 올려요 (그다음 그림, 마지막이 journal.json)
    const apushes = aitems.filter((it) => it.act === 'push' || it.act === 'pushDel');
    if (!pushes.length && !apushes.length && !needCreate) return 'nothing'; // 미뤄 둔 녹음뿐이면 올릴 것이 없어요
    const outR = new Map((S.force === 'replaceRemote' ? [] : remote.records || []).map((r) => [r.id, r]));
    const outT = new Map((S.force === 'replaceRemote' ? [] : remote.tombs || []).map((t) => [t.id, t]));
    const outA = new Map((S.force === 'replaceRemote' ? [] : remote.audios || []).map((a) => [a.id, a]));
    const outAT = new Map((S.force === 'replaceRemote' ? [] : remote.atombs || []).map((t) => [t.id, t]));
    const prevById = new Map((remote.records || []).map((r) => [r.id, r]));
    const total = pushes.filter((it) => it.act === 'push').reduce((n, it) => n + imagesOf(it.L).length, 0);
    S.progress = total ? { label: '이미지 올리는 중', i: 0, n: total } : null;
    for (const it of pushes) {
      if (it.act === 'push') { outR.set(it.id, await toRemoteRecord(it.L, prevById.get(it.id), folderId)); outT.delete(it.id); } else { outR.delete(it.id); outT.set(it.id, tombOf(it.L)); }
    }
    for (const it of apushes) { // 녹음 정보 (파일은 위에서 이미 올라갔어요)
      if (it.act === 'push') { outA.set(it.id, audioEntry(it.L)); outAT.delete(it.id); } else { outA.delete(it.id); outAT.set(it.id, audioTombEntry(it.L)); }
    }
    const cutoff = now() - CFG.tombstoneDays * DAY;
    [...outT.values()].forEach((t) => { if (t.deletedAt < cutoff) outT.delete(t.id); });
    [...outAT.values()].forEach((t) => { if (t.deletedAt < cutoff) outAT.delete(t.id); });
    const journal = { app: 'my-journal', kind: 'sync', syncVersion: 1, rev: (remote.rev || 0) + 1, writtenAt: new Date(now()).toISOString(), writer: S.meta.deviceId, records: [...outR.values()], tombs: [...outT.values()], audios: [...outA.values()], atombs: [...outAT.values()] };
    if (jm) { // 올리기 전에 Drive의 버전을 다시 확인해요. 그사이 다른 기기가 올렸다면 처음부터 다시 합쳐요.
      const cur = await journalMeta(jm.id);
      if (!cur) throw new SyncError('missing');
      if (cur.version !== jm.version) { S.remote = { version: '', journal: null }; return 'retry'; }
    }
    const up = await uploadJournal(jm && jm.id, folderId, journal);
    S.meta.journalId = up.id;
    S.meta.remoteVersion = up.version;
    S.remote = { version: up.version, journal };
    // 더 이상 쓰이지 않는 이미지·녹음 파일은 휴지통으로 (지운 녹음의 파일도 여기서 휴지통으로 가요)
    const keep = refFileIds(journal);
    const old = refFileIds(remote);
    apushes.forEach((it) => { if (it.act === 'pushDel' && it.L && it.L.rf) old.add(it.L.rf); });
    const audioFiles = new Set([...(remote.audios || []).map((e) => e.file && e.file.f), ...apushes.map((it) => it.L && it.L.rf)].filter(Boolean));
    const emptied = new Set();
    for (const f of old) { if (!keep.has(f)) { try { const r = await trashFile(f); if (audioFiles.has(f) && r && r.parents) r.parents.forEach((p) => emptied.add(p)); } catch (e) { /* 이미 없어도 괜찮아요 */ } } }
    for (const p of emptied) await cleanEmptySongFolder(p, folderId); // 지운 녹음으로 비어 버린 곡 폴더는 지워요
    items.forEach((it) => { if (it.act === 'push' || it.act === 'pushDel') it.applied = true; });
    apushes.forEach((it) => { it.applied = true; });
    return 'pushed';
  }

  // 결과를 base 에 적어 두고, 충돌 목록과 오래된 삭제 표시를 정리해요
  function finishPass(items, aitems, remote) {
    const conflicts = {};
    const cutoff = now() - CFG.tombstoneDays * DAY;
    const dropTombs = []; const dropATombs = [];
    const settle = (list, base, kindKey) => list.forEach((it) => {
      const { id, L, R } = it; const lt = isTombLike(L); const rt = isTombLike(R);
      if (it.act === 'conflict') { conflicts[id] = { kind: it.kind, remote: R ? clone(R) : null, ...(kindKey ? { k: kindKey } : {}) }; return; }
      if (it.failed || it.skipped || it.deferred) return;
      if (it.act === 'push' || it.act === 'pushDel') base[id] = { lu: L.updatedAt, ld: lt, ru: L.updatedAt, rd: lt };
      else if (it.act === 'pull') base[id] = { lu: R.updatedAt, ld: false, ru: R.updatedAt, rd: false };
      else if (it.act === 'pullDel') base[id] = { lu: R.updatedAt, ld: true, ru: R.updatedAt, rd: true };
      else if (it.act === 'dropLocal') delete base[id];
      else if (it.act === 'converge') base[id] = { lu: L.updatedAt, ld: false, ru: R.updatedAt, rd: false };
      else if (it.act === 'skip' && L && R) base[id] = { lu: L.updatedAt, ld: lt, ru: R.updatedAt, rd: rt };
    });
    const base = S.meta.base; const abase = S.meta.abase;
    settle(items, base, '');
    settle(aitems, abase, 'aud');
    // 양쪽에 없는 것은 base 에서 빼요. 60일 지난 삭제 표시는 이 기기에서도 정리해요.
    const live = new Set([...localMap().keys(), ...remoteMap(S.remote.journal || remote).keys()]);
    Object.keys(base).forEach((id) => { if (!live.has(id)) delete base[id]; });
    tombstones.forEach((t) => { if (t.deletedAt < cutoff && base[t.id] && base[t.id].ld) dropTombs.push(t.id); });
    if (dropTombs.length) { applySyncChanges({ drop: dropTombs }); dropTombs.forEach((id) => { delete base[id]; }); }
    const liveA = new Set([...localAudioMap().keys(), ...remoteAudioMap(S.remote.journal || remote).keys()]);
    Object.keys(abase).forEach((id) => { if (!liveA.has(id)) delete abase[id]; });
    audioTombs.forEach((t) => { if (t.deletedAt < cutoff && abase[t.id] && abase[t.id].ld) dropATombs.push(t.id); });
    if (dropATombs.length) { applyAudioChanges({ drop: dropATombs }); dropATombs.forEach((id) => { delete abase[id]; }); }
    Object.keys(S.meta.up).forEach((id) => { if (!audios.some((a) => a.id === id)) delete S.meta.up[id]; }); // 지운 녹음의 이어 올리기 기록은 정리해요
    S.meta.conflicts = conflicts;
    if (S.pullFailed) { const n = S.pullFailed; S.pullFailed = 0; throw new SyncError('server', `${n}개는 이번에 받지 못했어요`); }
    if (S.audioErr) { const e = S.audioErr; S.audioErr = null; throw e; } // 올리지 못한 녹음이 있었어요 (다른 것은 모두 올라갔고, 이 기기의 녹음은 그대로예요)
  }

  /* ---------------------------------------------------------------------
     7. 상태 칩 (위쪽) · 설정 창의 카드
     --------------------------------------------------------------------- */
  function ago(t) {
    const m = Math.max(0, Math.round((now() - t) / 60000));
    if (m < 1) return '방금';
    if (m < 60) return `${m}분 전`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}시간 전`;
    return `${Math.round(h / 24)}일 전`;
  }
  function chipModel() {
    const env = envMode();
    if (env === 'file') return { text: '☁ 배포된 주소에서 사용할 수 있어요', cls: 'off', title: '지금은 파일(file://)로 열었어요. 동기화는 배포된 주소에서만 쓸 수 있어요. 기록·백업은 그대로 써져요.' };
    if (env === 'noconfig') return { text: '☁ 설정 필요', cls: 'off', title: 'sync-config.js 에 구글 클라이언트 ID를 넣어야 해요. (README 참고)' };
    if (env === 'insecure') return { text: '☁ https 주소에서 사용할 수 있어요', cls: 'off', title: '동기화는 https:// 또는 localhost 주소에서만 쓸 수 있어요.' };
    if (!S.meta || !S.meta.enabled) return { text: '☁ 로그인', cls: 'off', title: '구글 드라이브와 동기화하려면 눌러 주세요' };
    const pend = pendingCount(); const c = conflictCount();
    if (S.needReconnect || S.status === 'reconnect') return { text: '☁ ⚠ 다시 연결', cls: 'warn', title: '눌러서 다시 로그인하면 쌓인 변경이 바로 올라가요' };
    if (S.status === 'stale') return { text: '☁ ⚠ 오랜만이에요 — 눌러 주세요', cls: 'warn', title: '오랜만에 동기화해요. 어떻게 할지 골라 주세요' };
    if (S.status === 'missing') return { text: '☁ ⚠ Drive 파일이 없어요', cls: 'warn', title: FRIENDLY.missing };
    if (S.status === 'welcome') return { text: '☁ 처음 연결 중…', cls: 'busy', title: '' };
    if (S.status === 'syncing') return { text: `☁ 동기화 중…${S.progress ? ` ${S.progress.label} ${S.progress.i}/${S.progress.n}${S.progress.pct != null ? ` · ${S.progress.pct}%` : ''}` : ''}`, cls: 'busy', title: '' };
    if (c) return { text: `☁ ⚠ 충돌 ${c}개`, cls: 'warn', title: '눌러서 어느 쪽을 남길지 골라 주세요' };
    if (S.status === 'offline') return { text: `☁ 대기 중${pend ? ` · ${pend}개` : ''} (오프라인)`, cls: 'busy', title: S.lastError };
    if (S.status === 'error') return { text: '☁ ⚠ 동기화 실패 · 다시 시도할게요', cls: 'err', title: S.lastError };
    if (pend) return { text: `☁ 대기 중 · ${pend}개`, cls: 'busy', title: '곧 올라가요' };
    return { text: `☁ ✓ 동기화됨 · ${S.meta.lastSyncAt ? ago(S.meta.lastSyncAt) : '방금'}`, cls: 'ok', title: '눌러서 자세히 보기' };
  }
  function renderChip() {
    const b = q$('#syncBtn');
    if (!b) return;
    const m = chipModel();
    b.hidden = false;
    b.textContent = m.text;
    b.className = `sync-chip ${m.cls}`;
    b.title = m.title || '';
    b.setAttribute('aria-label', `구글 드라이브 동기화: ${m.text.replace(/^☁\s*/, '')}`);
    renderAudioBadges(); // 녹음 줄의 작은 ☁ 표시도 함께 새로 고쳐요
  }
  function cardHTML() {
    const m = chipModel();
    return `<div class="card" id="syncCard" style="margin:0"><h3>☁ 구글 드라이브 동기화</h3>
      <p class="meta">${esc(m.text.replace(/^☁\s*/, ''))}</p>
      <p class="meta">${S.meta && S.meta.enabled && envMode() === 'ok' ? '🎙 녹음도 Drive에 올라가요.' : '🎙 녹음은 이 기기에만 저장돼요.'}</p>
      <button type="button" class="btn ${S.meta && S.meta.enabled ? 'ghost' : ''}" data-sync="detail">☁ 동기화 열기</button></div>`;
  }
  function refreshCard() {
    const c = q$('#syncCard');
    if (c && dlg.open) c.outerHTML = cardHTML();
  }

  /* ---------------------------------------------------------------------
     8. 창들: 자세히 · 로그아웃 · 첫 로그인 · 오랜만이에요 · 충돌
     --------------------------------------------------------------------- */
  // 🎙 녹음 안내 (로그인한 상태에서는 "녹음도 Drive에 올라가요", 아니면 "이 기기에만 저장돼요")
  const AUDIO_NOTE = '<p class="meta">🎙 <b>녹음은 이 기기에만 저장돼요.</b> (백업 파일에는 곡마다 첫 녹음만 들어가요. 녹음 줄의 "⬇ 파일로 저장"은 로그인하지 않아도 쓸 수 있어요)</p>';
  const AUDIO_NOTE_LOGIN = '<p class="meta">🎙 로그인하면 <b>녹음도 Drive에 올라가요.</b> 큰 파일은 이어 올리고, 다른 기기에서는 재생하거나 파일로 저장할 때 내려받아요. 로그인하기 전에는 녹음이 이 기기에만 저장돼요.</p>';

  function audioStats() {
    const onDrive = audios.filter((a) => a.rf && S.meta.abase[a.id]);
    const held = audios.filter((a) => a.local && !a.rf && audioHeld(a));
    return { onDrive, bytes: onDrive.reduce((n, a) => n + (a.size || 0), 0), waiting: audios.filter(audioWaiting).length, held, heldBytes: held.reduce((n, a) => n + (a.size || 0), 0) };
  }
  function audioSectionHTML() {
    if (!AudioStore.ok()) return '';
    const st = audioStats(); const ci = connInfo();
    return `<div class="sync-audio"><h3>🎙 녹음도 Drive에 올라가요</h3>
      <div class="sync-rows">
        <div><span class="meta">Drive의 녹음</span><b>${st.onDrive.length}개 · ${esc(fmtMB(st.bytes))}</b></div>
        <div><span class="meta">올리기 대기</span><b>${st.waiting}개</b>${st.held.length ? ` <span class="meta">(나중에로 미뤄 둔 ${st.held.length}개는 따로예요)</span>` : ''}</div>
      </div>
      ${st.held.length ? `<p style="margin:6px 0"><button type="button" class="btn" data-sync="audio-start">🎙 녹음 올리기 (${st.held.length}개 · 약 ${esc(fmtMB(st.heldBytes))})</button></p>` : ''}
      ${S.meta.aorg === 'later' && S.meta.alegacy ? `<p style="margin:6px 0"><button type="button" class="btn" data-sync="audio-organize">🎙 녹음을 곡별 폴더로 정리 (${S.meta.alegacy}개)</button></p>` : ''}
      <p style="margin:6px 0"><button type="button" class="btn ghost" data-sync="audio-folder">🎙 바이올린 녹음 폴더 열기</button></p>
      <label class="meta"><input type="checkbox" data-sync="wifi" ${S.meta.wifiOnly ? 'checked' : ''}> 와이파이에서만 녹음 올리기 <span class="hint">(꺼 두면 모바일 데이터로도 올라가요)</span></label>
      ${!ci.known ? '<p class="meta" style="margin:4px 0 0">이 브라우저는 연결 종류를 알 수 없어서 그냥 올려요.</p>' : (S.meta.wifiOnly && ci.cellular ? '<p class="meta" style="margin:4px 0 0">지금은 모바일 데이터라서, 와이파이에 연결되면 올릴게요.</p>' : '')}
      <p class="meta" style="margin:6px 0 0">Drive에는 <b>"${esc(CFG.folderName)} / ${esc(AUDIO_ROOT)} / 곡 이름"</b> 폴더에 <b>"날짜 곡 이름"</b> 파일로 올라가요. <b>Drive에서 파일을 지우지 말고 사이트에서 지워 주세요.</b> (이름을 바꾸거나 폴더 안에서 옮겨도 사이트는 파일을 찾아요)</p>
      <p class="meta" style="margin:6px 0 0">다른 기기에서 올린 녹음은 목록에만 먼저 나타나요. <b>▶ 재생</b>이나 <b>⬇ 파일로 저장</b>을 누를 때 파일을 내려받아요. 올리는 도중 끊겨도 다음에 이어서 올려요.</p>
    </div>`;
  }

  function openDetail() {
    const env = envMode();
    if (env === 'file') {
      openDlg(`<h2>☁ 구글 드라이브 동기화</h2>
        <p>동기화는 <b>배포된 주소에서 사용할 수 있어요.</b></p>
        <p class="meta">지금은 파일(file://)로 열어서 쓰고 있어요. 이대로도 기록·백업은 <b>전부 그대로</b> 써져요.${CFG.deployUrl ? `<br>배포 주소: ${esc(CFG.deployUrl)}` : ''}<br>배포하는 방법은 README의 「☁ 구글 드라이브 동기화」를 봐 주세요.</p>
        ${AUDIO_NOTE}
        <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`);
      return;
    }
    if (env === 'noconfig' || env === 'insecure') {
      openDlg(`<h2>☁ 구글 드라이브 동기화</h2>
        <p>${env === 'noconfig' ? '<b>sync-config.js</b> 에 구글 클라이언트 ID를 넣으면 쓸 수 있어요.' : '동기화는 <b>https://</b> 주소(또는 localhost)에서만 쓸 수 있어요.'}</p>
        <p class="meta">README의 「☁ 구글 드라이브 동기화 → 구글 설정」을 따라 해 주세요. 그동안 기록·백업은 그대로 써져요.</p>
        ${AUDIO_NOTE}
        <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`);
      return;
    }
    if (!S.meta.enabled) {
      loadGIS().catch(() => { /* 버튼을 눌렀을 때 다시 알려 줘요 */ });
      openDlg(`<h2>☁ 구글 드라이브 동기화</h2>
        <p>내 구글 드라이브에 기록을 저장해서, <b>아이맥과 갤럭시 Z 폴드가 같은 기록</b>을 보게 해요.</p>
        <ul class="meta">
          <li>이 앱이 만든 <b>"${esc(CFG.folderName)}" 폴더</b>만 사용해요. 내 다른 파일은 볼 수 없어요. (권한: drive.file)</li>
          <li>로그인 정보(토큰)는 <b>저장하지 않아요.</b> 창을 닫으면 사라져요.</li>
          <li>처음 로그인하면 <b>이 기기의 백업 파일이 자동으로 내려받아져요.</b></li>
        </ul>
        ${AUDIO_NOTE_LOGIN}
        <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button><button type="button" class="btn" data-sync="login">구글로 로그인</button></div>`);
      return;
    }
    const pend = pendingCount(); const c = conflictCount(); const m = chipModel();
    openDlg(`<h2>☁ 구글 드라이브 동기화</h2>
      <div class="sync-rows">
        <div><span class="meta">계정</span><b>${esc(S.meta.email || '(알 수 없음)')}</b></div>
        <div><span class="meta">상태</span><b>${esc(m.text.replace(/^☁\s*/, ''))}</b></div>
        <div><span class="meta">마지막 동기화</span><b>${S.meta.lastSyncAt ? `${esc(new Date(S.meta.lastSyncAt).toLocaleString('ko-KR'))} (${esc(ago(S.meta.lastSyncAt))})` : '아직 없어요'}</b></div>
        <div><span class="meta">대기 중인 변경</span><b>${pend}개</b></div>
        ${S.status === 'error' || S.status === 'offline' ? `<div><span class="meta">자세히</span><span>${esc(S.lastError)}</span></div>` : ''}
      </div>
      ${audioSectionHTML()}
      <div class="row" style="margin-top:12px">
        <button type="button" class="btn" data-sync="now" ${S.running ? 'disabled' : ''}>지금 동기화</button>
        <button type="button" class="btn ghost" data-sync="folder">Drive 폴더 열기</button>
        ${c ? `<button type="button" class="btn ghost purple" data-sync="conflicts">충돌 ${c}개 보기</button>` : ''}
        <button type="button" class="btn danger" data-sync="logout">로그아웃</button>
      </div>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`);
  }

  async function openAudioFolder() {
    try {
      let id = S.meta.arootId;
      if (!id && S.meta.folderId) { const f = await findChildFolder(S.meta.folderId, AUDIO_ROOT); id = f ? f.id : ''; if (id) { S.meta.arootId = id; await saveMeta(); } }
      if (!id) { toast('아직 Drive에 올라간 녹음이 없어요. 녹음을 올리면 "바이올린 녹음" 폴더가 생겨요.', 4500); return; }
      const f = await drive(`/files/${id}`, { params: { fields: 'webViewLink,trashed' } });
      if (f && f.webViewLink && !f.trashed) window.open(f.webViewLink, '_blank', 'noopener');
      else toast('Drive에서 "바이올린 녹음" 폴더를 찾지 못했어요. 다음 녹음을 올리면 다시 만들어요.', 4500);
    } catch (e) { toast('폴더 주소를 가져오지 못했어요. 잠시 뒤에 다시 눌러 주세요.', 3500); }
  }
  async function openFolder() {
    try {
      const f = await drive(`/files/${S.meta.folderId}`, { params: { fields: 'webViewLink' } });
      if (f && f.webViewLink) window.open(f.webViewLink, '_blank', 'noopener');
    } catch (e) { toast('폴더 주소를 가져오지 못했어요. 잠시 뒤에 다시 눌러 주세요.', 3500); }
  }

  /* ---- 로그인 ---- */
  function login() { // 버튼을 누르는 그 순간에 로그인 창을 열어야 브라우저가 막지 않아요 (그래서 await 전에 요청해요)
    if (envMode() !== 'ok') { openDetail(); return; }
    if (!gisReady()) { loadGIS().then(() => toast('로그인 도구를 불러왔어요. 한 번 더 눌러 주세요.', 3000), () => toast(FRIENDLY.gis, 4000)); return; }
    requestToken({ prompt: '' }).then(async () => {
      let email = '';
      try { email = await fetchEmail(); } catch (e) { /* 이메일 표시는 없어도 돼요 */ }
      const keepDevice = S.meta.deviceId; const last = S.meta.last;
      const same = !!(last && last.email && last.email === email && last.firstDone); // 로그아웃했던 그 계정이면 이어서 써요
      S.meta = { ...emptyMeta(), deviceId: keepDevice, enabled: true, email, wifiOnly: S.meta.wifiOnly, ...(same ? { base: last.base, abase: last.abase || {}, audioAsked: !!last.audioAsked, audioHold: last.audioHold || [], arootId: last.arootId || '', aorgAsked: !!last.aorgAsked, aorg: last.aorg || '', alegacy: last.alegacy || 0, folderId: last.folderId, journalId: last.journalId, firstDone: true, lastSyncAt: last.lastSyncAt, conflicts: last.conflicts || {} } : {}) };
      if (!same) await forgetAudioRefs(true); // 다른 계정이면 예전 Drive의 녹음 주소는 쓸 수 없어요
      S.needReconnect = false; S.remote = { version: '', journal: null };
      await saveMeta();
      closeDlg(); // 로그인 안내 창을 닫아요
      renderChip();
      if (same) { toast('☁ 다시 연결했어요. 이어서 동기화해요', 3500); await runSync('login'); } else await firstLogin();
    }).catch((e) => { toast(FRIENDLY[e.kind] || FRIENDLY.auth, 5000); renderChip(); });
  }
  function reconnectNow() { // 칩 한 번 누르기 → 바로 로그인 창 (중간 확인 창 없이). 성공하면 쌓인 변경을 바로 올려요.
    if (!gisReady()) { loadGIS().then(() => toast('로그인 도구를 불러왔어요. 한 번 더 눌러 주세요.', 3000), () => toast(FRIENDLY.gis, 4000)); return; }
    requestToken({ prompt: '', hint: S.meta.email }).then(() => {
      S.needReconnect = false;
      setStatus('idle', '');
      return runSync('reconnect');
    }).catch((e) => { toast(FRIENDLY[e.kind] || FRIENDLY.auth, 5000); renderChip(); });
  }

  /* ---- 처음 로그인 ---- */
  async function firstLogin() {
    setStatus('welcome');
    try {
      const real = records.filter(syncable);
      if (real.length && !S.backedUp) { await downloadBackup(`my-journal-backup-before-sync-${todayStr().replace(/-/g, '')}.json`); S.backedUp = true; } // 먼저 이 기기 백업 (같은 창 세션에서는 한 번만)
      const folderId = await ensureFolder(false);
      const jm = folderId ? await findJournal(folderId) : null;
      let remote = emptyJournal();
      if (jm) { S.meta.journalId = jm.id; remote = await getRemote(jm); }
      const rn = (remote.records || []).length;
      if (!rn || !real.length) {
        if (rn) toast(`☁ Drive의 기록 ${rn}개를 받아요`, 4000); else if (real.length) toast(`☁ 이 기기의 기록 ${real.length}개를 Drive에 올려요`, 4000);
        S.meta.firstDone = false; await saveMeta();
        await runSync('login');
        return;
      }
      openDlg(`<h2>☁ 처음 연결했어요</h2>
        <p>이 기기에 기록 <b>${real.length}개</b>, Drive에 기록 <b>${rn}개</b>가 있어요. 어떻게 할까요?</p>
        <div class="fl-opts">
          <button type="button" class="btn" data-sync="fl-merge">합치기 <small>(추천)</small></button>
          <p class="meta">양쪽 기록을 모두 남겨요. 같은 기록이 다르게 적혀 있을 때만 어느 쪽을 남길지 물어봐요.</p>
          <button type="button" class="btn danger" data-sync="fl-upload">이 기기 → Drive 로 덮어쓰기</button>
          <p class="meta">Drive에 있던 기록이 이 기기 기록으로 바뀌어요. (Drive 폴더의 "버전 관리"에서 한동안 되돌릴 수 있어요)</p>
          <button type="button" class="btn danger" data-sync="fl-download">Drive → 이 기기 로 덮어쓰기</button>
          <p class="meta">이 기기의 기록이 Drive 기록으로 바뀌어요. 방금 이 기기 백업 파일을 내려받았어요.</p>
        </div>
        <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">나중에</button></div>`);
      setStatus('welcome');
    } catch (e) { handleError(e); }
  }
  async function firstChoice(kind) {
    if (kind === 'fl-upload' && !confirm('Drive에 있던 기록이 이 기기 기록으로 바뀌어요.\n계속할까요?')) return;
    if (kind === 'fl-download' && !confirm('이 기기의 기록이 Drive 기록으로 바뀌어요.\n(이 기기 백업 파일은 이미 내려받았어요)\n계속할까요?')) return;
    closeDlg();
    S.force = kind === 'fl-upload' ? 'replaceRemote' : kind === 'fl-download' ? 'replaceLocal' : null;
    S.meta.firstDone = false;
    await saveMeta();
    await runSync('login');
  }

  /* ---- 오랜만이에요 ---- */
  function openStale() {
    const days = Math.floor((now() - S.meta.lastSyncAt) / DAY);
    openDlg(`<h2>☁ 오랜만이에요</h2>
      <p>마지막 동기화가 <b>${days}일 전</b>이에요. 지운 기록의 흔적은 ${CFG.tombstoneDays}일 뒤에 정리돼서, 그대로 합치면 예전에 지운 기록이 되살아날 수 있어요.</p>
      <p><b>Drive 기준으로 새로 받을까요?</b></p>
      <div class="fl-opts">
        <button type="button" class="btn" data-sync="stale-fresh">Drive 기준으로 새로 받기 <small>(추천)</small></button>
        <p class="meta">이 기기의 기록이 Drive 기록으로 바뀌어요. <b>먼저 이 기기 백업 파일을 자동으로 내려받아요.</b></p>
        <button type="button" class="btn ghost" data-sync="stale-merge">그래도 합치기</button>
        <p class="meta">이 기기에서 바꾼 것도 그대로 남기면서 합쳐요.</p>
      </div>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">나중에</button></div>`);
  }
  async function staleChoice(kind) {
    closeDlg();
    if (kind === 'stale-fresh') {
      try { await downloadBackup(`my-journal-backup-before-refresh-${todayStr().replace(/-/g, '')}.json`); } catch (e) { toast('백업 파일을 만들지 못해서 멈췄어요.', 4000); return; }
      S.force = 'replaceLocal';
    } else S.staleOk = true;
    await runSync('stale');
  }

  /* ---- Drive 파일이 사라졌을 때 ---- */
  function openMissing() {
    openDlg(`<h2>☁ Drive에서 파일이 사라졌어요</h2>
      <p>"${esc(CFG.folderName)}" 폴더나 <b>journal.json</b>을 찾지 못했어요. Drive에서 지웠거나 옮겼을 수 있어요.</p>
      <p class="meta"><b>이 기기의 기록은 그대로예요.</b> 이 기기의 기록으로 Drive에 다시 만들까요?</p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">나중에</button><button type="button" class="btn" data-sync="recreate">이 기기 기록으로 다시 만들기</button></div>`);
  }

  /* ---- 로그아웃 ---- */
  function openLogout() {
    const pend = pendingCount();
    openDlg(`<h2>☁ 로그아웃</h2>
      <p>구글 연결을 끊고 로그인 정보를 지워요. <b>이 기기의 기록은 그대로 남겨요.</b></p>
      ${pend ? `<p class="meta" style="color:var(--red)">아직 Drive에 올라가지 않은 변경이 ${pend}개 있어요. 먼저 "지금 동기화"를 하는 걸 권해요.</p>` : ''}
      <div class="fl-opts">
        <button type="button" class="btn" data-sync="logout-keep">로그아웃 (이 기기 기록은 남기기)</button>
        <button type="button" class="btn danger" data-sync="logout-wipe">로그아웃하고 이 기기의 기록도 지우기</button>
        <p class="meta">지우기 전에 백업 파일을 자동으로 내려받아요. 🎙 이 기기에 있는 녹음 파일은 지우지 않아요. (아직 받지 않은 녹음은 목록에서만 빠져요. Drive에는 그대로 있어요)</p>
      </div>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">취소</button></div>`);
  }
  async function doLogout(wipe) {
    if (wipe) {
      if (!confirm('이 기기의 기록을 지울까요?\n(백업 파일을 먼저 내려받아요. Drive의 기록은 그대로예요.)')) return;
      try { await downloadBackup(`my-journal-backup-before-wipe-${todayStr().replace(/-/g, '')}.json`); } catch (e) { toast('백업 파일을 만들지 못해서 멈췄어요.', 4000); return; }
    }
    const tok = S.token;
    try {
      if (gisReady()) {
        let t = tok;
        if (!t) { try { t = await requestToken({ prompt: 'none', hint: S.meta.email }); } catch (e) { t = null; } }
        if (t) await new Promise((res) => { try { google.accounts.oauth2.revoke(t, () => res()); } catch (e) { res(); } });
      }
    } catch (e) { /* 취소하지 못해도 이 기기에서는 끊어요 */ }
    S.token = null; S.tokenExp = 0; S.needReconnect = false; S.remote = { version: '', journal: null };
    clearTimeout(S.debounceT); clearTimeout(S.retryT);
    const keepDevice = S.meta.deviceId; const m0 = S.meta;
    S.meta = { ...emptyMeta(), deviceId: keepDevice, email: m0.email, wifiOnly: m0.wifiOnly, last: wipe ? null : { email: m0.email, base: m0.base, abase: m0.abase, audioAsked: m0.audioAsked, audioHold: m0.audioHold, arootId: m0.arootId, aorgAsked: m0.aorgAsked, aorg: m0.aorg, alegacy: m0.alegacy, folderId: m0.folderId, journalId: m0.journalId, firstDone: m0.firstDone, lastSyncAt: m0.lastSyncAt, conflicts: m0.conflicts } };
    await saveMeta();
    if (wipe) {
      await Store.remove([...records.map((r) => r.id), ...tombstones.map((t) => t.id)]);
      records = []; tombstones = [];
      await forgetAudioRefs(true);
    }
    setStatus('idle', '');
    closeDlg();
    renderSoon();
    tellOtherTabs();
    toast(wipe ? '☁ 로그아웃했어요. 이 기기의 기록도 지웠어요.' : '☁ 로그아웃했어요. 이 기기의 기록은 그대로예요.', 4500);
  }

  /* ---- 충돌 ---- */
  const HIDE_KEYS = new Set(['id', 'type', 'createdAt', 'updatedAt', 'sample', 'stamp', 'stampMsg', 'quick', 'deletedAt']);
  const typeLabel = (t) => (SCHEMAS[t] ? SCHEMAS[t].label : t);
  function labelOf(type, key) {
    const f = ((SCHEMAS[type] && SCHEMAS[type].fields) || []).find((x) => x.key === key || (x.keys && x.keys.includes(key)));
    if (f) return String(f.label).replace(/\s*-\s*선택$/, '');
    const gone = typeof RETIRED !== 'undefined' && RETIRED[type] && RETIRED[type][key]; // 화면에서는 뺐지만 값은 남아 있는 칸
    return gone || key;
  }
  function fmtVal(v) {
    if (v == null || v === '') return '(비어 있음)';
    if (isRef(v) || isB64(v)) return '🖼 그림';
    if (Array.isArray(v)) return v.length ? v.map((x) => (x && typeof x === 'object' && typeof x.name === 'string' && 'piece' in x ? (x.piece ? `${x.name} · ${x.piece}${x.tempo ? ` ♩${x.tempo}` : ''}` : x.name) : fmtVal(x))).join(', ') : '(비어 있음)'; // 교재별 한 줄은 "교재 · 곡"으로
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${fmtVal(x)}`).join(' · ');
    return String(v);
  }
  function titleOf(rec) {
    if (!rec) return '';
    if (rec.type === 'violin' && typeof pieceNamesOf === 'function') return pieceNamesOf(rec)[0] || '';
    if (rec.type === 'englishArticle' && !rec.title && typeof domainOf === 'function') return domainOf(rec.link) || '';
    const k = { violin: 'piece', art: 'topic', englishArticle: 'title', englishPodcast: 'title', workout: 'kind', rest: 'memo', econRoutine: 'note', econTerm: 'term', claudeFeedback: 'text', piecenote: 'piece' }[rec.type];
    return (k && rec[k]) || '';
  }
  async function valSigLocal(rec, k, v) {
    const f = imageFields(rec.type).find((x) => x.key === k);
    if (f && f.multi && Array.isArray(v)) return JSON.stringify(await Promise.all(v.map(async (x, i) => (isB64(x) ? { $h: await imgSha(rec, { key: k, idx: i, value: x }) } : x))));
    if (f && !f.multi && isB64(v)) return JSON.stringify({ $h: await imgSha(rec, { key: k, idx: null, value: v }) });
    return JSON.stringify(stable(v === undefined ? null : v));
  }
  function valSigRemote(v) { const conv = (x) => (isRef(x) ? { $h: x.$img.h } : Array.isArray(x) ? x.map(conv) : x); return JSON.stringify(stable(conv(v === undefined ? null : v))); }

  const AUD_LABEL = { memo: '메모', date: '날짜', piece: '곡', name: '파일 이름' };
  function audioConflictCard(id, c) {
    const L = localAudioMap().get(id); const R = c.remote;
    const kindText = { edit: '양쪽에서 다르게 고쳤어요', remoteDeleted: 'Drive에서는 지웠고, 이 기기에서는 고쳤어요', localDeleted: '이 기기에서는 지웠고, Drive에서는 고쳤어요' }[c.kind] || '';
    const lt = isTombLike(L); const rt = isTombLike(R); const ref = (!lt && L) || (!rt && R) || {};
    let rows = '';
    if (!lt && !rt && L && R) Object.keys(AUD_LABEL).filter((k) => (L[k] || '') !== (R[k] || '')).forEach((k) => { rows += `<div class="cf-row"><div class="cf-k">${AUD_LABEL[k]}</div><div class="cf-l pre">${esc(fmtVal(L[k]))}</div><div class="cf-r pre">${esc(fmtVal(R[k]))}</div></div>`; });
    else rows = `<div class="cf-row"><div class="cf-k">상태</div><div class="cf-l pre">${lt ? '이 기기에서 지웠어요' : esc(`메모: ${fmtVal(L && L.memo)}`)}</div><div class="cf-r pre">${rt ? 'Drive에서 지웠어요' : esc(`메모: ${fmtVal(R && R.memo)}`)}</div></div>`;
    const btns = c.kind === 'localDeleted'
      ? `<button type="button" class="btn small" data-sync="cf-local" data-id="${esc(id)}">삭제 유지하기</button><button type="button" class="btn small" data-sync="cf-remote" data-id="${esc(id)}">Drive 것 되살리기</button>`
      : c.kind === 'remoteDeleted'
        ? `<button type="button" class="btn small" data-sync="cf-local" data-id="${esc(id)}">이 기기 것 남기기</button><button type="button" class="btn small" data-sync="cf-remote" data-id="${esc(id)}">Drive 따라 지우기</button>`
        : `<button type="button" class="btn small" data-sync="cf-local" data-id="${esc(id)}">이 기기 것으로</button><button type="button" class="btn small" data-sync="cf-remote" data-id="${esc(id)}">Drive 것으로</button>`;
    return `<div class="card cf-card" data-cf="${esc(id)}"><div class="cf-head"><b>🎙 녹음 · ${esc(ref.piece || '')} · ${esc(ref.date || '')}</b><span class="meta">${esc(kindText)}</span></div>
      <div class="cf-cols"><div class="cf-colh">이 기기</div><div class="cf-colh">Drive</div></div>${rows}<div class="row" style="margin-top:8px">${btns}</div></div>`;
  }
  async function conflictCard(id, c) {
    if (c.k === 'aud') return audioConflictCard(id, c);
    const L = localMap().get(id); const R = c.remote;
    const kindText = { edit: '양쪽에서 다르게 고쳤어요', remoteDeleted: 'Drive에서는 지웠고, 이 기기에서는 고쳤어요', localDeleted: '이 기기에서는 지웠고, Drive에서는 고쳤어요' }[c.kind] || '';
    const lt = isTombLike(L); const rt = isTombLike(R);
    const head = `${typeLabel((L && L.type) || (R && R.type))} · ${(L && L.date) || (R && R.date) || ''}${titleOf(rt ? L : R) || titleOf(L) ? ` · ${esc(titleOf(rt ? L : R) || titleOf(L))}` : ''}`;
    let rows = '';
    if (!lt && !rt && L && R) {
      const keys = [...new Set([...Object.keys(L), ...Object.keys(R)])].filter((k) => !HIDE_KEYS.has(k));
      for (const k of keys) {
        if ((await valSigLocal(L, k, L[k])) === valSigRemote(R[k])) continue;
        const lv = imageFields(L.type).some((f) => f.key === k) && L[k] ? `<div class="cf-thumbs">${[].concat(L[k]).filter(isB64).map((u) => `<img src="${esc(u)}" alt="이 기기의 그림">`).join('')}</div>` : esc(fmtVal(L[k]));
        const rv = imageFields(R.type).some((f) => f.key === k) && R[k] ? `<div class="cf-thumbs">${[].concat(R[k]).filter(isRef).map((x) => `<img data-fid="${esc(x.$img.f)}" data-mime="${esc(x.$img.m || 'image/jpeg')}" alt="Drive의 그림" src="">`).join('')}</div>` : esc(fmtVal(R[k]));
        rows += `<div class="cf-row"><div class="cf-k">${esc(labelOf(L.type, k))}</div><div class="cf-l pre">${lv}</div><div class="cf-r pre">${rv}</div></div>`;
      }
    } else if (lt) {
      rows = `<div class="cf-row"><div class="cf-k">상태</div><div class="cf-l">이 기기에서 지웠어요</div><div class="cf-r pre">${esc(Object.keys(R || {}).filter((k) => !HIDE_KEYS.has(k)).map((k) => `${labelOf(R.type, k)}: ${fmtVal(R[k])}`).join('\n'))}</div></div>`;
    } else if (rt) {
      rows = `<div class="cf-row"><div class="cf-k">상태</div><div class="cf-l pre">${esc(Object.keys(L || {}).filter((k) => !HIDE_KEYS.has(k)).map((k) => `${labelOf(L.type, k)}: ${fmtVal(L[k])}`).join('\n'))}</div><div class="cf-r">Drive에서 지웠어요</div></div>`;
    }
    const btns = c.kind === 'edit'
      ? `<button type="button" class="btn small" data-sync="cf-local" data-id="${esc(id)}">이 기기 것으로</button>
         <button type="button" class="btn small" data-sync="cf-remote" data-id="${esc(id)}">Drive 것으로</button>
         <button type="button" class="btn small ghost" data-sync="cf-both" data-id="${esc(id)}">둘 다 남기기</button>`
      : c.kind === 'localDeleted'
        ? `<button type="button" class="btn small" data-sync="cf-local" data-id="${esc(id)}">삭제 유지하기</button><button type="button" class="btn small" data-sync="cf-remote" data-id="${esc(id)}">Drive 것 되살리기</button>`
        : `<button type="button" class="btn small" data-sync="cf-local" data-id="${esc(id)}">이 기기 것 남기기</button><button type="button" class="btn small" data-sync="cf-remote" data-id="${esc(id)}">Drive 따라 지우기</button>`;
    return `<div class="card cf-card" data-cf="${esc(id)}"><div class="cf-head"><b>${head}</b><span class="meta">${esc(kindText)}</span></div>
      <div class="cf-cols"><div class="cf-colh">이 기기</div><div class="cf-colh">Drive</div></div>${rows || '<p class="meta">내용은 같은데 저장 시각만 달라요.</p>'}
      <div class="row" style="margin-top:8px">${btns}</div></div>`;
  }
  async function openConflicts() {
    const ids = Object.keys(S.meta.conflicts);
    if (!ids.length) { openDetail(); return; }
    const cards = [];
    for (const id of ids) cards.push(await conflictCard(id, S.meta.conflicts[id]));
    openDlg(`<h2>☁ 충돌 ${ids.length}개</h2>
      <p class="meta">두 기기에서 같은 기록을 다르게 바꿨어요. 어느 쪽을 남길지 골라 주세요. 고르기 전까지 이 기기의 기록은 그대로예요.</p>
      ${cards.join('')}
      <div class="row" style="margin-top:8px"><button type="button" class="btn ghost" data-sync="cf-newest">남은 것 모두 최신 시각 것으로</button></div>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-act="closeDlg">닫기</button></div>`, 'wide');
    loadRemoteThumbs();
  }
  async function loadRemoteThumbs() {
    for (const img of document.querySelectorAll('#dlg img[data-fid]')) {
      try { img.src = await downloadImage({ f: img.dataset.fid, m: img.dataset.mime }); } catch (e) { img.alt = '(Drive 그림을 불러오지 못했어요)'; }
    }
  }
  const bumpAbove = (rec, ru) => Math.max(now(), (rec.updatedAt || 0) + 1, (ru || 0) + 1);
  async function resolveConflict(id, choice, quiet = false) {
    const c = S.meta.conflicts[id]; if (!c) return;
    if (c.k === 'aud') return resolveAudioConflict(id, c, choice, quiet);
    const L = localMap().get(id); const R = c.remote; const base = S.meta.base;
    try {
      if (choice === 'cf-local' || choice === 'cf-both') {
        if (c.kind === 'localDeleted') {
          const t = { ...tombOf(L), updatedAt: bumpAbove(L, R && R.updatedAt) };
          await applySyncChanges({ tombs: [t] });
          base[id] = { lu: 0, ld: false, ru: R.updatedAt, rd: false };
        } else {
          const rec = { ...L, updatedAt: bumpAbove(L, R && R.updatedAt) };
          await applySyncChanges({ put: [rec] });
          base[id] = { lu: 0, ld: false, ru: R.updatedAt, rd: isTombLike(R) };
        }
        if (choice === 'cf-both' && R && !isTombLike(R)) {
          const copy = await fromRemoteRecord(R);
          const tk = { violin: 'piece', art: 'topic', englishArticle: 'title', englishPodcast: 'title', workout: 'memo', rest: 'memo', econRoutine: 'note', econTerm: 'term', claudeFeedback: 'text', piecenote: 'memo' }[copy.type] || 'memo';
          copy.id = newId(); copy.createdAt = Date.now(); copy[tk] = `${copy[tk] || ''} (Drive에서 온 사본)`.trim();
          delete copy.stamp; delete copy.stampMsg;
          await saveRecord(copy);
        }
      } else if (choice === 'cf-remote') {
        if (isTombLike(R)) { await applySyncChanges({ tombs: [tombOf(R)] }); base[id] = { lu: R.updatedAt, ld: true, ru: R.updatedAt, rd: true }; } else {
          const full = await fromRemoteRecord(R);
          await applySyncChanges({ put: [full] });
          base[id] = { lu: R.updatedAt, ld: false, ru: R.updatedAt, rd: false };
        }
      }
      delete S.meta.conflicts[id];
      await saveMeta();
      tellOtherTabs(); renderSoon(); renderChip();
    } catch (e) { toast('충돌을 풀지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.', 4000); return; }
    if (quiet) return;
    if (conflictCount()) openConflicts(); else { closeDlg(); toast('☁ 충돌을 모두 풀었어요. 동기화할게요.', 3000); }
    runSync('resolved');
  }
  async function resolveAudioConflict(id, c, choice, quiet) {
    const L = localAudioMap().get(id); const R = c.remote; const ab = S.meta.abase;
    try {
      if (choice === 'cf-local') {
        const at = bumpAbove(L, R && R.updatedAt);
        if (c.kind === 'localDeleted') { await applyAudioChanges({ tombs: [{ ...audioTombEntry(L), rf: L.rf || '', deletedAt: at, updatedAt: at }] }); ab[id] = { lu: 0, ld: false, ru: R.updatedAt, rd: false }; }
        else { await applyAudioChanges({ put: [{ id, updatedAt: at }] }); await AudioStore.update(id, (row) => (row ? { ...row, updatedAt: at } : undefined)); ab[id] = { lu: 0, ld: false, ru: R.updatedAt, rd: isTombLike(R) }; }
      } else if (isTombLike(R)) { await applyAudioChanges({ tombs: [audioTombEntry(R)] }); ab[id] = { lu: R.updatedAt, ld: true, ru: R.updatedAt, rd: true }; }
      else { await applyAudioChanges({ put: [audioRowFromEntry(R)] }); ab[id] = { lu: R.updatedAt, ld: false, ru: R.updatedAt, rd: false }; }
      delete S.meta.conflicts[id];
      await saveMeta();
      tellOtherTabs(); renderSoon(); renderChip();
    } catch (e) { toast('충돌을 풀지 못했어요. 다시 눌러 주세요.', 4000); return; }
    if (quiet) return;
    if (conflictCount()) openConflicts(); else { closeDlg(); toast('☁ 충돌을 모두 풀었어요. 동기화할게요.', 3000); }
    runSync('resolved');
  }
  async function resolveAllNewest() {
    for (const id of Object.keys(S.meta.conflicts)) {
      const c = S.meta.conflicts[id]; const L = (c.k === 'aud' ? localAudioMap() : localMap()).get(id); const R = c.remote;
      const localNewer = !R || (L && L.updatedAt >= R.updatedAt);
      await resolveConflict(id, localNewer ? 'cf-local' : 'cf-remote', true);
    }
    closeDlg();
    toast('☁ 충돌을 모두 풀었어요. 동기화할게요.', 3000);
    runSync('resolved');
  }

  /* ---------------------------------------------------------------------
     9. 클릭 처리 · 시작
     --------------------------------------------------------------------- */
  function onChipClick() {
    const env = envMode();
    if (env !== 'ok' || !S.meta.enabled) { openDetail(); return; }
    if (S.needReconnect || S.status === 'reconnect') { reconnectNow(); return; } // 한 번 누르면 바로 로그인 창
    if (S.status === 'stale') { openStale(); return; }
    if (S.status === 'missing') { openMissing(); return; }
    if (S.status === 'welcome') { firstLogin(); return; }
    if (conflictCount()) { openConflicts(); return; }
    openDetail();
  }
  document.addEventListener('click', (e) => {
    const chip = e.target.closest && e.target.closest('#syncBtn');
    if (chip) { onChipClick(); return; }
    const b = e.target.closest && e.target.closest('[data-sync]');
    if (!b) return;
    const act = b.dataset.sync;
    switch (act) {
      case 'detail': openDetail(); break;
      case 'login': login(); break; // await 없이 바로 (로그인 창이 막히지 않게)
      case 'now':
        if (S.needReconnect && !tokenValid()) { closeDlg(); reconnectNow(); break; } // 로그인이 풀려 있으면 바로 로그인 창을 열어요
        closeDlg(); S.backoffIdx = 0; runSync('manual');
        break;
      case 'folder': openFolder(); break;
      case 'logout': openLogout(); break;
      case 'logout-keep': doLogout(false); break;
      case 'logout-wipe': doLogout(true); break;
      case 'conflicts': openConflicts(); break;
      case 'fl-merge': case 'fl-upload': case 'fl-download': firstChoice(act); break;
      case 'stale-fresh': case 'stale-merge': staleChoice(act); break;
      case 'recreate': closeDlg(); S.createMissing = true; S.meta.journalId = ''; S.meta.arootId = ''; S.meta.base = {}; S.meta.abase = {}; forgetAudioRefs(false).then(() => runSync('recreate')); break;
      case 'cf-local': case 'cf-remote': case 'cf-both': resolveConflict(b.dataset.id, act); break;
      case 'cf-newest': resolveAllNewest(); break;
      case 'wifi': S.meta.wifiOnly = !!b.checked; saveMeta().then(() => { if (dlg.open && dlg.querySelector('.sync-audio')) openDetail(); if (!S.meta.wifiOnly) runSync('wifi'); }); break;
      case 'audio-up': case 'audio-start': S.meta.audioAsked = true; S.meta.audioHold = []; saveMeta().then(() => { closeDlg(); runSync('audio'); }); break;
      case 'audio-later': closeDlg(); break;
      case 'audio-folder': openAudioFolder(); break;
      case 'audio-organize': case 'org-yes': S.meta.aorg = 'yes'; S.meta.aorgAsked = true; S.organizeNow = true; saveMeta().then(() => { closeDlg(); runSync('organize'); }); break; // 예전 녹음 파일을 곡별 폴더로 정리해요
      case 'org-later': closeDlg(); break;
      default: break;
    }
  });

  // 🎙 로그인 계정이 바뀌거나 이 기기 기록을 지울 때 / Drive 폴더를 다시 만들 때: 녹음의 Drive 주소를 잊어요 (이 기기의 녹음 파일은 지우지 않아요)
  //   dropGhosts: 파일 없이 목록만 있던 녹음(다른 기기에서 받은 정보)도 목록에서 빼요
  async function forgetAudioRefs(dropGhosts) {
    if (!AudioStore.ok()) return;
    const ghosts = dropGhosts ? audios.filter((a) => !a.local).map((a) => a.id) : [];
    const stale = audioTombs.map((t) => t.id);
    await applyAudioChanges({ drop: [...ghosts, ...(dropGhosts ? stale : [])] });
    for (const a of audios) { await AudioStore.update(a.id, (row) => { if (!row) return undefined; const { pl, ...rest } = row; return { ...rest, rf: '' }; }); a.rf = ''; delete a.pl; }
    S.meta.up = {};
  }

  // 🎙 처음 켜질 때(로그인 상태) 이 기기에 올라가지 않은 녹음이 있으면 올릴지 물어봐요. 창을 그냥 닫아도 "나중에"로 봐요.
  function maybeAskAudio() {
    const m = S.meta;
    if (!m || !m.enabled || envMode() !== 'ok' || m.audioAsked || !m.firstDone || S.running || dlg.open || dlg2.open || !AudioStore.ok()) return;
    const mine = audios.filter((a) => a.local && !a.rf);
    m.audioAsked = true;
    if (!mine.length) { saveMeta(); return; }
    m.audioHold = mine.map((a) => a.id);
    saveMeta();
    const bytes = mine.reduce((n, a) => n + (a.size || 0), 0);
    openDlg(`<h2>🎙 녹음도 Drive에 올릴까요?</h2>
      <p>이 기기에 있는 녹음 <b>${mine.length}개 (약 ${esc(fmtMB(bytes))})</b>를 Drive에 올릴 수 있어요. 올리면 다른 기기에서도 듣고 파일로 저장할 수 있어요.</p>
      <p class="meta">큰 파일은 이어 올리기로 올려요. 데이터가 걱정되면 ☁ 상세 창의 "와이파이에서만 녹음 올리기"를 켜 두세요. "나중에"를 골라도 ☁ 상세 창에서 언제든 올릴 수 있어요.</p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-sync="audio-later">나중에</button><button type="button" class="btn" data-sync="audio-up">올리기</button></div>`);
  }

  // 🎙 예전에 올린 녹음(audio-… 파일)이 있으면 곡별 폴더로 정리할지 물어봐요. 창을 그냥 닫아도 "나중에"로 봐요. (☁ 상세 창에서 언제든 다시 할 수 있어요)
  //   새로 올리는 녹음은 묻지 않고 곡별 폴더로 올라가요. 예전 파일이 없으면 묻지 않고 정리하기로 둬요.
  function maybeAskOrganize() {
    const m = S.meta;
    if (!m || !m.enabled || envMode() !== 'ok' || !m.firstDone || S.running || dlg.open || dlg2.open || !AudioStore.ok() || !S.legacy || m.aorgAsked) return;
    m.aorgAsked = true;
    if (!S.legacy.n) { m.aorg = 'yes'; m.alegacy = 0; saveMeta(); return; }
    m.aorg = 'later'; m.alegacy = S.legacy.n;
    saveMeta();
    const bytes = audios.filter((a) => S.legacy.ids.includes(a.id)).reduce((n, a) => n + (a.size || 0), 0);
    openDlg(`<h2>🎙 녹음을 곡별 폴더로 정리할까요?</h2>
      <p>Drive에 올라가 있는 녹음 <b>${S.legacy.n}개 (약 ${esc(fmtMB(bytes))})</b>를 <b>"${esc(AUDIO_ROOT)} / 곡 이름"</b> 폴더로 옮기고, 파일 이름을 <b>"날짜 곡 이름"</b>으로 바꿔요.</p>
      <p class="meta">파일을 다시 올리지 않고 Drive 안에서 옮기기만 해서 금방 끝나요. 앞으로 올리는 녹음은 처음부터 곡별 폴더로 올라가요. "나중에"를 골라도 ☁ 상세 창에서 언제든 정리할 수 있어요.</p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-sync="org-later">나중에</button><button type="button" class="btn" data-sync="org-yes">정리하기</button></div>`);
  }

  function notify() {
    tellOtherTabs(); // 같은 브라우저의 다른 탭 화면도 바뀐 기록을 보게 해요
    renderChip();
    if (!S.meta || !S.meta.enabled || envMode() !== 'ok' || S.needReconnect) return;
    clearTimeout(S.debounceT);
    S.debounceT = setTimeout(() => { S.debounceT = null; runSync('save'); }, T.fast ? 60 : T.debounce); // 저장하고 잠깐 뒤에 한 번에 올려요
  }

  function purgeOldTombs() { // 동기화를 안 쓰는 동안에도 60일 지난 삭제 표시는 정리해요
    const cutoff = now() - CFG.tombstoneDays * DAY;
    const old = tombstones.filter((t) => t.deletedAt < cutoff && (!S.meta.enabled || (S.meta.base[t.id] && S.meta.base[t.id].ld)));
    if (old.length) applySyncChanges({ drop: old.map((t) => t.id) });
    const oldA = audioTombs.filter((t) => t.deletedAt < cutoff && (!S.meta.enabled || (S.meta.abase[t.id] && S.meta.abase[t.id].ld)));
    if (oldA.length) applyAudioChanges({ drop: oldA.map((t) => t.id) });
  }

  async function boot() {
    await loadMeta();
    renderChip();
    if (bc) bc.onmessage = () => { // 다른 탭이 바꿨어요 → 저장된 것을 다시 읽어 와요 (몰려 와도 한 번만)
      clearTimeout(S.bcT);
      S.bcT = setTimeout(async () => { records = await loadRecords(); await reloadAudios(); await loadMeta(); renderSoon(); renderChip(); }, 200);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !S.meta || !S.meta.enabled || envMode() !== 'ok') return;
      if (S.needReconnect) { S.needReconnect = false; ensureToken().then(() => runSync('focus')).catch(() => renderChip()); return; } // 그사이 구글에 로그인했다면 조용히 이어져요
      if (now() - S.lastRunAt > T.refocus) runSync('focus');
      renderChip();
    });
    window.addEventListener('online', () => { S.backoffIdx = 0; if (S.meta && S.meta.enabled) runSync('online'); });
    window.addEventListener('offline', () => { if (S.meta && S.meta.enabled) setStatus('offline', FRIENDLY.offline); });
    setInterval(renderChip, 60000); // "N분 전" 갱신
    const conn = navigator.connection;
    if (conn && conn.addEventListener) conn.addEventListener('change', () => { if (S.meta && S.meta.enabled && S.meta.wifiOnly && !wifiBlocked()) runSync('conn'); }); // 와이파이에 연결되면 기다리던 녹음을 올려요
    dlg.addEventListener('close', () => { setTimeout(maybeAskAudio, 400); setTimeout(maybeAskOrganize, 700); });
    purgeOldTombs();
    if (envMode() !== 'ok' || !S.meta.enabled) return;
    loadGIS().catch(() => { /* 오프라인이면 나중에 다시 해요 */ });
    const go = () => { if (S.meta.firstDone) runSync('open'); else if (S.meta.enabled) firstLogin(); };
    if (window.__cleanupDone) go(); else { document.addEventListener('journal:cleanup-done', go, { once: true }); setTimeout(() => { if (!window.__cleanupDone) go(); }, 20000); }
  }
  if (window.__journalReady) boot(); else document.addEventListener('journal:ready', boot, { once: true });

  window.Sync = {
    notify, cardHTML, isEnabled: () => !!(S.meta && S.meta.enabled), openDetail,
    audioBadge, fetchLabel, fetchAudio,
    // 자동 시험용 (화면에서는 쓰지 않아요)
    __t: {
      S, T, CFG, maybeAskAudio, maybeAskOrganize, safeName, audioFolderName, audioBaseName, audioHeld, runSync, envMode, chipModel, pendingCount, conflictCount, loadMeta, saveMeta, firstLogin, decide, sigLocal, sigRemote, fmtVal, labelOf, resolveConflict,
      setNow: (fn) => { nowFn = fn; }, resetNow: () => { nowFn = () => Date.now(); }, gisReady, requestToken,
    },
  };
})();
