// Emojis for Team Chat, grouped like a phone keyboard. Plain text characters: nothing is downloaded, and they render with the
// device's own emoji font. Only emojis that every current phone and Windows 11 can draw are listed (no very new ones).
type EmojiGroup={id:string;label:string;icon:string;emojis:string[]};
const split=(value:string)=>[...new Intl.Segmenter('en',{granularity:'grapheme'}).segment(value.replace(/\s+/g,''))].map(part=>part.segment);
export const EMOJI_GROUPS:EmojiGroup[]=[
  {id:'smileys',label:'Smileys',icon:'😀',emojis:split(`
    😀😃😄😁😆😅😂🤣🥲☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🥸🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾🙈🙉🙊`)},
  {id:'people',label:'People and gestures',icon:'👋',emojis:split(`
    👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🦵🦶👂👃🧠👀👁️👅👄💋👶🧒👦👧🧑👨👩🧓👴👵🙍🙎🙅🙆💁🙋🧏🙇🤦🤷👮💂👷🤴👸👳👲🧕🤵👰🤰🤱👼🎅🤶🦸🦹🧙🧚🧛🧜🧝🧞🧟💆💇🚶🏃💃🕺👯🧖🧗🏋️🚴🧘👨‍💻👩‍💻👨‍🎨👩‍🎨👨‍💼👩‍💼🧑‍🤝‍🧑`)},
  {id:'hearts',label:'Hearts and symbols',icon:'❤️',emojis:split(`
    ❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟✅❌❎⭕🛑⛔🚫💯💢♨️🔔🔕✔️✖️➕➖➗♻️⚠️❓❔❕❗‼️⁉️🔴🟠🟡🟢🔵🟣⚫⚪🟤🔶🔷🔸🔹▶️⏸️⏹️⏺️⏭️⏮️🔀🔁🔂◀️🔼🔽⏫⏬⬆️⬇️⬅️➡️↗️↘️↙️↖️↕️↔️🔝🔙🔚🔛🔜🆗🆕🆓🆙🆒🔥✨🌟⭐💫💥💦💨🎉🎊`)},
  {id:'nature',label:'Animals and nature',icon:'🐶',emojis:split(`
    🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🦟🦗🕷️🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🐐🦌🐕🐩🐈🐓🦃🦚🦜🦢🕊️🐇🦝🦨🦦🐁🐀🐿️🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🎋🍃🍂🍁🍄🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐☄️⚡🌈☀️🌤️⛅🌥️☁️🌦️🌧️⛈️🌩️❄️☃️⛄🌬️💧☔`)},
  {id:'food',label:'Food and drink',icon:'🍕',emojis:split(`
    🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🥪🥙🧆🌮🌯🥗🥘🥫🍝🍜🍲🍛🍣🍱🥟🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾🧊🥄🍴🍽️🥣🥡🥢`)},
  {id:'activities',label:'Sports, music and games',icon:'⚽',emojis:split(`
    ⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🏓🏸🏒🏑🥍🏏🥅⛳🏹🎣🥊🥋🎽🛹⛸️🥌🎿⛷️🏂🤼🤸⛹️🤺🤾🏌️🏇🏄🏊🤽🚣🚵🏆🥇🥈🥉🏅🎖️🏵️🎗️🎫🎟️🎪🤹🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🎻🎲♟️🎯🎳🎮🎰🧩`)},
  {id:'travel',label:'Travel and places',icon:'🚗',emojis:split(`
    🚗🚕🚙🚌🚎🏎️🚓🚑🚒🚐🚚🚛🚜🛵🏍️🚲🛴🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩️💺🚁🚀🛸🚢⛵🛶🚤⚓⛽🚧🚦🚥🗺️🗿🗽🗼🏰🏯🏟️🎡🎢🎠⛲⛱️🏖️🏝️🏜️🌋⛰️🏔️🗻🏕️⛺🏠🏡🏢🏣🏤🏥🏦🏨🏩🏪🏫🏬🏭🛕🕌⛪🕍`)},
  {id:'objects',label:'Work and objects',icon:'💻',emojis:split(`
    ⌚📱💻⌨️🖥️🖨️🖱️💾💿📀📷📸📹🎥📞☎️📟📠📺📻⏰⏱️⏲️🕰️⌛⏳📡🔋🔌💡🔦🕯️💸💵💴💶💷💰💳💎⚖️🔧🔨⚒️🛠️⛏️🔩⚙️🧰🧲🔮📿💈⚗️🔭🔬🩺💊💉🧬🦠🧪🌡️🧹🧺🧻🚽🚰🚿🛁🔑🗝️🚪🛋️🛏️🖼️🛍️🎁🎈🎀✉️📩📨📧💌📦📪📫📬📭📮📝📁📂🗂️📅📆🗒️🗓️📇📈📉📊📋📌📍📎🖇️📏📐✂️🗃️🗄️🗑️🔒🔓🔏🔐📚📖🔖🏷️📰🗞️📜📄📃🧾`)},
];
export const EMOJI_COUNT=EMOJI_GROUPS.reduce((n,group)=>n+group.emojis.length,0);
const RECENT_KEY='crm-chat-recent-emoji';
export const RECENT_LIMIT=24;
/** The most recently used emojis first, without repeats. */
export function rememberEmoji(recent:string[],emoji:string){return [emoji,...recent.filter(e=>e!==emoji)].slice(0,RECENT_LIMIT);}
export function readRecentEmoji():string[]{try{const value=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(value)?value.filter((e):e is string=>typeof e==='string').slice(0,RECENT_LIMIT):[];}catch{return [];}}
export function saveRecentEmoji(recent:string[]){try{localStorage.setItem(RECENT_KEY,JSON.stringify(recent));}catch{/* recent emojis are a convenience only */}}
/** Insert text at the caret (or over the selection) and return the new text and where the caret should go; null if it would be too long. */
export function insertAtCaret(text:string,insert:string,start:number,end:number,max=4000){
  const from=Math.max(0,Math.min(start,text.length)),to=Math.max(from,Math.min(end,text.length)),next=text.slice(0,from)+insert+text.slice(to);
  return next.length>max?null:{text:next,caret:from+insert.length};
}
