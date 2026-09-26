import { MASTERY } from './mastery.js';
import { CHAPTERS, CHARACTERS, WEAPONS, CREW_RECORDS, characterUnlocked } from './adventure.js';

const positions = [[12,66],[28,38],[44,65],[60,37],[76,60],[88,24]];
const portrait = id => {
  const shape = id === 'octo'
    ? '<path d="M25 49Q7 79 20 78L30 63Q22 90 38 81L42 62Q44 92 55 80L56 61Q74 91 73 70L63 49" fill="#ae83d1"/><ellipse cx="44" cy="36" rx="26" ry="29" fill="#bf97df"/>'
    : id === 'shark' ? '<path d="M18 60 13 19 36 32Q64 12 77 43L86 50 67 56 58 76 28 77Z" fill="#8daecc"/><path d="m28 59 43-9-13 17H37Z" fill="#f4ebd3"/>'
      : id === 'turtle' ? '<ellipse cx="42" cy="51" rx="32" ry="29" fill="#477a58"/><path d="m40 30 18 13-7 22-24-1-7-22Z" fill="#a6bc73"/><circle cx="67" cy="29" r="16" fill="#b7cf87"/><path d="M15 64 9 80 27 73M53 71l9 11 8-14" fill="#a6bc73"/>'
        : '<path d="m21 69 4-42 20-18 9 19Q70 24 76 38l12 8-17 7-14 23-16 3-14-9-15 10Z" fill="#83bfbd"/><path d="M38 45q5 33 22 20L53 78 38 74Z" fill="#d5e6c7"/>';
  return `<svg viewBox="0 0 100 90" aria-hidden="true">${shape}<circle cx="${id==='octo'?35:66}" cy="${id==='octo'?39:36}" r="3" fill="#26494a"/>${id==='octo'?'<circle cx="53" cy="39" r="3" fill="#26494a"/>':''}</svg>`;
};

