import 'server-only';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {SalesGrid} from './sales-sheet';
const file=join(process.cwd(),'.sales-snapshot.local.json');
const schema=z.object({organizationId:z.uuid(),fetchedAt:z.iso.datetime(),members:z.array(z.uuid()),tabs:z.array(z.string()),grids:z.record(z.string(),z.unknown())});
type SalesSnapshot={organizationId:string;fetchedAt:string;members:string[];tabs:string[];grids:Record<string,SalesGrid>};
export async function salesSnapshot(org:string):Promise<SalesSnapshot|null>{
 try{const parsed=schema.parse(JSON.parse(await readFile(file,'utf8')));if(parsed.organizationId!==org)return null;return parsed as SalesSnapshot;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('Imported Sales data could not be verified.');}
}
