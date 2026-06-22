#!/usr/bin/env node
/** Aplica UI Stake + Royal según referencias en /Documents/referencias */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = path.join(ROOT, 'assets/index-DZfj7dy3.js');

function minify(code) {
  // Solo colapsar espacios; no quitar // (rompe URLs https://...)
  return code.replace(/\s+/g, ' ').trim();
}

function readFn(file, name, until) {
  const raw = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
  const start = raw.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`No ${name} in ${file}`);
  const end = until ? raw.indexOf(until, start + 1) : raw.length;
  if (end < 0) throw new Error(`End marker missing for ${name}`);
  return minify(raw.slice(start, end));
}

let s = fs.readFileSync(BUNDLE, 'utf8');

const nqOldStart = s.indexOf('function NQ');
const nqOldEnd = s.indexOf('const oI=', nqOldStart);
if (nqOldStart < 0 || nqOldEnd < 0) throw new Error('NQ block not found');
const NEW_NQ = readFn('nq-source.js', 'NQ');
s = s.slice(0, nqOldStart) + NEW_NQ + s.slice(nqOldEnd);
console.log('OK: NQ sports/hipismo page');

const wqStart = s.indexOf('function wQ');
const wqEnd = s.indexOf('function xQ', wqStart);
if (wqStart < 0 || wqEnd < 0) throw new Error('wQ not found');
const NEW_WQ = readFn('wq-mq-source.js', 'wQ', 'function KQ');
const NEW_KQ = readFn('wq-mq-source.js', 'KQ');
s = s.slice(0, wqStart) + NEW_WQ + NEW_KQ + s.slice(wqEnd);
console.log('OK: wQ bet slip + KQ mobile nav');

const sqOld =
  'W.jsx(p,{title:"Apuestas"}),W.jsx(h,{icon:ri.live,label:"En vivo",active:i.search.includes("view=live"),onClick:()=>c({view:"live"})}),W.jsx(h,{icon:ri.clock,label:"Próximos",active:i.search.includes("view=upcoming"),onClick:()=>c({view:"upcoming"})}),W.jsx(p,{title:"Deportes"}),W.jsx(h,{icon:ri.soccer,label:"Fútbol",onClick:()=>c({sport:"soccer"})}),W.jsx(h,{icon:ri.basket,label:"Básquet",onClick:()=>c({sport:"basketball"})}),W.jsx(h,{icon:ri.tennis,label:"Tenis",onClick:()=>c({sport:"tennis"})}),W.jsx(h,{icon:ri.horse,label:"Hipismo",onClick:()=>c({sport:"horses"})}),W.jsx(h,{icon:ri.trophy,label:"Todos",onClick:()=>c({})})';

const sqNew =
  'W.jsxs("div",{className:"st-mode-toggle",children:[W.jsx("button",{type:"button",className:"st-mode-btn casino",onClick:()=>u("/"),children:"Casino"}),W.jsx("button",{type:"button",className:"st-mode-btn sports is-active",onClick:()=>c({}),children:"Deportes"})]}),W.jsx(p,{title:"Apuestas"}),W.jsx(h,{icon:ri.live,label:"Eventos en Vivo",active:i.search.includes("view=live"),onClick:()=>c({view:"live"})}),W.jsx(h,{icon:ri.clock,label:"Empezando Pronto",active:i.search.includes("view=upcoming"),onClick:()=>c({view:"upcoming"})}),W.jsx(h,{icon:ri.trophy,label:"Todo",onClick:()=>c({})}),W.jsx(p,{title:"Mejores Deportes"}),W.jsx(h,{icon:ri.soccer,label:"Fútbol",onClick:()=>c({sport:"soccer"})}),W.jsx(h,{icon:ri.basket,label:"Baloncesto",onClick:()=>c({sport:"basketball"})}),W.jsx(h,{icon:ri.tennis,label:"Tenis",onClick:()=>c({sport:"tennis"})}),W.jsx(h,{icon:ri.horse,label:"Hipismo",onClick:()=>c({sport:"horses"})})';

const xqOld = 'W.jsx(wQ,{})]})}function Md({game:e="Este juego"})';
const xqNew = 'W.jsx(wQ,{}),W.jsx(KQ,{})]})}function Md({game:e="Este juego"})';
const hOld = 'style:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 14px",background:b?"#0f212e":"transparent"';
const hNew = 'className:"gd-nav-btn"+(b?" is-active":""),style:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"12px 14px",background:"transparent"';

