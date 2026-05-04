import { useState, useEffect, useCallback, useRef } from "react";

// ─── Firebase config ─────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

// Lightweight Firebase REST helper (no SDK needed)
const fbUrl = (path) =>
  `${FIREBASE_CONFIG.databaseURL}/${path}.json?auth=`;

async function fbGet(path) {
  const res = await fetch(fbUrl(path));
  if (!res.ok) throw new Error("fbGet failed");
  return res.json();
}
async function fbSet(path, data) {
  const res = await fetch(fbUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("fbSet failed");
  return res.json();
}

// ─── Constants ───────────────────────────────────────────────────────
const DEFAULT_MEMBERS = ["Aさん", "Bさん"];
const DEFAULT_COLORS  = ["#FF6B6B", "#4ECDC4"];
const COLOR_PRESETS   = [
  "#FF6B6B","#FF9F43","#F9CA24","#6AB04C","#4ECDC4","#45AAF2","#A29BFE","#FD79A8",
  "#E17055","#00B894","#0984E3","#6C5CE7","#FDCB6E","#74B9FF","#55EFC4","#E84393",
];
const DAYS_JP    = ["月","火","水","木","金","土","日"];
const MONTHS_JP  = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const SAMPLE_MEALS = ["親子丼","肉じゃが","唐揚げ","野菜炒め","カレーライス","焼き魚","パスタ","餃子","味噌汁定食","豚の生姜焼き","オムライス","シチュー","天ぷら","鍋料理","ハンバーグ"];
const DEFAULT_RECIPES = [
  { id:1, name:"肉じゃが", ingredients:"じゃがいも, 牛肉, 玉ねぎ, にんじん", memo:"醤油:みりん:砂糖 = 3:2:1", tag:"和食" },
  { id:2, name:"唐揚げ",   ingredients:"鶏もも肉, にんにく, しょうが, 醤油, 酒", memo:"一晩漬け込むとジューシーに", tag:"揚げ物" },
];
const SESSION_KEY = "meal-planner-session-v2";
const POLL_MS     = 6000;
const DEBOUNCE_MS = 300;

// ─── Helpers ─────────────────────────────────────────────────────────
function getDaysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }

// getDay()をDAYS_JP(月曜始まり)のインデックスに変換
function dayIdx(date){ return (date.getDay()+6)%7; }

