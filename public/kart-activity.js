export function raceAnnouncement(activity,now){
 const next=activity?.nextRace,remaining=next?.startsAt-now;
 if(!next||remaining<=0||remaining>60000||now>=next.registrationCloses)return null;
 return {id:next.id,text:`Next race is starting in 1 Minute, there are ${activity.counts.driving} players racing right now. Join the race lobby to race.`};
}
export function playerCountText(counts){
 return `Pre-lobby: ${counts.preLobby} · Race lobby: ${counts.raceLobby} · Racing: ${counts.racing} · Time Trial: ${counts.timeTrial}`;
}
