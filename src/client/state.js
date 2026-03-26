import { MONTHS } from './constants.js';

// ===================== STATE =====================
// This is a mutable singleton. All modules import this same object reference.
export const state={clients:[],employees:[],matrix:{},currentMonth:'2026-03'};

export function loadState(){
  try{
    const s=localStorage.getItem('wh-state-v3');
    if(s){
      const parsed=JSON.parse(s);
      // Mutate the existing state object so all importers see the change
      Object.keys(state).forEach(k=>delete state[k]);
      Object.assign(state,parsed);
    }else{initDefaultData();}
  }
  catch(e){initDefaultData();}
  if(!state.monthSetup)state.monthSetup={};
  if(!state.vacations)state.vacations={};
  if(!state.weeklySchedule)state.weeklySchedule={};
  if(!state.activeMonths){
    const used=Object.keys(state.matrix||{}).filter(mk=>Object.keys(state.matrix[mk]||{}).length>0);
    state.activeMonths=[...new Set([...used,state.currentMonth])].sort();
  }
}

export function saveState(){localStorage.setItem('wh-state-v3',JSON.stringify(state));}

export function mkClientHours(v){
  const mh={};MONTHS.forEach(mo=>{mh[mo.key]=v;});return mh;
}

export function initDefaultData(){
  state.clients=[
    {id:'c1', name:'Honeydew',                  type:'retainer',monthlyHours:mkClientHours(65)},
    {id:'c2', name:'Munters',                   type:'retainer',monthlyHours:mkClientHours(140)},
    {id:'c3', name:'Maccabi',                   type:'retainer',monthlyHours:mkClientHours(200)},
    {id:'c4', name:'Synch',                     type:'retainer',monthlyHours:mkClientHours(55)},
    {id:'c5', name:'Databin',                   type:'retainer',monthlyHours:mkClientHours(25)},
    {id:'c6', name:'Iguazio',                   type:'retainer',monthlyHours:mkClientHours(65)},
    {id:'c7', name:'Natural Intelligence',       type:'retainer',monthlyHours:mkClientHours(80)},
    {id:'c8', name:'ControlUp - Product',        type:'retainer',monthlyHours:mkClientHours(30)},
    {id:'c9', name:'Jibe',                      type:'retainer',monthlyHours:mkClientHours(50)},
    {id:'c10',name:'Prisma - Product + Dev DS',  type:'retainer',monthlyHours:mkClientHours(60)},
    {id:'c11',name:'Guard.io',                  type:'retainer',monthlyHours:mkClientHours(0)},
    {id:'c12',name:'Appsflyer DS + Design',      type:'retainer',monthlyHours:mkClientHours(45)},
    {id:'c13',name:'MVS',                       type:'project', monthlyHours:mkClientHours(0)},
    {id:'c14',name:'Elbit',                     type:'retainer',monthlyHours:mkClientHours(45)},
    {id:'c15',name:'Claroty',                   type:'retainer',monthlyHours:mkClientHours(108)},
    {id:'c16',name:'Fiverr',                    type:'project', monthlyHours:mkClientHours(10)},
    {id:'c17',name:'Palo Alto',                 type:'retainer',monthlyHours:mkClientHours(60)},
    {id:'c18',name:'Moonactive',                type:'project', monthlyHours:mkClientHours(10)},
    {id:'c19',name:'ישראכרט',                   type:'project', monthlyHours:mkClientHours(0)},
    {id:'c20',name:'Atera',                     type:'retainer',monthlyHours:mkClientHours(110)},
    {id:'c21',name:'DS4DS + Tidy',              type:'project', monthlyHours:mkClientHours(0)},
    {id:'c22',name:'Design Ops (Kido Ops)',      type:'retainer',monthlyHours:mkClientHours(0)},
    {id:'c23',name:'Kido Learning',             type:'project', monthlyHours:mkClientHours(0)},
  ];
  state.employees=[
    {id:'e1', name:'דינה',  role:'ניהול',visible:true,monthlyHours:{'2026-01':135,'2026-02':135,'2026-03':135}},
    {id:'e2', name:'עמית',  role:'',     visible:true,monthlyHours:{}},
    {id:'e3', name:'מעיין', role:'',     visible:true,monthlyHours:{}},
    {id:'e4', name:'אביב',  role:'',     visible:true,monthlyHours:{'2026-01':142}},
    {id:'e5', name:'אתי',   role:'',     visible:true,monthlyHours:{'2026-01':105,'2026-02':105,'2026-03':105}},
    {id:'e6', name:'ארי',   role:'',     visible:true,monthlyHours:{}},
    {id:'e7', name:'ליאורה',role:'',     visible:true,monthlyHours:{'2026-01':105,'2026-02':105,'2026-03':105}},
    {id:'e8', name:'נועה',  role:'',     visible:true,monthlyHours:{'2026-01':130,'2026-02':130,'2026-03':130}},
    {id:'e9', name:'אלעד',  role:'',     visible:true,monthlyHours:{}},
    {id:'e10',name:'סנדרה', role:'',     visible:true,monthlyHours:{}},
    {id:'e11',name:'שני',   role:'',     visible:true,monthlyHours:{}},
    {id:'e12',name:'דימה',  role:'',     visible:true,monthlyHours:{'2026-01':90,'2026-02':90,'2026-03':90}},
    {id:'e13',name:'אדיר',  role:'',     visible:true,monthlyHours:{'2026-01':136}},
    {id:'e14',name:'קרן',   role:'',     visible:true,monthlyHours:{}},
    {id:'e15',name:'עידו',  role:'',     visible:true,monthlyHours:{}},
  ];
  state.matrix={
    '2026-01':{
      'e1':{c1:20},'e2':{c9:60,c4:40},'e3':{c3:50,c6:30,c7:30,c10:15},
      'e4':{c6:20},'e5':{c3:30,c7:20,c12:30},'e6':{c2:50,c3:50,c7:50},
      'e7':{c2:30,c3:50,c5:20,c9:5},'e8':{c17:50,c20:80},'e9':{c1:20,c9:30,c10:30},
      'e10':{c1:40,c5:10,c12:100},'e11':{c2:15,c4:40,c6:50,c9:20},
      'e12':{c15:90},'e13':{c14:45,c15:18,c20:30},'e14':{},'e15':{},
    }
  };
  state.currentMonth='2026-03';
  saveState();
}
