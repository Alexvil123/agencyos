'use client';
/* eslint-disable @next/next/no-img-element -- Local blob preview and private signed group images. */
import {useEffect,useState} from 'react';
export function GroupPhotoField({url}:{url?:string|null}){const [photo,setPhoto]=useState<File>(),[preview,setPreview]=useState('');useEffect(()=>{if(!photo)return;const blob=URL.createObjectURL(photo);void Promise.resolve().then(()=>setPreview(blob));return()=>URL.revokeObjectURL(blob);},[photo]);return <label className="group-photo-field">{(preview||url)&&<img src={preview||url||''} alt="Group profile image preview"/>}<span>Group profile image <small>Optional · PNG, JPEG, WebP · Up to 2 MB</small></span><input name="photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setPhoto(e.target.files?.[0])}/></label>;}
