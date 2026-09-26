import { SHOP_ITEMS, findItem, itemPrice } from './catalog.js';
import { purchase, STYLES, levelProgress } from './progression.js';

export function createShop({ getProfile, setProfile, game, onEquip, onPreview }) {
  const $ = id => document.getElementById(id);
  let category = 'skin';
  const names = {skin:'Skins',board:'Boards',trail:'Trails',hat:'Hats',upgrade:'Upgrades',supply:'Supplies'};
  function render() {
    const profile = getProfile(), shop = profile.shop, allowed = game.state === 'ready';
    $('shop-wallet').textContent = profile.wallet.toLocaleString();
    $('shop-availability').textContent = allowed ? 'Buy with banked records. Upgrades are permanent; supplies last one run. Daily uses base durations and never consumes supplies.' : 'Browsing only during a run. Return to the island to buy or equip.';
    $('shop-reset').disabled = !allowed;
    $('shop-tabs').replaceChildren(...Object.entries(names).map(([id,name]) => {
      const button=document.createElement('button');button.textContent=name;button.setAttribute('aria-pressed',String(category===id));
      button.addEventListener('click',()=>{category=id;render();});return button;
    }));
    const items = [...(category === 'skin' ? STYLES.map(style=>({...style,category:'skin',price:0,description:style.id==='classic'?'Your crew member’s original colours.':'Earned with career XP. Available to the whole crew.'})) : []), ...SHOP_ITEMS.filter(item=>item.category===category)];
    $('shop-items').replaceChildren(...items.map(item=>{
      const card=document.createElement('article');card.className='shop-item';
      const art=document.createElement('div');art.className=`item-art art-${category}`;art.style.setProperty('--item-color',item.color || '#d0c795');art.setAttribute('aria-hidden','true');
      art.textContent={skin:'◕',board:'∿',trail:'✧',hat:'♛',upgrade:'↑',supply:'◉'}[category];
      const title=document.createElement('h3');title.textContent=item.name;
      const description=document.createElement('p');description.textContent=item.description;
      const action=document.createElement('button');
      const earned = item.level !== undefined, unlocked = !earned || levelProgress(profile.xp).level >= item.level;
      const owned=earned ? unlocked : shop.owned.includes(item.id),level=shop.upgrades[item.id]||0,stock=shop.supplies[item.id]||0;
      const equipped=category==='skin'?profile.options.style===item.id && profile.loadout.outfit !== 'mastery':shop.equipped[category]===item.id;
      const max=category==='upgrade' && level===item.max || category==='supply' && stock===9;
      const price=itemPrice(item,shop);
      const detail=document.createElement('small');detail.textContent=category==='upgrade'
        ? `Level ${level} / ${item.max} · ${item.base + level * item.seconds}s${max ? ' · Fully upgraded' : ` → ${item.base + (level + 1) * item.seconds}s`}`
        :category==='supply'?`${stock} in your bag · One use each`:owned?'Owned · Cosmetic':'Permanent cosmetic';
      action.textContent=earned && !unlocked ? `Level ${item.level}` : owned?equipped?'Equipped':'Equip':max?'Maxed':`Buy · ${price} ◉`;
      action.disabled=!allowed || !unlocked || max || owned && equipped || !owned && profile.wallet<price;
      action.setAttribute('aria-label',`${action.textContent} ${item.name}`);
      action.addEventListener('click',()=>{
        if(game.state!=='ready')return;
        if(owned){
          const next=getProfile();
          if(category==='skin'){next.options.style=item.id;next.loadout.outfit='classic';}else next.shop.equipped[category]=item.id;
          setProfile(next);onEquip();$('shop-status').textContent=`${item.name} equipped.`;
        }else{
          const result=purchase(getProfile(),item.id);
          if(result.ok)setProfile(result.profile);
          $('shop-status').textContent=result.message;
        }
        render();
        const index=items.findIndex(entry=>entry.id===item.id);
        $('shop-items').children[index]?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
      });
      card.append(art,title,description,detail);
      if (!owned && !max && !earned) {
        const budget=document.createElement('small');budget.className='item-budget';
        budget.textContent=profile.wallet>=price?`Ready to buy · ${profile.wallet-price} records left after purchase`:`${price-profile.wallet} more banked records needed`;
        card.append(budget);
      }
      if (!['upgrade','supply'].includes(category) && onPreview) {
        const preview=document.createElement('button');preview.className='try-on';preview.textContent='Try on';
        preview.setAttribute('aria-label',`Try on ${item.name}`);
        preview.addEventListener('click',()=>{onPreview(item);$('shop-status').textContent=`Previewing ${item.name}. Your equipped items are unchanged.`;});
        card.append(preview);
      }
      card.append(action);return card;
    }));
    const looks=[findItem(profile.options.style)?.name || profile.options.style,...Object.values(shop.equipped).filter(id=>id!=='default').map(id=>findItem(id)?.name)];
    $('equipped-summary').textContent=looks.join(' · ');
  }
  $('shop-reset').addEventListener('click',()=>{
    if(game.state!=='ready')return;
    const profile=getProfile();profile.shop.equipped={board:'default',trail:'default',hat:'default'};profile.options.style='classic';profile.loadout.outfit='classic';
    setProfile(profile);onEquip();render();$('shop-status').textContent='Original look equipped. Your purchases are still owned.';
  });
  return { render };
}
