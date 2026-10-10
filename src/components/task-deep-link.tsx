'use client';
import {useEffect,useRef} from 'react';
import {useSearchParams} from 'next/navigation';
import type {TimeTask} from '@/lib/time-types';
export function TaskDeepLink({tasks,onOpen}:{tasks:TimeTask[];onOpen:(task:TimeTask)=>void}){const id=useSearchParams().get('task'),opened=useRef<string|null>(null);useEffect(()=>{if(!id){opened.current=null;return;}if(opened.current===id)return;const task=tasks.find(t=>t.id===id);if(task){opened.current=id;onOpen(task);}},[id,tasks,onOpen]);return null;}
