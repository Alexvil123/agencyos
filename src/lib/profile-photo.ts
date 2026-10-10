export const MAX_PHOTO_BYTES=2*1024*1024;
export function photoFormat(bytes:Uint8Array){
 if(bytes.length>MAX_PHOTO_BYTES)throw Error('Photo must be 2 MB or smaller.');
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return {extension:'png',contentType:'image/png'};
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {extension:'jpg',contentType:'image/jpeg'};
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return {extension:'webp',contentType:'image/webp'};
 throw Error('Choose a PNG, JPEG or WebP photo.');
}