if (!s.includes(sqOld)) {
  if (s.includes('st-mode-toggle')) console.log('SKIP: SQ sidebar (ya aplicado)');
  else throw new Error('SQ nav block not found');
} else {
  s = s.replace(sqOld, sqNew);
  console.log('OK: SQ sidebar Stake style');
}

if (!s.includes(xqOld)) {
  if (s.includes('W.jsx(KQ,{})')) console.log('SKIP: xQ mobile nav (ya aplicado)');
  else throw new Error('xQ inject point not found');
} else {
  s = s.replace(xqOld, xqNew);
  console.log('OK: xQ mobile nav hook');
}

if (s.includes(hOld)) {
  s = s.replace(hOld, hNew);
  console.log('OK: nav button classes');
} else if (s.includes('gd-nav-btn')) {
  console.log('SKIP: nav button classes (ya aplicado)');
}

const betslipPatches = [
  {
    name: 'talón no se abre al agregar selección',
    old: 'return S.find(g=>g.key===v.key)?S:[...b,v]}),c(!0)},[]),d=l.useCallback(v=>o(S=>S.filter(b=>b.key!==v)),[]),f=l.useCallback(()=>o([]),[]),',
    new: 'return S.find(g=>g.key===v.key)?S:[...b,v]})},[]),d=l.useCallback(v=>o(S=>S.filter(b=>b.key!==v)),[]),f=l.useCallback(()=>{o([]);try{localStorage.removeItem("gd_betslip")}catch{}},[]),',
  },
  {
    name: 'talón persiste en localStorage',
    old: '[r,o]=l.useState([]),[i,s]=l.useState("parlay"),[a,c]=l.useState(!1),u=l.useCallback(v=>{o(S=>{const b=S.filter(g=>g.event_id!==v.event_id);',
    new: '[r,o]=l.useState(()=>{try{const _x=localStorage.getItem("gd_betslip");return _x?JSON.parse(_x):[]}catch{return[]}}),[i,s]=l.useState(()=>{try{const _m=localStorage.getItem("gd_betslip_mode");return _m==="singles"?"singles":"parlay"}catch{return"parlay"}}),[a,c]=l.useState(!1),u=l.useCallback(v=>{o(S=>{const b=S.filter(g=>g.event_id!==v.event_id);',
  },
  {
    name: 'talón guarda en localStorage',
    old: ',m={items:r,mode:i,setMode:s,open:a,setOpen:c,add:u,remove:d,clear:f,totalOdds:h,placeTicket:p};return W.jsx(ik.Provider,{value:m,children:e})}function sk()',
    new: ',m={items:r,mode:i,setMode:s,open:a,setOpen:c,add:u,remove:d,clear:f,totalOdds:h,placeTicket:p};l.useEffect(()=>{try{localStorage.setItem("gd_betslip",JSON.stringify(r)),localStorage.setItem("gd_betslip_mode",i)}catch{}},[r,i]);return W.jsx(ik.Provider,{value:m,children:e})}function sk()',
  },
  {
    name: 'ventana live más corta (2h)',
    old: 'ak=4',
    new: 'ak=2',
  },
];

for (const p of betslipPatches) {
    if (!s.includes(p.old)) {
    if (p.name.includes('talón') && s.includes('localStorage.removeItem("gd_betslip")')) {
      console.log(`SKIP: ${p.name} (ya aplicado)`);
      continue;
    }
    if (p.name.includes('auto') && !s.includes('c(!0)},[]),d=l.useCallback(v=>o(S=>S.filter(b=>b.key!==v)),[]),f=l.useCallback(()=>o([]),[]),')) {
      console.log(`SKIP: ${p.name} (ya aplicado)`);
      continue;
    }
    if (p.name.includes('localStorage') && s.includes('gd_betslip')) {
      console.log(`SKIP: ${p.name} (ya aplicado)`);
      continue;
    }
    if (p.name.includes('live') && s.includes('ak=2')) {
      console.log(`SKIP: ${p.name} (ya aplicado)`);
      continue;
    }
    console.error(`MISSING betslip: ${p.name}`);
    process.exit(1);
  }
  s = s.replace(p.old, p.new);
  console.log(`OK: ${p.name}`);
}

fs.writeFileSync(BUNDLE, s);
console.log('\nPatch Stake/Royal completo.');
