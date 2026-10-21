/* Ads for the static SEO pages. Reads the same switches as the Admin > Ads manager (site/config.adsCfg).
   Nothing is shown unless the admin has turned ads on and set the "Blog and practice pages" place. */
(function(){
  var K='chiku_ads_cfg',P='chiku-typing',KEY='AIzaSyD-TyZMf-CTzI_6zo8M9qOn2F6-yMZZiuU';
  function run(c){
    try{
      if(!c||!c.on)return;var p=(c.s||{}).page;if(!p||!p.n)return;
      var el=document.querySelector('.adslot[data-ad="page"]');if(!el)return;
      if(p.n==='g'){
        if(!(c.g&&c.g.on&&c.g.pub&&/^\d{6,}$/.test(p.id||'')))return;
        if(!document.querySelector('script[src*="adsbygoogle.js"]')){var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(c.g.pub);document.head.appendChild(s)}
        el.innerHTML='<span class="adlab">Advertisement</span><ins class="adsbygoogle" style="display:block" data-ad-client="'+c.g.pub+'" data-ad-slot="'+p.id+'" data-ad-format="auto" data-full-width-responsive="true"></ins>';
        (window.adsbygoogle=window.adsbygoogle||[]).push({});
      }else return;
      el.classList.add('has');
    }catch(e){}
  }
  function parse(j){try{var v=j.fields&&j.fields.adsCfg&&j.fields.adsCfg.stringValue;return v?JSON.parse(v):{}}catch(e){return {}}}
  var cached=null;try{cached=JSON.parse(localStorage.getItem(K)||'null')}catch(e){}
  if(cached&&Date.now()-cached.t<600000){run(cached.c);return}
  fetch('https://firestore.googleapis.com/v1/projects/'+P+'/databases/(default)/documents/site/config?key='+KEY)
    .then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j)return;var c=parse(j);try{localStorage.setItem(K,JSON.stringify({t:Date.now(),c:c}))}catch(e){}run(c)}).catch(function(){});
})();
