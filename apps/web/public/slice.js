(function(){var e=()=>Math.random().toString(36).slice(2,10)+Date.now().toString(36);function t(){let e={url:location.href,path:location.pathname,title:document.title,product:null};for(let t of Array.from(document.querySelectorAll(`script[type="application/ld+json"]`)))try{let n=JSON.parse(t.textContent??`null`),r=Array.isArray(n)?n:n?.[`@graph`]?n[`@graph`]:[n];for(let t of r){if(!t||typeof t!=`object`)continue;let n=t[`@type`],r=Array.isArray(n)?n:[n];if(r.includes(`Product`)){let n=Array.isArray(t.offers)?t.offers[0]:t.offers,r=t.brand;e.product={id:t.productID??t.sku,sku:t.sku,name:t.name,brand:typeof r==`string`?r:r?.name,price:n?.price===void 0?void 0:Number(n.price),url:t.url??location.href}}if(r.includes(`BreadcrumbList`)&&!e.category){let n=t.itemListElement??[],r=n[n.length-1];r&&typeof r.name==`string`&&!e.product&&(e.category=r.name)}}}catch{}e.category??=(e=>document.querySelector(`meta[name="${e}"]`)?.content??void 0)(`slice:category`);let t=new URLSearchParams(location.search).get(`q`);return t&&(e.query=t),e}function n(){if(document.getElementById(`slice-root`))return;let n=document.querySelector(`script[data-slice-key]`),r=n?.dataset.sliceKey;if(!r){console.warn(`[slice] add data-slice-key to the slice.js script tag`);return}let i={profile:`slice:${r}:profile`,session:`slice:${r}:session`,transcript:`slice:${r}:transcript`,signals:`slice:${r}:signals`,open:`slice:${r}:open`,teased:`slice:${r}:teased`},a=(e,t=localStorage)=>{try{return t.getItem(e)}catch{return null}},o=(e,t,n=localStorage)=>{try{t===null?n.removeItem(e):n.setItem(e,t)}catch{}},s=a(i.session,sessionStorage);s||(s=e(),o(i.session,s,sessionStorage));let c=()=>{try{let e=JSON.parse(a(i.signals,sessionStorage)??`[]`);return Array.isArray(e)?e:[]}catch{return[]}},l=e=>o(i.signals,JSON.stringify(e.slice(-40)),sessionStorage),u=(e,t,n)=>{if(typeof t!=`string`||!t)return;let r=c();r.push({type:e,id:t,at:Date.now(),...n===void 0?{}:{ms:n}}),l(r)},d=t(),f=d.product?.id??d.product?.sku;if(f){let e=Date.now();u(`view`,f,0);let t=()=>{let t=c();for(let n=t.length-1;n>=0;n--)if(t[n].type===`view`&&t[n].id===f&&t[n].at>=e){t[n].ms=Date.now()-e;break}l(t)};window.addEventListener(`pagehide`,t),document.addEventListener(`visibilitychange`,()=>document.visibilityState===`hidden`&&t())}window.addEventListener(`slice:track`,e=>{let t=e.detail??{};(t.type===`cart`||t.type===`view`||t.type===`click`)&&u(t.type,t.id)}),window.slice={track:u};let p=new URL(n.src,location.href).origin,m=()=>{let e=document.createElement(`div`);e.id=`slice-root`;let t=e.attachShadow({mode:`open`});t.innerHTML=`
      <style>
  :host { all: initial; }
  * { box-sizing: border-box; }
  .launcher {
    position: fixed; right: 20px; bottom: 20px; z-index: 2147483646;
    height: 52px; padding: 0 18px 0 14px; border: 0; border-radius: 999px; cursor: pointer;
    background: #141414; color: #fff; display: flex; align-items: center; gap: 10px;
    font: 500 14px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.22);
    transition: transform .2s ease, box-shadow .2s ease, opacity .15s ease, visibility 0s;
  }
  .launcher:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgb(0 0 0 / 0.26); }
  /* The open panel takes the launcher's spot; the panel's own header closes it. */
  .launcher[aria-expanded="true"] {
    opacity: 0; transform: scale(.85); visibility: hidden; pointer-events: none;
    transition: transform .15s ease, opacity .15s ease, visibility 0s .15s;
  }
  .teaser {
    position: fixed; right: 20px; bottom: 84px; z-index: 2147483646;
    max-width: 280px; padding: 12px 14px; border-radius: 14px; background: #fff; color: #141414;
    font: 400 13.5px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.16); border: 1px solid rgb(0 0 0 / 0.06);
    cursor: pointer; opacity: 0; transform: translateY(6px); transition: opacity .3s ease, transform .3s ease;
  }
  .teaser.show { opacity: 1; transform: none; }
  .teaser[hidden] { display: none; }
  .teaser strong { display: block; font-weight: 600; margin-bottom: 2px; }
  .teaser .x { position: absolute; top: 6px; right: 8px; border: 0; background: none; cursor: pointer; color: #888; font-size: 14px; }
  .panel {
    position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    width: min(440px, calc(100vw - 32px));
    height: min(740px, calc(100vh - 32px));
    height: min(740px, calc(100dvh - 32px));
    border: 0; border-radius: 22px; background: #fff;
    box-shadow: 0 24px 64px rgb(0 0 0 / 0.24), 0 0 0 1px rgb(0 0 0 / 0.06);
    transform-origin: bottom right;
    opacity: 1; transform: none; transition: opacity .2s ease, transform .25s cubic-bezier(.22, 1, .36, 1);
  }
  .panel[hidden] { display: block; opacity: 0; transform: translateY(12px) scale(.96); pointer-events: none; }
  @media (max-width: 640px) {
    .panel { right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; }
  }
</style>
      <iframe class="panel" title="Slice concierge" hidden allow="clipboard-write"></iframe>
      <div class="teaser" hidden role="button" tabindex="0">
        <button class="x" type="button" aria-label="Dismiss">×</button>
        <strong>Can't decide?</strong>
        <span>Tell me three things you love and I'll pick what matches your taste.</span>
      </div>
      <button class="launcher" type="button" aria-label="Open Slice concierge" aria-expanded="false">
        <svg viewBox="0 0 49 34" width="24" height="17" aria-hidden="true"><path d="M15.4992 0H36.5808L21.0816 22.9729H0L15.4992 0Z" fill="#FFE642"/><path d="M16.4224 25.102L10.4192 34H32.5008L48 11.0271H31.7024L22.2064 25.102H16.4224Z" fill="#FF7900"/></svg><span class="label">Curated for you</span>
      </button>
    `;let n=t.querySelector(`iframe`),l=t.querySelector(`.launcher`),f=t.querySelector(`.teaser`),m=new URL(p).origin,h=()=>{let e=[];try{e=JSON.parse(a(i.transcript,sessionStorage)??`[]`)}catch{e=[]}n.contentWindow?.postMessage({type:`slice:context`,key:r,sessionId:s,profileId:a(i.profile),page:d,messages:e,signals:c(),mobile:window.matchMedia(`(max-width: 640px)`).matches},m)},g=()=>{f.classList.remove(`show`),f.hidden=!0},_=()=>{n.src||=`${p}/embed/concierge?key=${encodeURIComponent(r)}`},v=e=>{e&&_(),n.hidden=!e,l.setAttribute(`aria-expanded`,String(e)),o(i.open,e?`1`:null,sessionStorage),e&&g()};if(l.addEventListener(`click`,()=>v(n.hidden)),f.addEventListener(`click`,e=>{e.target.classList.contains(`x`)?(g(),o(i.teased,`1`)):v(!0)}),window.addEventListener(`message`,e=>{if(e.origin!==m||e.source!==n.contentWindow)return;let t=e.data;switch(t?.type){case`slice:ready`:h();break;case`slice:state`:o(i.profile,t.profileId??null),o(i.transcript,JSON.stringify(t.messages??[]).slice(0,4e5),sessionStorage);break;case`slice:navigate`:u(`click`,t.productId),typeof t.url==`string`&&(location.href=t.url);break;case`slice:close`:v(!1),l.focus({preventScroll:!0})}}),document.body.append(e),a(i.open,sessionStorage)===`1`)v(!0);else if(a(i.profile)||a(i.transcript,sessionStorage)){let e=window.requestIdleCallback;e?e(_,{timeout:2500}):setTimeout(_,1200)}else!a(i.teased)&&!a(i.profile)&&setTimeout(()=>{n.hidden&&(f.hidden=!1,requestAnimationFrame(()=>f.classList.add(`show`)),setTimeout(g,14e3))},6e3)},h=`slice:${r}:allowed`;a(h,sessionStorage)===`1`?m():fetch(`${p}/api/widget/ping`,{method:`POST`,body:JSON.stringify({key:r,page:location.pathname,version:`0.1.0`})}).then(e=>e.ok?e.json():null).then(e=>{e?.allowed?(o(h,`1`,sessionStorage),m()):console.warn(`[slice] ${location.hostname} isn't an allowed domain for this store. Add it on the Install page in Slice.`)}).catch(()=>console.warn(`[slice] couldn't reach Slice, so the concierge stays hidden`))}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,n):n()})();