// メモ内のURLをリンクに変換して表示するコンポーネント
function NoteWithLinks({ text, style }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s\u3000\u3001\u3002\uff01\uff09\u300d]+)/g;
  const parts = text.split(urlRegex);
  return (
    <div style={style}>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            style={{ color:"#0984E3", textDecoration:"underline", wordBreak:"break-all" }}
            onClick={e=>e.stopPropagation()}>
            {part}
          </a>
        ) : (
          <span key={i} style={{ whiteSpace:"pre-wrap" }}>{part}</span>
        )
      )}
    </div>
  );
}
function getFirstDay(y,m)   { const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
function hexToRgb(hex){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return {r,g,b}; }
function lighten(hex,amt=0.88){ const {r,g,b}=hexToRgb(hex); return `rgb(${Math.round(r+(255-r)*amt)},${Math.round(g+(255-g)*amt)},${Math.round(b+(255-b)*amt)})`; }
function darken(hex,amt=0.25){ const {r,g,b}=hexToRgb(hex); return `rgb(${Math.round(r*(1-amt))},${Math.round(g*(1-amt))},${Math.round(b*(1-amt))})`; }

// roomId + password → safe Firebase path key
function roomPath(roomId, pw) {
  let h=0; const s=roomId+":"+pw;
  for(let i=0;i<s.length;i++) h=(Math.imul(31,h)+s.charCodeAt(i))|0;
  return "rooms/r"+Math.abs(h).toString(36);
}

// ─── Login Screen ────────────────────────────────────────────────────
function LoginScreen({ onJoin }) {
  const [roomId, setRoomId] = useState("");
  const [pw,     setPw]     = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error,  setError]  = useState("");
  const [loading,setLoading]= useState(false);

  const handle = async () => {
    if (!roomId.trim()) { setError("ルームIDを入力してください"); return; }
    if (!pw.trim())     { setError("パスワードを入力してください"); return; }
    setLoading(true);
    try {
      await onJoin(roomId.trim(), pw.trim());
    } catch {
      setError("接続に失敗しました。しばらくしてお試しください。");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#FAFAF8", display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'M PLUS Rounded 1c', sans-serif" }}>
      <div style={{ width:"100%", maxWidth:400 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ marginBottom:16, display:"flex", justifyContent:"center" }}>
            <svg width="96" height="80" viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg" strokeLinecap="round" strokeLinejoin="round">
              <path d="M48 10 C65 10 78 22 78 37 C78 52 65 64 48 64 C31 64 18 52 18 37 C18 23 30 11 47 10" stroke="#1a1a1a" strokeWidth="1.8" fill="none"/>
              <path d="M48 18 C59 18 68 27 68 37 C68 47 59 56 48 56 C37 56 28 47 28 37 C28 27 37 18 48 18" stroke="#1a1a1a" strokeWidth="1.4" fill="none" strokeDasharray="52 6" strokeDashoffset="10"/>
              <line x1="17" y1="10" x2="17" y2="22" stroke="#1a1a1a" strokeWidth="1.5"/>
              <line x1="21" y1="10" x2="21" y2="22" stroke="#1a1a1a" strokeWidth="1.5"/>
              <line x1="25" y1="10" x2="25" y2="22" stroke="#1a1a1a" strokeWidth="1.5"/>
              <path d="M17 22 Q21 27 25 22" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
              <path d="M21 27 C21 35 20 45 20 55" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
              <path d="M20 55 C19 58 19 62 20 65 C21 68 22 68 21 65" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
              <path d="M75 10 C80 12 81 20 78 26 L75 28" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
              <line x1="75" y1="28" x2="75" y2="55" stroke="#1a1a1a" strokeWidth="1.5"/>
              <path d="M75 55 C74 58 74 62 75 65 C76 68 77 68 76 65" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
              <path d="M8 72 C18 70 28 73 38 71 C48 69 58 72 68 71 C78 70 86 72 90 71" stroke="#1a1a1a" strokeWidth="1.4" fill="none"/>
            </svg>
          </div>
          <div style={{ fontSize:10, letterSpacing:4, color:"#BBB", textTransform:"uppercase", marginBottom:6 }}>Family Kitchen</div>
          <h1 style={{ fontFamily:"'M PLUS Rounded 1c', sans-serif", fontSize:28, fontWeight:700 }}>献立管理</h1>
          <p style={{ fontSize:13, color:"#999", marginTop:8 }}>ルームIDとパスワードで家族と共有できます</p>
        </div>
        <div style={{ background:"white", borderRadius:20, padding:28, boxShadow:"0 4px 24px rgba(0,0,0,0.07)" }}>
          {[
            { label:"🏠 ルームID", val:roomId, set:setRoomId, type:"text",   ph:"例: our-kitchen" },
            { label:"🔑 パスワード", val:pw,   set:setPw,     type:showPw?"text":"password", ph:"共有パスワード", isPw:true },
          ].map(f=>(
            <div key={f.label} style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#888", display:"block", marginBottom:8 }}>{f.label}</label>
              <div style={{ position:"relative" }}>
                <input value={f.val} onChange={e=>{ f.set(e.target.value); setError(""); }} type={f.type} placeholder={f.ph}
                  onKeyDown={e=>e.key==="Enter"&&handle()}
                  style={{ width:"100%", padding:`13px ${f.isPw?"42px":"14px"} 13px 14px`, borderRadius:12, border:"1.5px solid #E8E8E6",
                    fontSize:15, outline:"none", background:"#FAFAF8", fontFamily:"inherit" }}
                  onFocus={e=>e.target.style.borderColor="#1a1a1a"} onBlur={e=>e.target.style.borderColor="#E8E8E6"} />
                {f.isPw&&<button onClick={()=>setShowPw(v=>!v)} style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#AAA" }}>{showPw?"🙈":"👁"}</button>}
              </div>
            </div>
          ))}
          {error&&<div style={{ background:"#FFF0F0",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"#c0392b" }}>⚠️ {error}</div>}
          <button onClick={handle} disabled={loading}
            style={{ width:"100%",padding:"14px",borderRadius:12,background:"#1a1a1a",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer",opacity:loading?0.6:1 }}>
            {loading ? "接続中…" : "ルームに入る →"}
          </button>
          <div style={{ marginTop:20,padding:"14px",background:"#F7F7F5",borderRadius:12,fontSize:12,color:"#888",lineHeight:1.7 }}>
            💡 同じルームID＋パスワードで2人が同じデータを共有できます。
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Color Picker ────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:8 }}>
        {COLOR_PRESETS.map(c=>(
          <button key={c} onClick={()=>onChange(c)}
            style={{ width:28, height:28, borderRadius:"50%", background:c, border:value===c?"3px solid #1a1a1a":"2px solid transparent",
              cursor:"pointer", outline:"none", transition:"transform 0.15s", transform:value===c?"scale(1.2)":"scale(1)" }} />
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
        <span style={{ fontSize:11, color:"#AAA" }}>カスタム：</span>
        <input type="color" value={value} onChange={e=>onChange(e.target.value)}
          style={{ width:32, height:28, border:"none", padding:0, cursor:"pointer", borderRadius:6, background:"none" }} />
        <span style={{ fontSize:12, color:"#888", fontFamily:"monospace" }}>{value}</span>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────
export default function App() {
  const today = new Date();
  const [session,      setSession]      = useState(null); // { roomId, pw, path }
  const [members,      setMembers]      = useState(DEFAULT_MEMBERS);
  const [colors,       setColors]       = useState(DEFAULT_COLORS);
  const [currentYear,  setCurrentYear]  = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [calendarData, setCalendarData] = useState({});
  const [recipes,      setRecipes]      = useState(DEFAULT_RECIPES);
  const [shoppingList, setShoppingList] = useState([]);
  const [activeTab,    setActiveTab]    = useState("calendar");
  const [editModal,    setEditModal]    = useState(null);
  const [recipeForm,   setRecipeForm]   = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editNames,    setEditNames]    = useState([...DEFAULT_MEMBERS]);
  const [editColors,   setEditColors]   = useState([...DEFAULT_COLORS]);
  const [newItem,      setNewItem]      = useState("");
  const [syncStatus,   setSyncStatus]   = useState("idle");
  const [lastSynced,   setLastSynced]   = useState(null);
  const pendingRef  = useRef(null);  // debounce timer
  const isSavingRef = useRef(false);  // 保存中フラグ

  // ── Session restore ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s?.roomId && s?.pw) {
        const path = roomPath(s.roomId, s.pw);
        setSession({ ...s, path });
      }
    } catch {}
  }, []);

  // ── Firebase persist (debounced 600ms) ───────────────────────────
  const persist = useCallback((cal, rec, shop, mem, cols, path) => {
    if (!path) return;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    setSyncStatus("saving");
    pendingRef.current = setTimeout(async () => {
      isSavingRef.current = true;
      try {
        await fbSet(path, { calendarData:cal, recipes:rec, shoppingList:shop, members:mem, colors:cols });
        setSyncStatus("saved");
        setLastSynced(new Date());
        setTimeout(()=>setSyncStatus("idle"), 2000);
      } catch { setSyncStatus("error"); }
      finally { isSavingRef.current = false; }
    }, 300);
  }, []);

  // ── Firebase load ─────────────────────────────────────────────────
  const loadData = useCallback(async (path, isInit=false) => {
    if (!path) return;
    // 保存中は読み込みをスキップ（上書き防止）
    if (!isInit && isSavingRef.current) return;
    try {
      const data = await fbGet(path);
      if (data) {
        if (data.calendarData) setCalendarData(data.calendarData);
        if (data.recipes)      setRecipes(data.recipes);
        if (data.shoppingList) setShoppingList(data.shoppingList);
        if (data.members)      setMembers(data.members);
        if (data.colors)       setColors(data.colors);
        setLastSynced(new Date());
      }
      if (isInit) setSyncStatus("loaded");
    } catch { if (isInit) setSyncStatus("loaded"); }
  }, []);

  useEffect(() => {
    if (!session?.path) return;
    setSyncStatus("loading");
    loadData(session.path, true);
  }, [session?.path]);

  useEffect(() => {
    if (!session?.path) return;
    const id = setInterval(()=>loadData(session.path), POLL_MS);
    return ()=>clearInterval(id);
  }, [session?.path, loadData]);

  // ── Join room ─────────────────────────────────────────────────────
  const handleJoin = async (roomId, pw) => {
    const path = roomPath(roomId, pw);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, pw }));
    setSession({ roomId, pw, path });
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setCalendarData({}); setRecipes(DEFAULT_RECIPES); setShoppingList([]);
    setMembers(DEFAULT_MEMBERS); setColors(DEFAULT_COLORS);
    setSyncStatus("idle"); setLastSynced(null);
  };

  // ── Month init ────────────────────────────────────────────────────
  const monthKey = `${currentYear}-${currentMonth}`;
  useEffect(() => {
    // "loaded" になってから初めて月初期化を実行（Firebaseデータ取得後のみ）
    if (!session?.path || syncStatus !== "loaded") return;
    if (!calendarData[monthKey]) {
      const count = getDaysInMonth(currentYear, currentMonth);
      const newDays = {};
      for (let d=1; d<=count; d++) newDays[d] = { cook:members[0], meal:"", note:"" };
      setCalendarData(prev => {
        // 再チェック：他の処理でデータが入っていたら初期化しない
        if (prev[monthKey]) return prev;
        const next = {...prev, [monthKey]:newDays};
        persist(next, recipes, shoppingList, members, colors, session.path);
        return next;
      });
    }
  }, [monthKey, syncStatus, session?.path]);

  const days = calendarData[monthKey] || {};

  // ── Mutators ──────────────────────────────────────────────────────
  const updateDay = (day, field, value) => {
    setCalendarData(prev => {
      const next = {...prev, [monthKey]: {...prev[monthKey], [day]: {...prev[monthKey][day], [field]:value}}};
      persist(next, recipes, shoppingList, members, colors, session.path);
      return next;
    });
  };
  const saveRecipes  = r => { setRecipes(r);      persist(calendarData, r, shoppingList, members, colors, session.path); };
  const saveShopping = s => { setShoppingList(s); persist(calendarData, recipes, s, members, colors, session.path); };
  const saveSettings = (mem, cols) => { setMembers(mem); setColors(cols); persist(calendarData, recipes, shoppingList, mem, cols, session.path); };

  // ── Shopping helpers ──────────────────────────────────────────────
  const addItem = () => {
    const name = newItem.trim(); if (!name) return;
    saveShopping([...shoppingList, { id:Date.now(), name, checked:false }]);
    setNewItem("");
  };

  const generateShopping = () => {
    const items = new Set();
    Object.values(days).forEach(d=>{ if(d.meal){ const r=recipes.find(r=>r.name===d.meal); if(r) r.ingredients.split(",").forEach(i=>items.add(i.trim())); }});
    const gen = Array.from(items).map((name,i)=>({id:Date.now()+i, name, checked:false}));
    const existing = shoppingList.filter(i=>!gen.find(g=>g.name===i.name));
    saveShopping([...gen, ...existing]);
    setActiveTab("shopping");
  };

  const prevMonth = ()=>{ if(currentMonth===0){setCurrentYear(y=>y-1);setCurrentMonth(11);}else setCurrentMonth(m=>m-1); setEditModal(null); };
  const nextMonth = ()=>{ if(currentMonth===11){setCurrentYear(y=>y+1);setCurrentMonth(0);}else setCurrentMonth(m=>m+1); setEditModal(null); };

  const daysCount = getDaysInMonth(currentYear, currentMonth);
  const firstDay  = getFirstDay(currentYear, currentMonth);

  const syncLabel = syncStatus==="loading" ? "⏳ 読み込み中…"
    : syncStatus==="saving"  ? "⏳ 保存中…"
    : syncStatus==="saved"   ? "✅ 保存完了"
    : syncStatus==="error"   ? "❌ エラー"
    : lastSynced ? `🔄 ${lastSynced.getHours()}:${String(lastSynced.getMinutes()).padStart(2,"0")} 同期済み`
    : syncStatus==="loaded"  ? "🔄 同期済み"
    : "待機中";

  // ── Render ────────────────────────────────────────────────────────
  if (!session) return (
    <><link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;400;500;700&display=swap" rel="stylesheet"/>
    <LoginScreen onJoin={handleJoin}/></>
  );

  return (
    <div style={{ fontFamily:"'M PLUS Rounded 1c', sans-serif", minHeight:"100vh", background:"#FAFAF8", color:"#1a1a1a" }}>
      <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300;400;500;700&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{overflow-x:hidden;width:100%;}
        body,input,textarea,button{font-family:'M PLUS Rounded 1c',sans-serif!important;}
        .btn,.tab-btn,.day-cell,.recipe-card{cursor:pointer;transition:all 0.18s;border:none;}
        .btn:hover,.tab-btn:hover{opacity:0.82;transform:translateY(-1px);}
        .btn:active{transform:translateY(0);}
        .day-cell:hover{box-shadow:0 4px 16px rgba(0,0,0,0.10);z-index:10;position:relative;}
        .recipe-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.08);}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:1000;padding:12px;}
        .modal{background:white;border-radius:20px;padding:24px 20px;width:100%;max-width:500px;max-height:92vh;overflow-y:auto;}
        input,textarea{font-family:inherit;}
        .checked-item{opacity:0.4;text-decoration:line-through;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        .pulsing{animation:pulse 1s infinite;}
        .delete-btn{opacity:0;transition:opacity 0.15s;}
        .shop-row:hover .delete-btn{opacity:1;}
        .cal-header{display:grid;grid-template-columns:repeat(7,1fr);width:100%;}
        .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:#ECECEA;width:100%;}
        .cal-cell{background:white;padding:4px 3px;display:flex;flex-direction:column;gap:2px;overflow:hidden;min-height:52px;}
        @media(min-width:480px){.cal-cell{min-height:68px;padding:6px;gap:3px;}}
        @media(min-width:640px){.cal-cell{min-height:80px;padding:8px;gap:4px;}}
        .cal-day-num{font-size:11px;font-weight:400;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;flex-shrink:0;}
        @media(min-width:480px){.cal-day-num{font-size:13px;width:22px;height:22px;}}
        .cal-badge{font-size:8px;padding:1px 3px;border-radius:4px;color:white;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;}
        @media(min-width:480px){.cal-badge{font-size:9px;padding:1px 5px;border-radius:6px;}}
        .cal-meal{font-size:8px;color:#555;background:#F5F5F3;border-radius:3px;padding:1px 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        @media(min-width:480px){.cal-meal{font-size:9px;padding:2px 5px;border-radius:4px;}}
        @media(max-width:400px){
          .header-inner{flex-direction:column;align-items:flex-start!important;gap:8px!important;}
          .header-right{width:100%;align-items:flex-start!important;}
          .header-tabs{justify-content:flex-start!important;}
        }
      `}</style>

      {/* ── Header ── */}
      <div style={{ background:"white", borderBottom:"1px solid #ECECEA", padding:"0 20px" }}>
        <div style={{ maxWidth:800, margin:"0 auto" }}>
          <div style={{ padding:"14px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div>
                <div style={{ fontSize:9, letterSpacing:3, color:"#BBB", textTransform:"uppercase" }}>Family Kitchen</div>
                <h1 style={{ fontSize:20, fontWeight:700 }}>献立管理</h1>
              </div>
              <div style={{ background:"#F0F0EE", borderRadius:20, padding:"5px 12px", fontSize:11, color:"#666", display:"flex", alignItems:"center", gap:6 }}>
                <span>🏠</span><span style={{ fontWeight:600 }}>{session.roomId}</span>
                <button onClick={handleLogout} style={{ background:"none",border:"none",cursor:"pointer",fontSize:11,color:"#AAA",padding:0,marginLeft:2 }}>退出</button>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div className={syncStatus==="saving"||syncStatus==="loading"?"pulsing":""}
                  style={{ fontSize:11, padding:"4px 10px", borderRadius:20,
                    color:syncStatus==="error"?"#e74c3c":syncStatus==="saved"?"#27ae60":"#888",
                    background:syncStatus==="saved"?"#eafaf1":syncStatus==="error"?"#fdecea":"#F5F5F3" }}>
                  {syncLabel}
                </div>
                <button className="btn" onClick={()=>{ setEditNames([...members]); setEditColors([...colors]); setShowSettings(true); }}
                  style={{ width:32, height:32, borderRadius:"50%", background:"#F0F0EE", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", color:"#666" }}>⚙️</button>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                {[{id:"calendar",label:"📅 カレンダー"},{id:"recipes",label:"📖 レシピ"},{id:"shopping",label:"🛒 買い物"}].map(t=>(
                  <button key={t.id} className="tab-btn" onClick={()=>setActiveTab(t.id)}
                    style={{ padding:"7px 13px", borderRadius:20, fontSize:12, fontWeight:500,
                      background:activeTab===t.id?"#1a1a1a":"transparent",
                      color:activeTab===t.id?"white":"#666",
                      border:activeTab===t.id?"none":"1px solid #E0E0E0" }}>{t.label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"20px" }}>

        {/* ── CALENDAR ── */}
        {activeTab==="calendar" && (
          <div>
            <div style={{ background:"#EAF7F5", borderRadius:12, padding:"10px 16px", marginBottom:16, fontSize:12, color:"#16a085", display:"flex", alignItems:"center", gap:8 }}>
              <span>🔗</span>
              <span>ルーム「<strong>{session.roomId}</strong>」で <strong>{members[0]}</strong>・<strong>{members[1]}</strong> のデータ共有中。</span>
            </div>

            {/* Month nav */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
              <button className="btn" onClick={prevMonth} style={{ width:36, height:36, borderRadius:"50%", background:"#1a1a1a", color:"white", fontSize:16 }}>‹</button>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:28, fontWeight:700 }}>{MONTHS_JP[currentMonth]}</div>
                <div style={{ fontSize:12, color:"#999" }}>{currentYear}</div>
              </div>
              <button className="btn" onClick={nextMonth} style={{ width:36, height:36, borderRadius:"50%", background:"#1a1a1a", color:"white", fontSize:16 }}>›</button>
            </div>

            {/* Today & Tomorrow */}
            {(()=>{
              const getDayInfo = (date) => {
                const y=date.getFullYear(), m=date.getMonth(), d=date.getDate();
                const data=(calendarData[`${y}-${m}`]||{})[d]||null;
                return {y,m,d,data};
              };
              const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
                  {[{label:"今日",date:today,...getDayInfo(today)},{label:"明日",date:tomorrow,...getDayInfo(tomorrow)}].map(slot=>{
                    const cookName=slot.data?.cook||null;
                    const cookIdx=cookName?members.indexOf(cookName):-1;
                    const cookColor=cookIdx>=0?colors[cookIdx]:"#CCC";
                    const meal=slot.data?.meal||null;
                    return (
                      <div key={slot.label} style={{ borderRadius:16, overflow:"hidden", boxShadow:`0 2px 14px ${cookColor}2a`, border:`1px solid ${cookColor}33` }}>
                        <div style={{ background:cookIdx>=0?lighten(cookColor,0.9):"#F5F5F3", padding:"14px 16px", borderTop:`4px solid ${cookColor}` }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:cookIdx>=0?darken(cookColor):"#AAA", letterSpacing:1.5, textTransform:"uppercase" }}>{slot.label}</div>
                            <div style={{ fontSize:10, color:"#AAA" }}>{slot.m+1}/{slot.d}（{DAYS_JP[dayIdx(slot.date)]}）</div>
                          </div>
                          {cookName ? (
                            <>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                                <div style={{ width:28, height:28, borderRadius:"50%", background:cookColor, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 2v6a6 6 0 0 0 12 0V2"/><line x1="12" y1="14" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/>
                                  </svg>
                                </div>
                                <div style={{ fontSize:16, fontWeight:700, color:darken(cookColor) }}>{cookName}</div>
                              </div>
                              <div style={{ fontSize:11, color:meal?"#666":"#BBB", background:"white", borderRadius:8, padding:"6px 10px", marginBottom:8, minHeight:28, display:"flex", alignItems:"center" }}>
                                {meal?`🍽 ${meal}`:"献立未定"}
                              </div>
                              <button className="btn" onClick={()=>{ setCurrentYear(slot.y); setCurrentMonth(slot.m); setEditModal(slot.d); }}
                                style={{ width:"100%", fontSize:11, padding:"6px 0", borderRadius:10, background:cookColor, color:"white", fontWeight:600 }}>編集</button>
                            </>
                          ) : (
                            <div style={{ fontSize:12, color:"#CCC", padding:"8px 0" }}>データなし</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Calendar grid */}
            <div style={{ borderRadius:20, overflow:"hidden", boxShadow:"0 2px 20px rgba(0,0,0,0.06)" }}>
              <div className="cal-header" style={{ background:"#F7F7F5" }}>
                {DAYS_JP.map((d,i)=>(
                  <div key={d} style={{ textAlign:"center", padding:"8px 2px", fontSize:10, fontWeight:600, color:i===6?"#FF6B6B":i===5?"#4ECDC4":"#888" }}>{d}</div>
                ))}
              </div>
              <div className="cal-grid">
                {Array(firstDay).fill(null).map((_,i)=><div key={`e${i}`} className="cal-cell" style={{ background:"#FAFAF8" }}/>)}
                {Array(daysCount).fill(null).map((_,i)=>{
                  const d=i+1; const dd=days[d]||{};
                  const dow=new Date(currentYear,currentMonth,d).getDay();
                  const isToday=d===today.getDate()&&currentMonth===today.getMonth()&&currentYear===today.getFullYear();
                  const mi=members.indexOf(dd.cook);
                  const color=mi>=0?colors[mi]:null;
                  const shortName=dd.cook?(dd.cook.length>2?dd.cook.slice(0,2):dd.cook):"";
                  return (
                    <div key={d} className="cal-cell day-cell" onClick={()=>setEditModal(d)}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <span className="cal-day-num" style={{
                          fontWeight:isToday?700:400,
                          color:isToday?"white":dow===0?"#FF6B6B":dow===6?"#4ECDC4":"#1a1a1a",
                          background:isToday?"#1a1a1a":"transparent" }}>{d}</span>
                        {color&&<span className="cal-badge" style={{ background:color }}>{shortName}</span>}
                      </div>
                      {dd.meal&&<div className="cal-meal">{dd.meal}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <button className="btn" onClick={generateShopping} style={{ width:"100%", marginTop:16, padding:"14px", borderRadius:14, background:"#1a1a1a", color:"white", fontSize:14, fontWeight:600 }}>🛒 今月の買い物リストを生成</button>
          </div>
        )}

        {/* ── RECIPES ── */}
        {activeTab==="recipes" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 style={{ fontSize:22, fontWeight:700 }}>レシピメモ</h2>
              <button className="btn" onClick={()=>setRecipeForm({id:null,name:"",ingredients:"",memo:"",tag:""})}
                style={{ padding:"10px 18px", borderRadius:20, background:"#1a1a1a", color:"white", fontSize:13, fontWeight:600 }}>＋ 追加</button>
            </div>
            <div style={{ display:"grid", gap:12 }}>
              {recipes.map(r=>(
                <div key={r.id} className="recipe-card" onClick={()=>setRecipeForm({...r})}
                  style={{ background:"white", borderRadius:16, padding:"18px 20px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)", borderLeft:`4px solid ${colors[0]}` }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <h3 style={{ fontSize:16, fontWeight:700 }}>{r.name}</h3>
                    {r.tag&&<span style={{ fontSize:10, background:"#F0F0EE", color:"#666", padding:"2px 8px", borderRadius:10 }}>{r.tag}</span>}
                  </div>
                  <p style={{ fontSize:12, color:"#888", marginBottom:r.memo?6:0 }}>🥘 {r.ingredients}</p>
                  {r.memo&&<p style={{ fontSize:12, color:"#555", background:"#FAFAF8", borderRadius:8, padding:"8px 10px" }}>📝 {r.memo}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SHOPPING ── */}
        {activeTab==="shopping" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <h2 style={{ fontSize:22, fontWeight:700 }}>買い物リスト</h2>
              <button className="btn" onClick={()=>saveShopping(shoppingList.map(i=>({...i,checked:false})))}
                style={{ padding:"8px 14px", borderRadius:20, background:"#F0F0EE", color:"#555", fontSize:12, fontWeight:500 }}>チェックをリセット</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="アイテムを手入力…"
                style={{ width:"100%", padding:"12px 14px", borderRadius:12, border:"1.5px solid #E0E0E0", fontSize:14, outline:"none", background:"white", boxSizing:"border-box" }}
                onFocus={e=>e.target.style.borderColor="#1a1a1a"} onBlur={e=>e.target.style.borderColor="#E0E0E0"} />
              <button className="btn" onClick={addItem} style={{ width:"100%", padding:"12px", borderRadius:12, background:"#1a1a1a", color:"white", fontSize:13, fontWeight:600 }}>＋ 追加</button>
            </div>
            {shoppingList.length===0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:"#AAA" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🛒</div>
                <p style={{ fontSize:14 }}>上の入力欄から追加するか、<br/>カレンダーから自動生成できます</p>
                <button className="btn" onClick={()=>setActiveTab("calendar")} style={{ marginTop:16, padding:"10px 20px", borderRadius:20, background:"#1a1a1a", color:"white", fontSize:13 }}>カレンダーへ</button>
              </div>
            ) : (
              <>
                <div style={{ background:"#F5F5F3", borderRadius:14, padding:"12px 16px", marginBottom:12, fontSize:13, color:"#666", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span>{shoppingList.filter(i=>!i.checked).length} / {shoppingList.length} 件残り</span>
                  <button className="btn" onClick={()=>saveShopping(shoppingList.filter(i=>!i.checked))}
                    style={{ fontSize:11, color:"#e74c3c", background:"#FFF0F0", padding:"4px 10px", borderRadius:20 }}>購入済みを削除</button>
                </div>
                <div style={{ display:"grid", gap:6 }}>
                  {shoppingList.map(item=>(
                    <div key={item.id} className={`shop-row ${item.checked?"checked-item":""}`}
                      style={{ background:"white", borderRadius:12, padding:"12px 14px", display:"flex", alignItems:"center", gap:12, boxShadow:"0 1px 8px rgba(0,0,0,0.04)" }}>
                      <div onClick={()=>saveShopping(shoppingList.map(i=>i.id===item.id?{...i,checked:!i.checked}:i))}
                        style={{ width:22, height:22, borderRadius:"50%", border:item.checked?"none":"2px solid #DDD",
                          background:item.checked?colors[1]:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, cursor:"pointer", transition:"all 0.2s" }}>
                        {item.checked&&<span style={{ color:"white", fontSize:12 }}>✓</span>}
                      </div>
                      <span onClick={()=>saveShopping(shoppingList.map(i=>i.id===item.id?{...i,checked:!i.checked}:i))} style={{ flex:1, fontSize:14, cursor:"pointer" }}>{item.name}</span>
                      <button className="btn delete-btn" onClick={()=>saveShopping(shoppingList.filter(i=>i.id!==item.id))}
                        style={{ width:24, height:24, borderRadius:"50%", background:"#FFF0F0", color:"#e74c3c", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>×</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Settings Modal ── */}
      {showSettings && (
        <div className="modal-overlay" onClick={()=>setShowSettings(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <h3 style={{ fontSize:20, fontWeight:700 }}>⚙️ 設定</h3>
              <button className="btn" onClick={()=>setShowSettings(false)} style={{ width:32, height:32, borderRadius:"50%", background:"#F0F0EE", fontSize:16, color:"#666" }}>✕</button>
            </div>
            {editNames.map((name,i)=>(
              <div key={i} style={{ marginBottom:20, padding:"16px", borderRadius:14, background:lighten(editColors[i]) }}>
                <div style={{ fontSize:12, fontWeight:700, color:darken(editColors[i]), marginBottom:12 }}>メンバー {i+1}</div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:"#888", display:"block", marginBottom:6 }}>名前</label>
                  <input value={name} onChange={e=>{ const n=[...editNames]; n[i]=e.target.value; setEditNames(n); }}
                    placeholder={DEFAULT_MEMBERS[i]} maxLength={10}
                    style={{ width:"100%", padding:"10px 12px", borderRadius:10, border:`1.5px solid ${editColors[i]}66`, fontSize:14, outline:"none", background:"white" }}
                    onFocus={e=>e.target.style.borderColor=editColors[i]} onBlur={e=>e.target.style.borderColor=`${editColors[i]}66`} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"#888", display:"block", marginBottom:8 }}>カラー</label>
                  <ColorPicker value={editColors[i]} onChange={c=>{ const nc=[...editColors]; nc[i]=c; setEditColors(nc); }} />
                </div>
              </div>
            ))}
            <div style={{ background:"#F7F7F5", borderRadius:12, padding:"10px 14px", marginBottom:20, fontSize:12, color:"#888" }}>
              🏠 ルームID：<strong style={{ color:"#555" }}>{session.roomId}</strong>
            </div>
            <button className="btn" onClick={()=>{ saveSettings(editNames.map((n,i)=>n.trim()||DEFAULT_MEMBERS[i]), editColors); setShowSettings(false); }}
              style={{ width:"100%", padding:"14px", borderRadius:12, background:"#1a1a1a", color:"white", fontSize:14, fontWeight:600 }}>保存する</button>
          </div>
        </div>
      )}

      {/* ── Day Edit Modal ── */}
      {editModal && days[editModal] && (
        <div className="modal-overlay" onClick={()=>setEditModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:20, fontWeight:700 }}>{currentMonth+1}月{editModal}日 ({DAYS_JP[dayIdx(new Date(currentYear,currentMonth,editModal))]})</h3>
              <button className="btn" onClick={()=>setEditModal(null)} style={{ width:32, height:32, borderRadius:"50%", background:"#F0F0EE", fontSize:16, color:"#666" }}>✕</button>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#888", display:"block", marginBottom:8 }}>👨‍🍳 料理当番</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {members.map((m,i)=>(
                  <button key={m} className="btn" onClick={()=>updateDay(editModal,"cook",m)}
                    style={{ padding:"12px", borderRadius:12, fontSize:13, fontWeight:600,
                      background:days[editModal].cook===m?colors[i]:"#F5F5F3",
                      color:days[editModal].cook===m?"white":"#666",
                      border:"2px solid "+(days[editModal].cook===m?colors[i]:"transparent") }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#888", display:"block", marginBottom:8 }}>🍽 献立</label>
              <input value={days[editModal].meal||""} onChange={e=>updateDay(editModal,"meal",e.target.value)} placeholder="献立を入力..."
                style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #E0E0E0", fontSize:14, outline:"none", background:"#FAFAF8" }}/>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
                {SAMPLE_MEALS.slice(0,8).map(m=>(
                  <button key={m} className="btn" onClick={()=>updateDay(editModal,"meal",m)} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, background:"#F0F0EE", color:"#555" }}>{m}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#888", display:"block", marginBottom:8 }}>📝 メモ</label>
              <textarea value={days[editModal].note||""} onChange={e=>updateDay(editModal,"note",e.target.value)} placeholder="メモ（URLを貼るとリンクになります）..." rows={2}
                style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #E0E0E0", fontSize:14, outline:"none", background:"#FAFAF8", resize:"none" }}/>
              {days[editModal].note && (
                <NoteWithLinks text={days[editModal].note}
                  style={{ marginTop:8, fontSize:13, color:"#555", background:"#F7F7F5", borderRadius:10, padding:"10px 12px", lineHeight:1.7 }} />
              )}
            </div>
            <button className="btn" onClick={()=>setEditModal(null)} style={{ width:"100%", padding:"14px", borderRadius:12, background:"#1a1a1a", color:"white", fontSize:14, fontWeight:600 }}>保存して閉じる</button>
          </div>
        </div>
      )}

      {/* ── Recipe Modal ── */}
      {recipeForm && (
        <div className="modal-overlay" onClick={()=>setRecipeForm(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:20, fontWeight:700 }}>{recipeForm.id?"レシピ編集":"レシピ追加"}</h3>
              <button className="btn" onClick={()=>setRecipeForm(null)} style={{ width:32, height:32, borderRadius:"50%", background:"#F0F0EE", fontSize:16, color:"#666" }}>✕</button>
            </div>
            {[{key:"name",label:"料理名",ph:"例: 肉じゃが"},{key:"tag",label:"タグ",ph:"例: 和食"},{key:"ingredients",label:"材料",ph:"例: 鶏肉, 玉ねぎ"}].map(f=>(
              <div key={f.key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:12, fontWeight:600, color:"#888", display:"block", marginBottom:6 }}>{f.label}</label>
                <input value={recipeForm[f.key]} onChange={e=>setRecipeForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #E0E0E0", fontSize:14, outline:"none", background:"#FAFAF8" }}/>
              </div>
            ))}
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:600, color:"#888", display:"block", marginBottom:6 }}>メモ</label>
              <textarea value={recipeForm.memo} onChange={e=>setRecipeForm(p=>({...p,memo:e.target.value}))} placeholder="作り方のコツなど..." rows={3}
                style={{ width:"100%", padding:"12px 14px", borderRadius:10, border:"1px solid #E0E0E0", fontSize:14, outline:"none", background:"#FAFAF8", resize:"none" }}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:recipeForm.id?"1fr 1fr":"1fr", gap:10 }}>
              {recipeForm.id&&<button className="btn" onClick={()=>{ saveRecipes(recipes.filter(r=>r.id!==recipeForm.id)); setRecipeForm(null); }}
                style={{ padding:"13px", borderRadius:12, background:"#FFE5E5", color:"#c0392b", fontSize:13, fontWeight:600 }}>削除</button>}
              <button className="btn" onClick={()=>{
                if(!recipeForm.name) return;
                const updated=recipeForm.id?recipes.map(r=>r.id===recipeForm.id?recipeForm:r):[...recipes,{...recipeForm,id:Date.now()}];
                saveRecipes(updated); setRecipeForm(null);
              }} style={{ padding:"13px", borderRadius:12, background:"#1a1a1a", color:"white", fontSize:13, fontWeight:600 }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