export function createAdventureUI({ getProfile, onLoadout, onLaunch }) {
  const $ = id => document.getElementById(id);
  let selected = Math.min(getProfile().story.cleared, CHAPTERS.length-1);
  function render() {
    const profile = getProfile(), cleared = profile.story.cleared;
    selected = Math.min(selected, cleared, CHAPTERS.length-1);
    $('campaign-progress').textContent = cleared === 6 ? 'The island is free. Replay any chapter.' : `${cleared} / 6 chapters restored`;
    $('island-nodes').replaceChildren(...CHAPTERS.map((chapter,index) => {
      const button = document.createElement('button');
      button.className = `island-node${index<cleared?' cleared':''}`;
      button.style.left=positions[index][0]+'%';button.style.top=positions[index][1]+'%';
      button.disabled=index>cleared;button.setAttribute('aria-pressed',String(index===selected));
      button.setAttribute('aria-label',`Chapter ${index+1}: ${chapter.title}${index>cleared?' · locked':index<cleared?' · completed':''}`);
      const number=document.createElement('strong');number.textContent=index<cleared?'✓':String(index+1);
      const title=document.createElement('span');title.textContent=chapter.place;
      button.append(number,title);button.onclick=()=>{selected=index;render();};return button;
    }));
    const chapter=CHAPTERS[selected];
    $('chapter-number').textContent=`CHAPTER ${String(selected+1).padStart(2,'0')} / ${chapter.length.toLocaleString()} M`;
    $('chapter-title').textContent=chapter.title;
    $('chapter-speaker').textContent=chapter.speaker+' · incoming transmission';
    $('chapter-dialogue').textContent=chapter.intro;
    const goal=chapter.objective==='boss'?`Defeat ${chapter.final?'Overlord Static':selected===3?'Clawbreaker':'Scarlet Manta'}`:chapter.objective==='records'?`Collect ${chapter.target} records`:chapter.objective==='enemies'?`Defeat ${chapter.target} patrols`:`Rescue ${chapter.target} friends`;
    $('chapter-objective').textContent=`${goal} and reach the exit.`;
    $('chapter-unlock').textContent=selected<cleared?`Completed · best ${profile.story.bests[chapter.id].toLocaleString()} pts`:`+${chapter.reward} banked records · ${chapter.unlock}`;
    $('chapter-launch').textContent=selected<cleared?'Replay chapter ↗':'Start chapter ↗';
    $('crew-cards').replaceChildren(...CHARACTERS.map(character=>{
      const card=document.createElement('button'), unlocked=characterUnlocked(character,profile);
      card.className='crew-card';card.disabled=!unlocked;card.style.setProperty('--crew-color',character.color);
      card.setAttribute('aria-pressed',String(profile.loadout.character===character.id));
      card.innerHTML=portrait(character.id);
      const name=document.createElement('strong');name.textContent=`${character.name} · ${character.species}`;
      const ability=document.createElement('b');ability.textContent=`${character.ability} · C · ${character.cooldown}s cooldown`;
      const description=document.createElement('span');description.textContent=character.description;
      const status=document.createElement('small');status.textContent=!unlocked?`${profile.totalRecords} / ${CREW_RECORDS[character.id]} lifetime records · or complete chapter ${character.chapter}`:profile.loadout.character===character.id?'SELECTED':'Select character';
      const mastery=document.createElement('small'), challenge=MASTERY[character.id];
      mastery.textContent = profile.mastery[character.id] >= challenge.target ? '★ '+challenge.outfit+' outfit unlocked' : challenge.label+' · '+profile.mastery[character.id]+' / '+challenge.target;
      card.append(name,ability,description,mastery,status);
      card.onclick=()=>{onLoadout('character',character.id);render();};return card;
    }));
    let outfit = document.getElementById('mastery-outfit');
    if (!outfit) { outfit = document.createElement('button'); outfit.id = 'mastery-outfit'; $('crew-cards').after(outfit); }
    const current = profile.loadout.character, unlockedOutfit = profile.mastery[current] >= MASTERY[current].target;
    outfit.disabled = !unlockedOutfit;
    outfit.textContent = unlockedOutfit ? (profile.loadout.outfit === 'mastery' ? 'Wearing '+MASTERY[current].outfit+' · Switch to classic' : 'Wear '+MASTERY[current].outfit) : 'Complete mastery to unlock an outfit';
    outfit.setAttribute('aria-pressed', String(profile.loadout.outfit === 'mastery'));
    outfit.onclick = () => { onLoadout('outfit', profile.loadout.outfit === 'mastery' ? 'classic' : 'mastery'); render(); };
    $('weapon-cards').replaceChildren(...WEAPONS.map(weapon=>{
      const button=document.createElement('button');button.className='weapon-card';button.disabled=weapon.chapter>cleared;
      button.setAttribute('aria-pressed',String(profile.loadout.weapon===weapon.id));
      const title=document.createElement('strong');title.textContent=weapon.name;
      const description=document.createElement('span');description.textContent=weapon.description;
      const status=document.createElement('small');status.textContent=weapon.chapter>cleared?`Complete chapter ${weapon.chapter}`:profile.loadout.weapon===weapon.id?'EQUIPPED':'Equip weapon';
      button.append(title,description,status);button.onclick=()=>{onLoadout('weapon',weapon.id);render();};return button;
    }));
  }
  $('adventure-close').onclick=()=>$('adventure').close();
  $('chapter-launch').onclick=()=>{
    if(selected>getProfile().story.cleared)return;
    $('adventure').close();onLaunch(CHAPTERS[selected].id);
  };
  return {
    render,
    open(crew=false,chapterId) {
      if(chapterId) selected=Math.max(0,CHAPTERS.findIndex(chapter=>chapter.id===chapterId));
      else if(!crew) selected=Math.min(getProfile().story.cleared,CHAPTERS.length-1);
      render();$('crew-details').open=crew;$('adventure').showModal();
      if(crew)$('crew-details').scrollIntoView({block:'start'});else $('adventure').scrollTop=0;
    },
  };
}
