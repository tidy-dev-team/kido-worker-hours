// ===================== HEBREW CALENDAR ENGINE =====================
export function hIsLeap(y){return (7*y+1)%19<7;}
export function hElapsed(y){const m=Math.floor((235*y-234)/19),p=12084+13753*m;let d=m*29+Math.floor(p/25920);if((3*(d+1))%7<3)d++;return d;}
export function hYearLen(y){return hElapsed(y+1)-hElapsed(y);}
export function hMonLen(m,y){if([1,3,5,7,11].includes(m))return 30;if([2,4,6,10].includes(m))return 29;if(m===8)return hYearLen(y)%10===5?30:29;if(m===9)return hYearLen(y)%10===3?29:30;if(m===12)return hIsLeap(y)?30:29;if(m===13)return 29;return 0;}
export function hLastMon(y){return hIsLeap(y)?13:12;}
export function gFixed(y,m,d){const y1=y-1;return 365*y1+Math.floor(y1/4)-Math.floor(y1/100)+Math.floor(y1/400)+Math.floor((367*m-362)/12)+(m<=2?0:(y%4===0&&(y%100!==0||y%400===0)?-1:-2))+d;}
export function hFixed(hy,hm,hd){const epoch=-1373428;let f=epoch+hElapsed(hy)+hd-1;if(hm<7){for(let i=7;i<=hLastMon(hy);i++)f+=hMonLen(i,hy);for(let i=1;i<hm;i++)f+=hMonLen(i,hy);}else{for(let i=7;i<hm;i++)f+=hMonLen(i,hy);}return f;}
export function fixedToStr(f){let y=Math.floor((f-1)/365.2425)+1;while(gFixed(y+1,1,1)<=f)y++;while(gFixed(y,1,1)>f)y--;const isLeap=y%4===0&&(y%100!==0||y%400===0);const md=isLeap?[0,31,29,31,30,31,30,31,31,30,31,30,31]:[0,31,28,31,30,31,30,31,31,30,31,30,31];let rem=f-gFixed(y,1,1)+1,mo=1;while(mo<12&&rem>md[mo]){rem-=md[mo];mo++;}return`${y}-${String(mo).padStart(2,'0')}-${String(rem).padStart(2,'0')}`;}
export function hToStr(hy,hm,hd){return fixedToStr(hFixed(hy,hm,hd));}
export function fixedDow(f){return((f%7)+7)%7;}

export const _holidayCache={};
export function getHolidays(gYear){
  if(_holidayCache[gYear])return _holidayCache[gYear];
  const res={};
  function add(s,name,type){if(s&&s.startsWith(String(gYear)))res[s]={name,type};}
  [gYear+3760,gYear+3761].forEach(hy=>{
    const adar=hIsLeap(hy)?13:12;
    add(hToStr(hy,adar,13),'ערב פורים','eve');
    add(hToStr(hy,adar,14),'פורים','holiday');
    add(hToStr(hy,1,14),'ערב פסח','eve');
    add(hToStr(hy,1,15),"פסח א'",'holiday');
    add(hToStr(hy,1,21),"פסח ז'",'holiday');
    // Yom HaAtzmaut with postponement rules
    const atzF=hFixed(hy,2,5),dow=fixedDow(atzF);
    const off=dow===6||dow===5?-2:dow===0?1:0;
    add(fixedToStr(atzF+off-2),'ערב יום הזיכרון','eve');
    add(fixedToStr(atzF+off-1),'יום הזיכרון','holiday');
    add(fixedToStr(atzF+off),'יום העצמאות','holiday');
    add(hToStr(hy,3,5),'ערב שבועות','eve');
    add(hToStr(hy,3,6),'שבועות','holiday');
    add(hToStr(hy,6,29),'ערב ראש השנה','eve');
    add(hToStr(hy,7,1),'ראש השנה','holiday');
    add(hToStr(hy,7,2),"ראש השנה ב'",'holiday');
    add(hToStr(hy,7,9),'ערב יום כיפור','eve');
    add(hToStr(hy,7,10),'יום כיפור','holiday');
    add(hToStr(hy,7,14),'ערב סוכות','eve');
    add(hToStr(hy,7,15),'סוכות','holiday');
    add(hToStr(hy,7,21),'הושענא רבה','eve');
    add(hToStr(hy,7,22),'שמיני עצרת','holiday');
  });
  _holidayCache[gYear]=res;
  return res;
}
