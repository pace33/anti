import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { createAccountVerifier } from "./account.mjs";
import { createGameConfig, AVATARS, avatarNativeSettings } from "./game-config.mjs";
import { execFile } from "node:child_process";
import { createCreatorStore,normalizeScene } from './creator.mjs';
import { resolveLocalAsset, assetReferenceReport } from './asset-compat.mjs';
import {listNovetus,novetusEntry,novetusReference,createNovetusDelivery,parseLegacyMesh,rightsNotice} from './novetus.mjs';
export function joinSettings(url, origin, identity) {
  const p = url.searchParams,
    userId = identity?.userId ?? Number(p.get("userId")),
    username = identity?.name ?? (p.get("username") || "").trim();
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647)
    throw Error("Invalid player ID");
  if (!/^[\p{L}\p{N}_.+ -]{1,64}$/u.test(username))
    throw Error("Invalid player name");
  if (p.get("websocketUrl") !== "webrtc://100000001")
    throw Error("Unknown room");
  return {
    ClientPort: 0,
    MachineAddress: "webrtc://100000001",
    ServerPort: 0,
    UserName: username,
    DisplayName: username,
    CharacterAppearance: "",
    GameId: "0",
    PlaceId: 0,
    UniverseId: 0,
    PingInterval: 20,
    UserId: userId,
    CreatorId: 0,
    CreatorTypeEnum: "User",
    MembershipType: "None",
    AccountAge: 0,
    SuperSafeChat: false,
    IsUnknownOrUnder13: false,
    ChatStyle: "ClassicAndBubble",
    VirtualVersion: 0,
    IsRobloxPlace: false,
    BaseUrl: origin + "/",
    ClientTicket: "",
    SessionId: "",
    BrowserTrackerId: "",
    FollowUserId: 0,
    CookieStoreEnabled: false,
    ...avatarNativeSettings(identity?.avatar || identity?.avatarId),
  };
}
export function makeServer({
  runtimeDir,
  hostKey = "",
  publicOrigin = "",
  assetProxy = false,
  requireAuth = false,
  verifyAccount,
  relay = false,
  gameStateFile,
  creatorDir,
  switchMap,
} = {}) {
  const root = path.dirname(fileURLToPath(import.meta.url)),
    runtime = path.resolve(runtimeDir || path.join(root, "private-runtime")),
    prefix = publicOrigin
      ? new URL(publicOrigin).pathname.replace(/\/$/, "")
      : "";
  const creator=createCreatorStore({dir:creatorDir || (gameStateFile ? path.join(path.dirname(gameStateFile),'robl-maps') : undefined),root});
  const delivery=createNovetusDelivery({dir:gameStateFile?path.join(path.dirname(gameStateFile),'robl-novetus-cache'):creatorDir&&path.join(creatorDir,'asset-cache')});
  let importsRunning=0;
  async function importLegacy(data,title,map=true,inspect=false){
    if(importsRunning>=2)throw Error('다른 맵을 변환 중입니다. 잠시 뒤 다시 열어 주세요.');importsRunning++;
    try{return await new Promise((resolve,reject)=>{const child=execFile(process.platform==='win32'?'python':'python3',[path.join(root,'import-legacy-map.py')],{timeout:15000,maxBuffer:2*1024*1024},(err,stdout)=>{try{const value=JSON.parse(stdout);if(err||value.error)reject(Error(value.error||'맵 가져오기 실패'));else resolve(value);}catch{reject(Error('맵 변환 결과를 읽지 못했습니다.'));}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({data,title,map,inspect}));});}finally{importsRunning--;}
  }
  const config = createGameConfig({stateFile:gameStateFile, creator, root});
  const restartMap = switchMap || (() => new Promise((resolve,reject) => {
    execFile(process.execPath,[path.join(root,'host-controller.mjs')],{
      cwd:root, timeout:300000, maxBuffer:256*1024,
      env:{...process.env, AYA_FORCE_RESTART:'1'},
    }, error => error ? reject(error) : resolve());
  }));
  let switching = false, mapError = '', activeMapId = null;
  const mapState = () => ({maps:config.catalog(),selectedId:config.map().id,activeId:activeMapId,switching,error:mapError,ready});
  let room = null,
    ready = false,
    nextConnection = 1,
    relayedBytes = 0;
  const tickets = new Map(),
    peers = new Map(),
    launches = new Map(),
    sessions = new Map(),
    rates = new Map();
  const allowedOrigins = new Set([
    publicOrigin ? new URL(publicOrigin).origin : "",
    "https://aiedue.ddns.net",
    "https://pace33.github.io",
  ]);
  const security = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
  const json = (res, status, value) => {
    res.writeHead(status, {
      ...security,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  const internal = (req) =>
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress,
    ) &&
    /^127\.0\.0\.1:\d+$/.test(req.headers.host || "") &&
    req.headers["x-robl-public"] !== "1";
  const identity = (req) => {
    const id = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("robl_session="))
      ?.slice(13);
    const s = sessions.get(id);
    return s && s.expires > Date.now() ? s : null;
  };
  const send = (p, v) => {
    if (p?.ws.readyState === 1) p.ws.send(JSON.stringify(v));
  };
  function prune() {
    for (const map of [tickets, launches, sessions, rates])
      for (const [k, v] of map) if (v.expires < Date.now()) map.delete(k);
  }
  function ticket(role, account = null) {
    prune();
    if (tickets.size > 128) throw Error("접속 요청이 많습니다.");
    const token = crypto.randomBytes(32).toString("hex");
    tickets.set(token, { role, account, expires: Date.now() + 120000 });
    return {
      connectCode: "100000001",
      transportUrl: "webrtc://100000001",
      websocketUrl: `${prefix}/game-host/ws?token=${token}`,
      iceServers: [],
    };
  }
  async function body(req,limit=16384) {
    let n = 0,
      parts = [];
    for await (const b of req) {
      n += b.length;
      if (n > limit) throw Error("Body too large");
      parts.push(b);
    }
    return JSON.parse(Buffer.concat(parts).toString() || "{}");
  }
  function file(req, res, filename) {
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile())
      return json(res, 404, { detail: "File not found" });
    const stat = fs.statSync(filename),
      ext = path.extname(filename),
      h = {
        ...security,
        "Content-Type":
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".mjs": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".wasm": "application/wasm",
            ".data": "application/octet-stream",
            ".rbxlx": "application/xml",
            ".png": "image/png",
          }[ext] || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": requireAuth
          ? "private,max-age=86400"
          : "public,max-age=86400",
      };
    if (ext === ".html") h["Cache-Control"] = "no-store";
    let start = 0,
      end = stat.size - 1,
      status = 200;
    if (req.headers.range) {
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (
        !m ||
        Number(m[1]) >= stat.size ||
        Number(m[2] || end) < Number(m[1])
      ) {
        res.writeHead(416, { ...h, "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }
      start = Number(m[1]);
      end = Math.min(Number(m[2] || end), end);
      status = 206;
      h["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
    }
    res.writeHead(status, { ...h, "Content-Length": end - start + 1 });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(filename, { start, end }).pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    try {
      const origin = publicOrigin || `http://${req.headers.host}`,
        u = new URL(req.url, origin),
        isInternal = internal(req),
        account = identity(req);
      if (prefix && u.pathname.startsWith(prefix + "/"))
        u.pathname = u.pathname.slice(prefix.length);
      const source = req.headers.origin;
      if (source && allowedOrigins.has(source)) {
        res.setHeader("Access-Control-Allow-Origin", source);
        res.setHeader("Vary", "Origin");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "authorization,content-type",
        );
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      }
      if (req.method === "OPTIONS") {
        res.writeHead(source && allowedOrigins.has(source) ? 204 : 403);
        res.end();
        return;
      }
      if (u.pathname === "/health")
        return json(res, 200, {
          ok: true,
          service: "aiedue-robl",
          hostConnected: peers.has("host"),
          ready,
          players: [...peers.values()].filter((p) => p.role === "guest").length,
          mode: requireAuth
            ? "account-only-classroom"
            : "private-technical-preview",
          transport: relay ? "native-wss-relay" : "webrtc",
          relayedBytes,
          mapId: config.map().id,
          mapTitle: config.map().title,
          activeMapId,
          switching,
          mapError,
        });
      if (u.pathname === "/launch" && req.method === "POST") {
        if (source && !allowedOrigins.has(source))
          return json(res, 403, { detail: "허용되지 않은 출처입니다." });
        prune();
        if (launches.size >= 128)
          return json(res, 429, { detail: "잠시 뒤 다시 입장해 주세요." });
        const ip = req.socket.remoteAddress,
          old = rates.get(ip) || { n: 0, expires: Date.now() + 60000 };
        if (++old.n > 200)
          return json(res, 429, { detail: "접속 요청이 많습니다." });
        rates.set(ip, old);
        const token = (req.headers.authorization || "").replace(/^Bearer /, "");
        let a;
        try {
          a = await verifyAccount(token);
        } catch {
          return json(res, 401, {
            detail: "에이두 로그인과 계정 정보를 다시 확인해 주세요.",
          });
        }
        const value = crypto.randomBytes(32).toString("hex");
        launches.set(value, {
          ...a,
          authExpires: a.expires,
          expires: Math.min(a.expires, Date.now() + 60000),
        });
        return json(res, 200, {
          name: a.name,
          launchUrl: `${publicOrigin || origin}/#ticket=${value}`,
        });
      }
      if (u.pathname === "/session" && req.method === "POST") {
        const b = await body(req),
          a = launches.get(b.ticket);
        launches.delete(b.ticket);
        if (!a || a.expires < Date.now())
          return json(res, 401, {
            detail: "한글 상점에서 다시 입장해 주세요.",
          });
        if (sessions.size >= 1024)
          return json(res, 429, { detail: "접속 요청이 많습니다." });
        const id = crypto.randomBytes(32).toString("hex");
        sessions.set(id, {
          ...a,
          expires: Math.min(a.authExpires, Date.now() + 60 * 60 * 1000),
        });
        res.setHeader(
          "Set-Cookie",
          `robl_session=${id}; Path=${prefix || "/"}; HttpOnly; SameSite=Strict; Max-Age=3600${publicOrigin.startsWith("https:") ? "; Secure" : ""}`,
        );
        return json(res, 200, { name: a.name, role: a.role, userId: a.userId });
      }
      if (u.pathname === "/me") {
        if (!account) return json(res, 401, { detail: "로그인이 필요합니다." });
        return json(res, 200, {
          name: account.name,
          role: account.role,
          userId: account.userId,
        });
      }
      if (u.pathname === "/" || u.pathname === "")
        return file(
          req,
          res,
          path.join(
            root,
            requireAuth && !isInternal
              ? "account-launcher.html"
              : "launcher.html",
          ),
        );
      if (requireAuth && !isInternal && !account)
        return json(res, 401, {
          detail: "에이두 한글 상점에서 로그인 후 입장해 주세요.",
        });
      if(u.pathname==='/editor'){
        if(!account)return json(res,401,{detail:'로그인이 필요합니다.'});
        if(u.searchParams.get('mode')==='map'&&account.role!=='teacher')return json(res,403,{detail:'교사 전용 맵 에디터입니다.'});
        return file(req,res,path.join(root,'editor.html'));
      }
      if(['/editor.js','/editor-novetus.js'].includes(u.pathname))return file(req,res,path.join(root,u.pathname.slice(1)));
      if(u.pathname.startsWith('/editor-assets/')){
        const rel=u.pathname.slice('/editor-assets/'.length);
        if(!/^(three\.(module|core)\.min\.js|OrbitControls\.js|materials\/(checker|brick|wood)\.png)$/.test(rel))return json(res,404,{detail:'Not found'});
        return file(req,res,path.join(root,'editor-assets',rel));
      }
      if(['/Asset/','/asset/','/Asset','/asset','/Asset.ashx','/asset.ashx'].includes(u.pathname)){
        const reference=u.searchParams.get('id')||u.searchParams.get('path');
        const asset=resolveLocalAsset(reference,root);
        if(asset)return file(req,res,asset.path);
        const upstream=novetusReference(reference);
        if(upstream&&['image','mesh','audio','asset'].includes(upstream.kind)){
          const original=await delivery.get(upstream.key);
          if(!['image','mesh','audio'].includes(original.kind))return json(res,415,{detail:'이 원본 파일은 이미지·메시·오디오가 아닙니다. 자료실에서 구조를 열어 주세요.'});
          return file(req,res,original.path);
        }
        if(!assetProxy)return json(res,404,{detail:'등록되지 않은 에셋입니다. 권리·호환성을 확인한 에셋만 제공됩니다.'});
      }
      if(u.pathname==='/assets/novetus')return json(res,200,listNovetus({q:u.searchParams.get('q'),kind:u.searchParams.get('kind'),offset:u.searchParams.get('offset')}));
      if(u.pathname==='/assets/novetus/open'&&req.method==='GET'){
        const e=novetusEntry(u.searchParams.get('key'));if(!e)return json(res,404,{detail:'목록에 없는 파일입니다.'});
        const original=await delivery.get(e.key),v={entry:e,notice:rightsNotice};
        if(original.kind==='image'||original.kind==='audio')return json(res,200,{...v,kind:original.kind,url:prefix+'/Asset/?id='+e.key});
        if(original.kind==='mesh')return json(res,200,{...v,kind:'mesh',mesh:parseLegacyMesh(original.data)});
        if(['map','model','animation'].includes(e.kind)||original.data.subarray(0,100).toString().trimStart().startsWith('<roblox')){
          const imported=await importLegacy(original.data.toString('base64'),e.path.split('/').at(-1).replace(/\.rbxlx?(\.bz2)?$/i,''),e.kind==='map',true);
          if(imported.scene)imported.scene.provenance={key:e.key,repo:e.repo,path:e.path,revision:e.revision};
          return json(res,200,{...v,...imported,kind:imported.scene?'scene':'inspector'});
        }
        return json(res,200,{...v,kind:'inspector',bytes:original.data.length,text:original.data.subarray(0,12000).toString('utf8'),notice:'원본 내용 보기입니다. 실행·장착하지 않습니다. '+rightsNotice});
      }
      if(u.pathname==='/assets/library')return json(res,200,assetReferenceReport(root));
      if(u.pathname.startsWith('/creator/')||u.pathname==='/avatar/custom'){
        if(!account)return json(res,401,{detail:'로그인이 필요합니다.'});
        if(req.method==='POST'&&source&&!allowedOrigins.has(source))return json(res,403,{detail:'허용되지 않은 출처입니다.'});
        if(u.pathname==='/avatar/custom'&&req.method==='POST')return json(res,200,{selected:config.customize(account.uid,await body(req)),appliesOn:'next-join'});
        if(account.role!=='teacher')return json(res,403,{detail:'교사만 맵을 만들고 편집할 수 있습니다.'});
        if(u.pathname==='/creator/maps'&&req.method==='GET')return json(res,200,{maps:creator.list(account)});
        if(u.pathname==='/creator/map'&&req.method==='GET')return json(res,200,creator.read(account,u.searchParams.get('id')));
        if(u.pathname==='/creator/map'&&req.method==='POST'){
          const b=await body(req,512*1024);if(switching)return json(res,409,{detail:'맵 변경 중에는 저장할 수 없습니다.'});
          const scene=normalizeScene(b.scene);
          const unknownImages=[...new Set(scene.objects.flatMap(o=>[o.texture,o.mesh?.texture]).filter(k=>novetusEntry(k)?.kind==='asset'))];
          if(unknownImages.length>16)throw Error('미분류 ID 이미지는 한 맵에서 최대 16개까지 형식을 확인합니다.');
          for(const key of unknownImages){const v=await delivery.get(key);if(v.kind!=='image')throw Error('이미지가 아닌 ID 에셋입니다. 자료실에서 원본 구조를 열어 주세요.');}
          return json(res,200,creator.write(account,scene,b.id,b.revision));
        }
        if(u.pathname==='/creator/import'&&req.method==='POST'){
          const b=await body(req,1500*1024);if(typeof b.data!=='string'||b.data.length>1400000||!/^[A-Za-z0-9+/=]+$/.test(b.data))return json(res,400,{detail:'파일 형식·크기를 확인해 주세요.'});
          const imported=await new Promise((resolve,reject)=>{const child=execFile(process.platform==='win32'?'python':'python3',[path.join(root,'import-legacy-map.py')],{timeout:10000,maxBuffer:1024*1024},(err,stdout)=>{try{const value=JSON.parse(stdout);if(err||value.error)reject(Error(value.error||'맵 가져오기 실패'));else resolve(value);}catch{reject(Error('맵 변환 결과를 읽지 못했습니다.'));}});child.stdin.end(JSON.stringify({data:b.data,title:b.title}));});
          return json(res,200,imported);
        }
      }
      if(u.pathname.startsWith('/host-avatar/')){
        if(!isInternal)return json(res,403,{detail:'Host access denied'});
        const id=Number(u.pathname.slice('/host-avatar/'.length));
        const peer=[...peers.values()].find(p=>p.account?.userId===id);
        if(!peer)return json(res,404,{detail:'Verified player not connected'});
        const a=config.avatar(peer.account.uid),rgb=hex=>{const n=parseInt(hex.slice(1),16);return [(n>>16)&255,(n>>8)&255,n&255].map(x=>x/255);};
        return json(res,200,{id:a.id,head:rgb(a.skin),torso:rgb(a.torso),legs:rgb(a.legs),hair:a.hair,hairColor:rgb(a.hairColor),jacket:rgb(a.jacket)});
      }
      if (u.pathname === '/host-config') {
        if (!isInternal || !hostKey || req.headers['x-aya-host-key'] !== hostKey)
          return json(res,403,{detail:'Host access denied'});
        return json(res,200,{map:config.map()});
      }
      if (u.pathname === '/maps' && req.method === 'GET')
        return json(res,200,mapState());
      if (u.pathname === '/avatar') {
        if (!account) return json(res,401,{detail:'로그인이 필요합니다.'});
        if (req.method === 'GET') return json(res,200,{selected:config.avatar(account.uid),avatars:AVATARS});
        if (req.method === 'POST') {
          if(source && !allowedOrigins.has(source)) return json(res,403,{detail:'허용되지 않은 출처입니다.'});
          const b=await body(req);
          return json(res,200,{selected:config.setAvatar(account.uid,b.id),appliesOn:'next-join'});
        }
      }
      if (u.pathname === '/maps/select' && req.method === 'POST') {
        if (account?.role !== 'teacher') return json(res,403,{detail:'교사만 맵을 선택할 수 있습니다.'});
        if(source && !allowedOrigins.has(source)) return json(res,403,{detail:'허용되지 않은 출처입니다.'});
        if(switching) return json(res,409,{detail:'맵 변경이 진행 중입니다.'});
        const b=await body(req), target=config.map(b.id);
        if(!fs.existsSync(target.path)) return json(res,400,{detail:'아직 준비되지 않은 맵입니다.'});
        const previous=config.map();
        if(target.id===previous.id && ready && b.forceRestart!==true) return json(res,200,mapState());
        const occupied=[...peers.values()].filter(p=>p.role==='guest').length;
        if(occupied && b.confirmRestart!==true) return json(res,409,{detail:`현재 ${occupied}명이 접속 중입니다. 모두 재입장해야 하므로 확인이 필요합니다.`,players:occupied,needsConfirmation:true});
        config.setMap(target.id);
        switching=true;ready=false;mapError='';
        for(const [id,t] of tickets)if(t.role==='guest')tickets.delete(id);
        for(const [id,p] of peers)if(p.role==='guest'){send(p,{type:'map-changing',mapId:target.id});peers.delete(id);p.ws.close(1012,'Teacher changed map');}
        Promise.resolve().then(()=>restartMap(target)).catch(async(error)=>{
          if(gameStateFile)fs.writeFileSync(path.join(path.dirname(gameStateFile),'robl-last-map-error.log'),String(error?.stack||error)+'\n'+String(error?.stdout||'')+'\n'+String(error?.stderr||''),{mode:0o600});
          ready=false;config.setMap(previous.id);
          mapError='새 맵을 열지 못해 이전 맵으로 복구했습니다.';
          try{await restartMap(previous);}catch{mapError='맵을 열지 못했습니다. 이전 맵을 선택한 상태로 서버 복구 중입니다.';}
        }).finally(()=>{switching=false;});
        return json(res,202,mapState());
      }
      if (u.pathname === "/game-host/create" && req.method === "POST") {
        if (
          !isInternal ||
          !hostKey ||
          req.headers["x-aya-host-key"] !== hostKey
        )
          return json(res, 403, { detail: "Host access denied" });
        if (peers.has("host"))
          return json(res, 409, { detail: "Host already running" });
        await body(req);
        room = { code: "100000001" };
        ready = false;
        return json(res, 200, ticket("host"));
      }
      if (u.pathname === "/game-host/join" && req.method === "POST") {
        const b = await body(req);
        if (!room || !ready || b.connectCode !== room.code)
          return json(res, 503, { detail: "서버가 준비 중입니다." });
        if (
          [...peers.values()].filter((p) => p.role === "guest").length +
            [...tickets.values()].filter((p) => p.role === "guest").length >=
          8
        )
          return json(res, 429, {
            detail: "공원이 가득 찼어요. 최대 8명이 함께할 수 있어요.",
          });
        if (
          account &&
          [...peers.values()].some((p) => p.account?.uid === account.uid)
        )
          return json(res, 409, {
            detail: "같은 계정이 이미 공원에 접속 중입니다.",
          });
        return json(res, 200, ticket("guest", account));
      }
      if (u.pathname === "/host-ready" && req.method === "POST") {
        if (
          !isInternal ||
          !hostKey ||
          req.headers["x-aya-host-key"] !== hostKey ||
          !peers.has("host")
        )
          return json(res, 403, { detail: "Host access denied" });
        const b=await body(req);
        if(b.mapId && b.mapId!==config.map().id) return json(res,409,{detail:'Stale host map'});
        activeMapId=config.map().id;
        ready = true;
        return json(res, 200, { ok: true });
      }
      if (u.pathname === "/game/join.ashx") {
        res.writeHead(200, {
          ...security,
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end("\r\n" + JSON.stringify(joinSettings(u, origin, account ? {...account,avatarId:config.avatar(account.uid).id,avatar:config.avatar(account.uid)} : null)));
        return;
      }
      if (u.pathname === "/streaming/token")
        return json(res, 404, { detail: "StreamingFrame is not enabled" });
      if (u.pathname === "/runtime" || u.pathname === "/runtime/") {
        if (!isInternal && u.searchParams.get("apptype") !== "player")
          return json(res, 403, { detail: "플레이어 입장만 가능합니다." });
        let html = fs.readFileSync(path.join(runtime, "index.html"), "utf8").replaceAll('Aya.GameWebRtc.js','Aya.GameWebRtc.js?v=maps-avatar-1');
        if (prefix && !isInternal) {
          html = html
            .replaceAll("/runtime/", prefix + "/runtime/")
            .replaceAll("/game/join.ashx", prefix + "/game/join.ashx")
            .replaceAll("/game-host/", prefix + "/game-host/")
            .replaceAll("/streaming/token", prefix + "/streaming/token");
          const shim = `<script>(()=>{const p=${JSON.stringify(prefix)},f=window.fetch.bind(window);window.fetch=(v,o)=>{const u=new URL(v instanceof Request?v.url:String(v),location.href);if(u.origin===location.origin&&/^\\/(game-host|game|streaming|asset)\\//.test(u.pathname))return f(p+u.pathname+u.search,o);return f(v,o);};})();<\/script>`;
          html = html.replace("<head>", "<head>" + shim);
        }
        res.writeHead(200, {
          ...security,
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(html);
        return;
      }
      if (u.pathname.startsWith("/runtime/")) {
        const name = decodeURIComponent(u.pathname.slice(9));
        if (!/^[a-zA-Z0-9_.-]+$/.test(name))
          return json(res, 404, { detail: "Invalid asset path" });
        if (relay && name === "Aya.GameWebRtc.js")
          return file(req, res, path.join(root, "packet-relay.js"));
        return file(req, res, path.join(runtime, name));
      }
      if (u.pathname === "/test-park.rbxlx") {
        if (!isInternal) return json(res, 403, { detail: "Private map" });
        return file(req, res, path.join(root, "test-park.rbxlx"));
      }
      if (u.pathname === "/asset/" && assetProxy) {
        const id = u.searchParams.get("id");
        if (!/^\d{1,12}$/.test(id || ""))
          return json(res, 400, { detail: "Invalid asset ID" });
        const remote = await fetch(`https://aya.nodium.lol/asset/?id=${id}`, {
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        });
        if (!remote.ok) return json(res, 404, { detail: "Asset unavailable" });
        const size = Number(remote.headers.get("content-length"));
        if (!Number.isFinite(size) || size > 8 * 1024 * 1024)
          return json(res, 413, { detail: "Asset size rejected" });
        let n = 0,
          parts = [];
        for await (const chunk of remote.body) {
          n += chunk.length;
          if (n > 8 * 1024 * 1024) throw Error("Asset too large");
          parts.push(chunk);
        }
        res.writeHead(200, {
          ...security,
          "Content-Type":
            remote.headers.get("content-type") || "application/octet-stream",
          "Cache-Control": "private,max-age=86400",
        });
        res.end(Buffer.concat(parts));
        return;
      }
      return json(res, 404, { detail: "Not found" });
    } catch (e) {
      if (!res.headersSent) json(res, [403,409].includes(e.status)?e.status:400, { detail: e.message });
      else res.destroy();
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024 * 1024 + 4,
    perMessageDeflate: false,
  });
  server.on("upgrade", (req, socket, head) => {
    let u = new URL(req.url, "http://localhost");
    if (prefix && u.pathname.startsWith(prefix + "/"))
      u.pathname = u.pathname.slice(prefix.length);
    const key = u.searchParams.get("token"),
      t = tickets.get(key);
    if (
      u.pathname !== "/game-host/ws" ||
      !t ||
      t.expires < Date.now() ||
      (t.role === "host" && peers.has("host")) ||
      (t.role === "guest" &&
        (!ready ||
          !peers.has("host") ||
          peers.size >= 9 ||
          (requireAuth &&
            !internal(req) &&
            identity(req)?.uid !== t.account?.uid))) ||
      (t.account &&
        [...peers.values()].some((p) => p.account?.uid === t.account.uid))
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    tickets.delete(key);
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req, t),
    );
  });
  wss.on("connection", (ws, req, t) => {
    const id = t.role === "host" ? "host" : crypto.randomUUID(),
      cid = t.role === "host" ? 0 : nextConnection++;
    const p = { ws, role: t.role, account: t.account, connectionId: cid };
    peers.set(id, p);
    send(p, { type: "welcome", peerId: id, peers: [] });
    if (t.role === "guest") {
      send(peers.get("host"), {
        type: "peer-joined",
        peerId: id,
        connectionId: cid,
      });
      if (relay)
        send(p, { type: "peer-joined", peerId: "host", connectionId: 1 });
    }
    let count = 0,
      reset = Date.now(),
      bytes = 0;
    ws.on("message", (raw, binary) => {
      if (Date.now() - reset > 10000) {
        count = 0;
        bytes = 0;
        reset = Date.now();
      }
      if (
        ++count > (binary ? 30000 : 300) ||
        (bytes += raw.length) > 64 * 1024 * 1024
      )
        return ws.close(1008, "Rate limit");
      if (binary && relay) {
        if (raw.length < 5) return;
        let remote, targetCid;
        if (t.role === "guest") {
          if (raw.readUInt32LE(0) !== 1) return;
          remote = peers.get("host");
          targetCid = cid;
        } else {
          const target = raw.readUInt32LE(0);
          remote = [...peers.values()].find(
            (x) => x.role === "guest" && x.connectionId === target,
          );
          targetCid = 1;
        }
        if (!remote || remote.ws.readyState !== 1) return;
        if (remote.ws.bufferedAmount > 16 * 1024 * 1024)
          return remote.ws.close(1013, "Backpressure");
        const out = Buffer.from(raw);
        out.writeUInt32LE(targetCid, 0);
        remote.ws.send(out, { binary: true });
        relayedBytes += raw.length - 4;
        return;
      }
      if (relay) return;
      try {
        const m = JSON.parse(raw);
        if (
          !["offer", "answer", "ice"].includes(m.type) ||
          typeof m.target !== "string" ||
          m.target === id
        )
          return;
        const remote = peers.get(m.target);
        if (
          !remote ||
          (t.role === "guest" && m.target !== "host") ||
          (t.role === "host" && remote.role !== "guest")
        )
          return;
        send(remote, {
          type: m.type,
          fromPeer: id,
          ...(m.type === "ice" ? { candidate: m.candidate } : { sdp: m.sdp }),
        });
      } catch {}
    });
    ws.on("close", () => {
      if (peers.get(id) !== p) return;
      peers.delete(id);
      if (t.role === "host") {
        ready = false;
        room = null;
        for (const q of peers.values()) {
          send(q, { type: "host-left" });
          q.ws.close(1012, "Host stopped");
        }
      } else
        send(peers.get("host"), {
          type: "peer-left",
          peerId: id,
          connectionId: cid,
        });
    });
    ws.on("error", () => {});
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
  });
  const timer = setInterval(() => {
    prune();
    for (const p of peers.values()) {
      if (!p.ws.isAlive) {
        p.ws.terminate();
        continue;
      }
      p.ws.isAlive = false;
      p.ws.ping();
    }
  }, 30000);
  timer.unref();
  server.on("close", () => {
    clearInterval(timer);
    for (const p of peers.values()) p.ws.terminate();
    wss.close();
  });
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const verifyAccount = createAccountVerifier({
    identityFile:
      process.env.AYA_IDENTITY_FILE ||
      path.join(process.env.HOME || ".", ".config/aiedue/robl-identities.json"),
  });
  const server = makeServer({
    runtimeDir: process.env.AYA_RUNTIME_DIR,
    hostKey: process.env.AYA_HOST_KEY,
    publicOrigin: process.env.AYA_PUBLIC_ORIGIN,
    assetProxy: process.env.AYA_ASSET_PROXY === "1",
    requireAuth: process.env.AYA_REQUIRE_AUTH === "1",
    verifyAccount,
    relay: process.env.AYA_RELAY === "1",
    gameStateFile: process.env.AYA_GAME_STATE_FILE || path.join(process.env.HOME || '.', '.config/aiedue/robl-game.json'),
  });
  server.listen(Number(process.env.PORT) || 3074, "127.0.0.1", () =>
    console.log("Aiedue Robl account gateway listening on loopback"),
  );
}
