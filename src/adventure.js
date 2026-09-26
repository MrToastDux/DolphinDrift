// Shared campaign and loadout definitions. Progress is stored by progression.js.
export const CHARACTERS = Object.freeze([
  { id: 'dub', name: 'Dub', species: 'Dolphin', color: '#76b8b7', chapter: 0, ability: 'Echo pulse', cooldown: 14, description: 'Attract records for 4 seconds and gain 5 dash charge.' },
  { id: 'octo', name: 'Inky', species: 'Octopus', color: '#ba8de0', chapter: 1, ability: 'Reef grapple', cooldown: 12, description: 'Grapple the nearest enemy, sweep up nearby records, and vault with brief protection.' },
  { id: 'shark', name: 'Riff', species: 'Shark', color: '#8aa9c7', chapter: 3, ability: 'Shark rush', cooldown: 16, description: 'Smash through ground hazards and enemies for 3 seconds.' },
  { id: 'turtle', name: 'Shelly', species: 'Turtle', color: '#a8c576', chapter: 5, ability: 'Shell guard', cooldown: 18, description: 'Block hazards and reflect enemy fire for 5 seconds.' },
]);
export const WEAPONS = Object.freeze([
  { id: 'pulse', name: 'Sonic pulse', chapter: 0, cooldown: .45, damage: 1, color: '#9ffff0', description: 'Fast, focused shots that seek the nearest enemy. One energy per boss shot.' },
  { id: 'scatter', name: 'Reef chorus', chapter: 2, cooldown: .9, damage: 1, color: '#ffbdcf', description: 'Hit up to three enemies across the track. One energy per boss shot.' },
  { id: 'lance', name: 'Bass lance', chapter: 4, cooldown: 1.2, damage: 3, color: '#ffd482', description: 'Pierce enemies in the target lane. Deals two boss damage for two energy.' },
]);
export const CHAPTERS = Object.freeze([
  { id: 'signal', title: 'The missing beat', place: 'Palm Line', district: 0, length: 450, objective: 'records', target: 20, reward: 100, unlock: 'Inky joins the crew', speaker: 'Inky', intro: 'Dub! Someone stole the island broadcast. Follow the golden records to my workshop. Bring 20 and we can trace the signal.', radio: 'That static is coming from the market. Those patrol bots are guarding something.', outro: 'That is the signal! I am coming with you. My grapple will get us past their patrols.' },
  { id: 'patrol', title: 'Market takeover', place: 'Sunset Market', district: 1, length: 600, objective: 'enemies', target: 5, reward: 150, unlock: 'Reef chorus unlocked', speaker: 'Inky', intro: 'The market is crawling with Static patrols. Break five bots with Q / Fire. Their spare speakers will make a beautiful new weapon.', radio: 'Sentries fire at your position. Wait for the warning to lock, then move!', outro: 'Five patrols down. I wired their speakers into a Reef chorus: one shot, three targets.' },
  { id: 'rescue', title: 'Jailbreak at the docks', place: 'Neon Harbour', district: 2, length: 700, objective: 'rescues', target: 3, reward: 200, unlock: 'Riff joins the crew', speaker: 'Riff', intro: 'Hey, up there! Three of us are trapped in signal cages. Run through the glowing lifebuoys to free us. I owe you a shark-sized favour.', radio: 'Follow the clear lane. Those glowing rings are our way out.', outro: 'Free at last! Let me lead when the road gets rough. My rush goes straight through their barricades.' },
  { id: 'breaker', title: 'Break the bass line', place: 'Palm Line', district: 0, length: 850, objective: 'boss', target: 1, boss: 0, armor: 5, reward: 250, unlock: 'Bass lance unlocked', speaker: 'Dub', intro: 'Clawbreaker is powering the stolen broadcast. Dodge his cannon, then fire back. We have to break every armor plate before the exit.', radio: 'Save your Tidal blast for the arena. A perfect deflection refunds your shot.', outro: 'The first relay is ours. This amplifier turns a sonic shot into a piercing Bass lance.' },
  { id: 'manta', title: 'Wings over Kingston', place: 'Sunset Market', district: 1, length: 950, objective: 'boss', target: 1, boss: 1, armor: 6, reward: 300, unlock: 'Shelly joins the crew', speaker: 'Shelly', intro: 'Scarlet Manta has the last relay. Her missiles come in pairs. Break her armor and I will help you reach the broadcast tower.', radio: 'Move after the missiles launch. Fire in the mint window to return the whole volley.', outro: 'Beautiful timing. My shell can reflect their fire. Together we can bring our music home.' },
  { id: 'finale', title: 'The last frequency', place: 'Static Citadel', district: 2, length: 1200, objective: 'boss', target: 1, boss: 2, armor: 10, final: true, reward: 500, unlock: 'Island liberated · campaign complete', speaker: 'The crew', intro: 'Overlord Static is inside the tower. He uses all three stolen weapons. Break his ten armor plates and restore the island radio. One crew. One last frequency.', radio: 'This is it. His weapons change after every volley. Watch the reticle, keep moving, and use everything you have.', outro: 'The static fades. Reggae rolls across the water again. Kingston is free, the crew is together, and every road is yours. Thanks for bringing the music home.' },
]);
export const characterById = id => CHARACTERS.find(item => item.id === id) || CHARACTERS[0];
// Collection is lifetime progress, never a purchase or a change to Story order.
export const CREW_RECORDS = Object.freeze({ dub: 0, octo: 100, shark: 300, turtle: 600 });
export function characterUnlocked(character, profile) {
  return character.chapter <= profile.story.cleared || profile.totalRecords >= CREW_RECORDS[character.id];
}
export const weaponById = id => WEAPONS.find(item => item.id === id) || WEAPONS[0];
export const chapterById = id => CHAPTERS.find(item => item.id === id) || CHAPTERS[0];
export function objectiveProgress(game) {
  const chapter = chapterById(game.chapterId);
  const current = chapter.objective === 'boss' ? game.bossDefeats : game.stats?.[chapter.objective] || 0;
  const labels = { records: 'records collected', enemies: 'patrols defeated', rescues: 'friends rescued', boss: 'boss defeated' };
  return { current, target: chapter.target, complete: current >= chapter.target, label: labels[chapter.objective] };
}
