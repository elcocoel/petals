// The switch between versions, as a script small enough to run before the first paint. `?v=1`, `?v=2`
// (or an alternative, `?v=2a`) sets the attribute on <html> and is remembered for the session; the key
// `v` flips it. `?off=field,box` is remembered the same way, and JoyLayer strips those parents. `data-joy`
// says the reveals may wait for JoyLayer; if it never comes, the page shows itself anyway. The server's
// `data-version` is this branch's default.
export const SWITCH_SCRIPT = `(function(){try{
var d=document.documentElement,s=sessionStorage,q=new URLSearchParams(location.search),home=d.dataset.version,last=home;
function set(v){var m=/^(\\d+)([a-z]*)$/.exec(v)||[v,home,''];d.dataset.version=m[1];if(m[2])d.dataset.alt=m[2];else delete d.dataset.alt;if(m[1]!=='1')last=v;s.setItem('petals.v',v)}
var off=q.has('off')?q.get('off'):s.getItem('petals.off')||'';s.setItem('petals.off',off);if(off)d.dataset.off=off;
set(q.get('v')||s.getItem('petals.v')||home);
if(d.dataset.version!=='1'){d.dataset.joy='wait';if(off)d.style.visibility='hidden';setTimeout(function(){if(d.dataset.joy==='wait'){delete d.dataset.joy;d.style.visibility=''}},2500)}
addEventListener('keydown',function(e){var t=e.target;if(e.key!=='v'||e.metaKey||e.ctrlKey||e.altKey||(t&&t.closest&&t.closest('input,textarea,select,[contenteditable]')))return;set(d.dataset.version==='1'?last:'1')})
}catch(e){}})()`;
