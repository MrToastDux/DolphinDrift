export const MODIFIERS = Object.freeze({
  none: { name: 'Classic rules', description: 'The original island rhythm.' },
  moon: { name: 'Moon shoes', description: 'Lower gravity. Longer jumps.' },
  turbo: { name: 'Double-time', description: '30% faster. 50% more score.' },
  rich: { name: 'Gold rush', description: 'Each record pays two, in your run and your wallet.' },
  flow: { name: 'Long groove', description: 'Ten seconds to keep your combo alive.' },
  pure: { name: 'Unplugged', description: 'No power pickups or starter supplies. Double score.' },
});

const cosmetic = (category, id, name, price, color, description) => ({category,id,name,price,color,description});
export const SHOP_ITEMS = Object.freeze([
  cosmetic('skin','sunset','Peach sunset',120,'#efac88','Warm peach skin and coral fins.'),
  cosmetic('skin','abyss','Deep sea',160,'#577fa5','Midnight blue with icy highlights.'),
  cosmetic('skin','cherry','Cherry soda',190,'#dc7398','Pink skin with berry accents.'),
  cosmetic('skin','lime','Lime splash',220,'#b7d967','Citrus green from snout to tail.'),
  cosmetic('skin','pearl','Pearlescent',300,'#d8d9e9','Pale lavender with a pearl sheen.'),
  cosmetic('skin','lava','Lava lamp',350,'#ed7957','Hot orange and deep coral.'),
  cosmetic('board','board-sunset','Sunset stripe',80,'#efac88','A peach deck with a cream racing stripe.'),
  cosmetic('board','board-ocean','Ocean racer',100,'#79bdea','A blue deck with a bright white stripe.'),
  cosmetic('board','board-orchid','Orchid cruiser',120,'#b497dc','Lavender deck and gold stripe.'),
  cosmetic('board','board-carbon','Carbon club',160,'#536276','Charcoal deck and neon mint stripe.'),
  cosmetic('board','board-gold','Gold standard',240,'#e5c575','A golden deck for the high life.'),
  cosmetic('trail','trail-bubbles','Bubble wake',70,'#b7edee','Floating bubbles follow your feet.'),
  cosmetic('trail','trail-sunset','Sunset ribbon',90,'#ffb591','A warm coral ribbon.'),
  cosmetic('trail','trail-electric','Electric blue',110,'#82d7ff','A bright blue wake.'),
  cosmetic('trail','trail-stars','Stardust',160,'#ffe19c','Little golden stars in your wake.'),
  cosmetic('trail','trail-rainbow','Rainbow road',240,'#dc9ce5','A moving spectrum behind you.'),
  cosmetic('hat','hat-crown','Kingston crown',180,'#e5c575','A three-point crown for island royalty.'),
  cosmetic('hat','hat-visor','Neon visor',120,'#89edd6','A futuristic visor over your headphones.'),
  cosmetic('hat','hat-sailor','Sailor cap',90,'#e7ece5','A white cap with a navy band.'),
  cosmetic('hat','hat-flower','Hibiscus',100,'#ef96b4','A pink island flower on your cap.'),
  cosmetic('skin','skin-orca','Orca outlaw',280,'#34465b','Midnight skin, a white belly and bright eye patches.'),
  cosmetic('skin','skin-koi','Koi club',300,'#f3cfb6','Cream skin with orange koi markings.'),
  cosmetic('skin','skin-cosmic','Cosmic swimmer',380,'#8971d9','Violet skin scattered with little golden stars.'),
  cosmetic('skin','skin-cyber','Cyber circuit',420,'#42657b','Dark chrome with luminous mint circuit strips.'),
  cosmetic('skin','skin-ice','Glacier glass',320,'#a4e5f3','Icy blue skin and crystalline shoulder plates.'),
  cosmetic('skin','skin-dragon','Dragonfruit',260,'#f288b4','Hot pink skin, dark seeds and lime fins.'),
  cosmetic('board','board-rocket','Pocket rocket',300,'#dd8266','A twin-engine deck with fins and bright exhaust.'),
  cosmetic('board','board-manta','Manta cruiser',340,'#668ed8','Swept wings and a glowing blue core.'),
  cosmetic('board','board-skeleton','Bone rider',260,'#e8ddba','A dark deck wrapped in ivory ribs.'),
  cosmetic('board','board-prism','Prism drive',400,'#a68cdb','A faceted deck with a rainbow of crystal panels.'),
  cosmetic('hat','hat-pirate','Captain Dub',220,'#784d53','A broad pirate tricorn with a skull badge.'),
  cosmetic('hat','hat-antenna','Alien radio',180,'#a4efad','Twin antennae with glowing green tips.'),
  cosmetic('hat','hat-mohawk','Punk tide',200,'#f684b0','A tall row of pink punk spikes.'),
  cosmetic('hat','hat-halo','Angel frequency',250,'#ffe199','A floating gold halo above your headphones.'),
  cosmetic('hat','hat-horns','Reef raider',240,'#e9d5b8','Two curved ivory horns with coral bases.'),
  cosmetic('hat','hat-jelly','Jellyhead',280,'#bba1ed','A lavender jellyfish dome with hanging tendrils.'),
  cosmetic('trail','trail-flames','Afterburner',200,'#ffb263','Orange flame tongues dance in your wake.'),
  cosmetic('trail','trail-notes','Dub echoes',170,'#8ce7c3','Little music notes follow the rhythm.'),
  cosmetic('trail','trail-petals','Sakura drift',190,'#f6accc','A swirl of pink falling petals.'),
  cosmetic('trail','trail-pixels','Pixel leak',210,'#9bc8ff','Blue and violet square fragments.'),
  {id:'magnet-upgrade',category:'upgrade',name:'Magnet amplifier',price:60,step:40,max:3,base:10,seconds:2,description:'+2 seconds of magnet per level.'},
  {id:'flow-upgrade',category:'upgrade',name:'Groove keeper',price:70,step:40,max:3,base:6,seconds:1,description:'+1 second of combo time per level.'},
  {id:'surf-upgrade',category:'upgrade',name:'Longboard battery',price:80,step:50,max:3,base:20,seconds:2,description:'+2 seconds of surfboard flight per level.'},
  {id:'shield-upgrade',category:'upgrade',name:'Bubble stabilizer',price:60,step:35,max:3,base:12,seconds:2,description:'+2 seconds of Shield per level. Still absorbs one hit.'},
  {id:'ghost-upgrade',category:'upgrade',name:'Phase tuner',price:80,step:45,max:3,base:6,seconds:1,description:'+1 second of Ghost protection per level.'},
  {id:'spring-upgrade',category:'upgrade',name:'Spring coils',price:60,step:35,max:3,base:12,seconds:2,description:'+2 seconds of Super jump per level. Jump height stays the same.'},
  {id:'dash-upgrade',category:'upgrade',name:'Dash extender',price:90,step:50,max:3,base:3,seconds:0.5,description:'+0.5 seconds of Dub dash per level. Still charges with 25 records.'},
  {id:'supply-magnet',category:'supply',name:'Pocket magnet',price:15,power:'magnet',description:'Start one run with a magnet.'},
  {id:'supply-shield',category:'supply',name:'Safety bubble',price:20,power:'shield',description:'Start one run with a shield.'},
  {id:'supply-spring',category:'supply',name:'Spring laces',price:15,power:'spring',description:'Start one run with super jump.'},
  {id:'supply-dash',category:'supply',name:'Charged cassette',price:15,power:'dash',description:'Start one run with a full dash meter.'},
].map(Object.freeze));
export const findItem = id => SHOP_ITEMS.find(item => item.id === id);
export function itemPrice(item, shop) { return item.category === 'upgrade' ? Math.ceil(1.5 * (item.price + item.step * (shop.upgrades[item.id] || 0))) : item.price; }
export function bonusAt(distance) {
  if (!Number.isFinite(distance) || distance < 500) return null;
  const section = Math.floor((distance - 500) / 1000), start = 500 + section * 1000;
  if (distance >= start + 180) return null;
  const themes = [
    { id: 'reef', name: 'Record Reef', color: '#ffe199', description: 'Three lanes of golden records' },
    { id: 'pearl', name: 'Pearl Lagoon', color: '#e6cfff', description: 'Pearls worth 10 wallet records' },
    { id: 'rainbow', name: 'Rainbow Rush', color: '#a7f6cf', description: 'Double score inside the rainbow' },
  ];
  return { ...themes[section % 3], index: section, start, end: start + 180, progress: (distance - start) / 180 };
}
