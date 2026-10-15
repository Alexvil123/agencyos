// Up to two initials for an avatar, e.g. "Nanjil Manohar S" -> "NM".
export const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
